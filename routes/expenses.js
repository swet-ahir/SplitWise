const express = require('express');
const { query, getClient } = require('../db');
const auth = require('../middleware/auth');
const { EXCHANGE_RATES } = require('../utils/balances');

const SUPPORTED_CURRENCIES = new Set(Object.keys(EXCHANGE_RATES));
const SUPPORTED_CATEGORIES = new Set([
  'food', 'transport', 'accommodation', 'entertainment', 'shopping',
  'utilities', 'healthcare', 'travel', 'groceries', 'other',
]);

const DESCRIPTION_MAX = 200; // matches expenses.description VARCHAR(200)
const AMOUNT_MAX = 9_999_999_999.99; // DECIMAL(12,2)
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  const payerRes = await query(
    'SELECT id, name, color FROM users WHERE id = $1',
    [expense.paid_by]
  );
  const payer = payerRes.rows[0] || { id: expense.paid_by, name: 'Unknown', color: '#ccc' };

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

// Helper: add notification (uses caller-provided client to participate in TX)
async function addNotification(client, userId, type, message, meta = {}) {
  await client.query(
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
    const {
      description, amount, currency = 'USD', paidBy,
      splitType = 'equal', customSplits = {},
      category = 'other', date,
    } = req.body || {};

    const member = await isMember(groupId, userId);
    if (!member) return res.status(403).json({ error: 'Not a member of this group' });

    if (!description || !String(description).trim()) {
      return res.status(400).json({ error: 'Description is required' });
    }
    const trimmedDesc = String(description).trim();
    if (trimmedDesc.length > DESCRIPTION_MAX) {
      return res.status(400).json({ error: `Description must be ${DESCRIPTION_MAX} characters or fewer` });
    }

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (amt > AMOUNT_MAX) return res.status(400).json({ error: `Amount cannot exceed ${AMOUNT_MAX.toLocaleString()}` });

    if (!SUPPORTED_CURRENCIES.has(currency)) {
      return res.status(400).json({ error: 'Unsupported currency' });
    }
    if (!SUPPORTED_CATEGORIES.has(category)) {
      return res.status(400).json({ error: 'Unsupported category' });
    }

    let expenseDate = new Date().toISOString().split('T')[0];
    if (date) {
      const s = String(date);
      if (!ISO_DATE_RE.test(s) || isNaN(new Date(s).getTime())) {
        return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format' });
      }
      expenseDate = s;
    }

    if (!['equal', 'percentage', 'exact'].includes(splitType)) {
      return res.status(400).json({ error: 'Invalid split type' });
    }
    if (typeof customSplits !== 'object' || customSplits === null || Array.isArray(customSplits)) {
      return res.status(400).json({ error: 'customSplits must be an object' });
    }

    const membersRes = await query(
      'SELECT user_id FROM group_members WHERE group_id = $1',
      [groupId]
    );
    const memberIds = membersRes.rows.map(r => r.user_id);
    const memberIdSet = new Set(memberIds);

    if (!paidBy || !memberIdSet.has(paidBy)) {
      return res.status(400).json({ error: 'paidBy user is not a member of this group' });
    }

    // Reject any custom-splits keys that aren't members of the group, and any
    // negative values (which previously bypassed sum validation).
    for (const [key, val] of Object.entries(customSplits)) {
      if (!memberIdSet.has(key)) {
        return res.status(400).json({ error: 'customSplits contains a user who is not a member of this group' });
      }
      const num = parseFloat(val);
      if (isNaN(num) || num < 0) {
        return res.status(400).json({ error: 'Split values must be non-negative numbers' });
      }
    }

    let splits = {};
    if (splitType === 'equal') {
      const share = amt / memberIds.length;
      memberIds.forEach(mid => { splits[mid] = parseFloat(share.toFixed(2)); });
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
        return res.status(400).json({ error: 'Amounts must add up to the expense total' });
      }
      memberIds.forEach(mid => {
        splits[mid] = parseFloat(parseFloat(customSplits[mid] || 0).toFixed(2));
      });
    }

    // Wrap the expense, its splits, and notifications in one transaction so a
    // mid-flight failure doesn't leak a half-formed expense row.
    const client = await getClient();
    let expense;
    try {
      await client.query('BEGIN');

      const expRes = await client.query(
        `INSERT INTO expenses (group_id, description, amount, currency, paid_by, category, date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [groupId, trimmedDesc, amt, currency, paidBy, category, expenseDate, userId]
      );
      expense = expRes.rows[0];

      for (const [memberId, shareAmt] of Object.entries(splits)) {
        await client.query(
          'INSERT INTO expense_splits (expense_id, user_id, amount) VALUES ($1, $2, $3)',
          [expense.id, memberId, shareAmt]
        );
      }

      const payerRes = await client.query('SELECT name FROM users WHERE id = $1', [paidBy]);
      const payerName = payerRes.rows[0]?.name || 'Someone';

      for (const mid of memberIds) {
        if (mid === paidBy) continue;
        const share = splits[mid] || 0;
        if (share > 0) {
          await addNotification(
            client,
            mid,
            'expense_added',
            `${payerName} paid for "${trimmedDesc}" — you owe ${parseFloat(share).toFixed(2)} ${currency}`,
            { groupId, expenseId: expense.id }
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    const expenseObj = await buildExpenseObject(expense);
    res.status(201).json(expenseObj);
  } catch (err) {
    next(err);
  }
});

// GET /api/expenses/expenses/:id — fetch a single expense
router.get('/expenses/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const expRes = await query('SELECT * FROM expenses WHERE id = $1', [id]);
    if (expRes.rows.length === 0) return res.status(404).json({ error: 'Expense not found' });
    const expense = expRes.rows[0];

    const member = await isMember(expense.group_id, userId);
    if (!member) return res.status(403).json({ error: 'Not a member of this group' });

    const expenseObj = await buildExpenseObject(expense);
    res.json(expenseObj);
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

    const groupRes = await query('SELECT created_by FROM groups WHERE id = $1', [expense.group_id]);
    const groupCreator = groupRes.rows[0]?.created_by;

    if (expense.created_by !== userId && groupCreator !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this expense' });
    }

    // Clean up notifications referencing this expense so users don't see "you
    // owe X for $description" pointing at a dead row.
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM notifications WHERE meta->>'expenseId' = $1`, [id]);
      await client.query('DELETE FROM expenses WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    res.json({ message: 'Expense deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
