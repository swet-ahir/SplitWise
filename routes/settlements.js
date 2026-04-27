const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');
const { EXCHANGE_RATES } = require('../utils/balances');

const SUPPORTED_CURRENCIES = new Set(Object.keys(EXCHANGE_RATES));
const AMOUNT_MAX = 9_999_999_999.99; // DECIMAL(12,2)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const router = express.Router();
router.use(auth);

// Helper: check if user is member of a group
async function isMember(groupId, userId) {
  const res = await query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  return res.rows.length > 0;
}

// Helper: add notification
async function addNotification(userId, type, message, meta = {}) {
  await query(
    'INSERT INTO notifications (user_id, type, message, meta) VALUES ($1, $2, $3, $4)',
    [userId, type, message, JSON.stringify(meta)]
  );
}

// Helper: build settlement with user objects
async function buildSettlementObject(s) {
  const fromRes = await query('SELECT id, name, color FROM users WHERE id = $1', [s.from_user]);
  const toRes = await query('SELECT id, name, color FROM users WHERE id = $1', [s.to_user]);
  const fromUser = fromRes.rows[0] || { id: s.from_user, name: 'Unknown', color: '#ccc' };
  const toUser = toRes.rows[0] || { id: s.to_user, name: 'Unknown', color: '#ccc' };

  return {
    id: s.id,
    groupId: s.group_id,
    fromUser: { id: fromUser.id, name: fromUser.name, color: fromUser.color },
    toUser: { id: toUser.id, name: toUser.name, color: toUser.color },
    amount: parseFloat(s.amount),
    currency: s.currency,
    date: s.date,
    createdBy: s.created_by,
    createdAt: s.created_at,
  };
}

// GET /api/settlements/groups/:groupId/settlements
router.get('/groups/:groupId/settlements', async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    const member = await isMember(groupId, userId);
    if (!member) return res.status(403).json({ error: 'Not a member of this group' });

    const settlementsRes = await query(
      'SELECT * FROM settlements WHERE group_id = $1 ORDER BY created_at DESC',
      [groupId]
    );

    const settlements = await Promise.all(settlementsRes.rows.map(buildSettlementObject));

    res.json(settlements);
  } catch (err) {
    next(err);
  }
});

// POST /api/settlements/groups/:groupId/settlements
router.post('/groups/:groupId/settlements', async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { from, to, amount, currency = 'USD' } = req.body;

    const member = await isMember(groupId, userId);
    if (!member) return res.status(403).json({ error: 'Not a member of this group' });

    if (!from || !to || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'from, to, and amount are required' });
    }
    if (from === to) {
      return res.status(400).json({ error: 'Payer and recipient must be different' });
    }
    if (!UUID_RE.test(from) || !UUID_RE.test(to)) {
      return res.status(400).json({ error: 'from and to must be valid user IDs' });
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    if (amt > AMOUNT_MAX) {
      return res.status(400).json({ error: `Amount cannot exceed ${AMOUNT_MAX.toLocaleString()}` });
    }
    if (!SUPPORTED_CURRENCIES.has(currency)) {
      return res.status(400).json({ error: 'Unsupported currency' });
    }

    // Both parties must be members of THIS group — settling on behalf of users
    // outside the group used to silently corrupt their overall balance and
    // generate phony notifications.
    const memberCheck = await query(
      'SELECT user_id FROM group_members WHERE group_id = $1 AND user_id = ANY($2::uuid[])',
      [groupId, [from, to]]
    );
    if (memberCheck.rows.length !== 2) {
      return res.status(400).json({ error: 'Both payer and recipient must be members of this group' });
    }

    const date = new Date().toISOString().split('T')[0];

    const settlementRes = await query(
      `INSERT INTO settlements (group_id, from_user, to_user, amount, currency, created_by, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [groupId, from, to, amt, currency, userId, date]
    );
    const settlement = settlementRes.rows[0];

    // Get group name for notifications
    const groupRes = await query('SELECT name FROM groups WHERE id = $1', [groupId]);
    const groupName = groupRes.rows[0]?.name || 'a group';

    // Get user names for notifications
    const fromRes = await query('SELECT name FROM users WHERE id = $1', [from]);
    const toRes = await query('SELECT name FROM users WHERE id = $1', [to]);
    const fromName = fromRes.rows[0]?.name || 'Someone';
    const toName = toRes.rows[0]?.name || 'Someone';

    // Notify recipient
    if (to !== userId) {
      await addNotification(
        to,
        'settled',
        `${fromName} paid you ${parseFloat(amt).toFixed(2)} ${currency} in "${groupName}"`,
        { groupId, settlementId: settlement.id }
      );
    }

    // Notify payer if recorded by someone else
    if (from !== userId) {
      await addNotification(
        from,
        'settled',
        `Your payment of ${parseFloat(amt).toFixed(2)} ${currency} to ${toName} was recorded in "${groupName}"`,
        { groupId, settlementId: settlement.id }
      );
    }

    const settlementObj = await buildSettlementObject(settlement);
    res.status(201).json(settlementObj);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
