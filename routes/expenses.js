const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');

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

// Helper: build expense object with paidBy object and splits map
async function buildExpenseObject(expense) {
  // Get paidBy user
  const payerRes = await query(
    'SELECT id, name, color FROM users WHERE id = $1',
    [expense.paid_by]
  );
  const payer = payerRes.rows[0] || { id: expense.paid_by, name: 'Unknown', color: '#ccc' };

  // Get splits
  const splitsRes = await query(
    'SELECT user_id, amount FROM expense_splits WHERE expense_id = $1',
    [expense.id]
  );
  const splits = {};
  splitsRes.rows.forEach(s => { splits[s.user_id] = parseFloat(s.amount); });

  return {
    id: expense.id,
    groupId: expense.group_id,
    description: expense.description,
    amount: parseFloat(expense.amount),
    currency: expense.currency,
    paidBy: { id: payer.id, name: payer.name, color: payer.color },
    splits,
    category: expense.category,
    date: expense.date,
    createdAt: expense.created_at,
    createdBy: expense.created_by,
  };
}

// Helper: add notification
async function addNotification(userId, type, message, meta = {}) {
  await query(
    'INSERT INTO notifications (user_id, type, message, meta) VALUES ($1, $2, $3, $4)',
    [userId, type, message, JSON.stringify(meta)]
  );
}

// GET /api/expenses/groups/:groupId/expenses
router.get('/groups/:groupId/expenses', async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    const member = await isMember(groupId, userId);
    if (!member) return res.status(403).json({ error: 'Not a member of this group' });

    const expensesRes = await query(
      'SELECT * FROM expenses WHERE group_id = $1 ORDER BY created_at DESC',
      [groupId]
    );

    const expenses = await Promise.all(expensesRes.rows.map(buildExpenseObject));

    res.json(expenses);
  } catch (err) {
    next(err);
  }
});

// POST /api/expenses/groups/:groupId/expenses
router.post('/groups/:groupId/expenses', async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { description, amount, currency = 'USD', paidBy, splitType = 'equal', customSplits = {}, category = 'other', date } = req.body;

    const member = await isMember(groupId, userId);
    if (!member) return res.status(403).json({ error: 'Not a member of this group' });

    if (!description || !description.trim()) return res.status(400).json({ error: 'Description is required' });
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });

    // Get group members
    const membersRes = await query(
      'SELECT user_id FROM group_members WHERE group_id = $1',
      [groupId]
    );
    const memberIds = membersRes.rows.map(r => r.user_id);

    if (!memberIds.includes(paidBy)) {
      return res.status(400).json({ error: 'paidBy user is not a member of this group' });
    }

    // Calculate splits
    let splits = {};
    if (splitType === 'equal') {
      const share = amt / memberIds.length;
      memberIds.forEach(mid => { splits[mid] = parseFloat(share.toFixed(2)); });
      // Fix rounding
      const total = Object.values(splits).reduce((a, b) => a + b, 0);
      const diff = parseFloat((amt - total).toFixed(2));
      if (Math.abs(diff) > 0) splits[paidBy] = parseFloat((splits[paidBy] + diff).toFixed(2));
    } else if (splitType === 'percentage') {
      let totalPct = 0;
      memberIds.forEach(mid => { totalPct += parseFloat(customSplits[mid] || 0); });
      if (Math.abs(totalPct - 100) > 0.01) {
        return res.status(400).json({ error: 'Percentages must add up to 100%' });
      }
      memberIds.forEach(mid => {
        splits[mid] = parseFloat(((parseFloat(customSplits[mid] || 0) / 100) * amt).toFixed(2));
      });
    } else { // exact
      let totalExact = 0;
      memberIds.forEach(mid => { totalExact += parseFloat(customSplits[mid] || 0); });
      if (Math.abs(totalExact - amt) > 0.01) {
        return res.status(400).json({ error: `Amounts must add up to the expense total` });
      }
      memberIds.forEach(mid => {
        splits[mid] = parseFloat(parseFloat(customSplits[mid] || 0).toFixed(2));
      });
    }

    const expenseDate = date || new Date().toISOString().split('T')[0];

    // Insert expense
    const expRes = await query(
      `INSERT INTO expenses (group_id, description, amount, currency, paid_by, category, date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [groupId, description.trim(), amt, currency, paidBy, category, expenseDate, userId]
    );
    const expense = expRes.rows[0];

    // Insert splits
    for (const [memberId, shareAmt] of Object.entries(splits)) {
      await query(
        'INSERT INTO expense_splits (expense_id, user_id, amount) VALUES ($1, $2, $3)',
        [expense.id, memberId, shareAmt]
      );
    }

    // Get payer name for notifications
    const payerRes = await query('SELECT name FROM users WHERE id = $1', [paidBy]);
    const payerName = payerRes.rows[0]?.name || 'Someone';

    // Add notifications to non-payer members
    for (const mid of memberIds) {
      if (mid === paidBy) continue;
      const share = splits[mid] || 0;
      if (share > 0) {
        const sym = currency === 'JPY' || currency === 'KRW' ? '' : '';
        await addNotification(
          mid,
          'expense_added',
          `${payerName} paid for "${description.trim()}" — you owe ${parseFloat(share).toFixed(2)} ${currency}`,
          { groupId, expenseId: expense.id }
        );
      }
    }

    const expenseObj = await buildExpenseObject(expense);
    res.status(201).json(expenseObj);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/expenses/expenses/:id
router.delete('/expenses/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const expRes = await query('SELECT * FROM expenses WHERE id = $1', [id]);
    if (expRes.rows.length === 0) return res.status(404).json({ error: 'Expense not found' });
    const expense = expRes.rows[0];

    // Check: user created it or is group creator
    const groupRes = await query('SELECT created_by FROM groups WHERE id = $1', [expense.group_id]);
    const groupCreator = groupRes.rows[0]?.created_by;

    if (expense.created_by !== userId && groupCreator !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this expense' });
    }

    await query('DELETE FROM expenses WHERE id = $1', [id]);

    res.json({ message: 'Expense deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
