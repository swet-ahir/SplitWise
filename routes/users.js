const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const auth = require('../middleware/auth');
const { calculateBalances } = require('../utils/balances');

const router = express.Router();
router.use(auth);

// GET /api/users/me — get current user
router.get('/me', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, name, email, color, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const u = result.rows[0];
    res.json({ id: u.id, name: u.name, email: u.email, color: u.color, createdAt: u.created_at });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/me — update name and/or color
router.put('/me', async (req, res, next) => {
  try {
    const { name, color } = req.body;
    const userId = req.user.id;

    if (!name && !color) {
      return res.status(400).json({ error: 'Provide name or color to update' });
    }
    if (name && !name.trim()) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    const result = await query(
      `UPDATE users SET
        name = COALESCE($1, name),
        color = COALESCE($2, color)
       WHERE id = $3
       RETURNING id, name, email, color, created_at`,
      [name ? name.trim() : null, color || null, userId]
    );

    const u = result.rows[0];
    res.json({ id: u.id, name: u.name, email: u.email, color: u.color, createdAt: u.created_at });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/me/password — change password
router.put('/me/password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const result = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/search?email=x — find user by exact email
router.get('/search', async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email query parameter is required' });

    const result = await query(
      'SELECT id, name, email, color FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'No user found with that email' });

    const u = result.rows[0];
    res.json({ id: u.id, name: u.name, email: u.email, color: u.color });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/me/balances — overall balances across all groups
router.get('/me/balances', async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get all groups the user is a member of
    const groupsRes = await query(
      `SELECT g.id FROM groups g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = $1`,
      [userId]
    );

    let totalOwed = 0;
    let totalOwe = 0;
    const byGroup = {};

    for (const { id: groupId } of groupsRes.rows) {
      // Get all members
      const membersRes = await query(
        'SELECT user_id FROM group_members WHERE group_id = $1',
        [groupId]
      );
      const memberIds = membersRes.rows.map(r => r.user_id);

      // Get expenses with splits
      const expensesRes = await query(
        `SELECT e.id, e.paid_by as "paidBy", e.currency,
                json_object_agg(es.user_id, es.amount) as splits
         FROM expenses e
         JOIN expense_splits es ON es.expense_id = e.id
         WHERE e.group_id = $1
         GROUP BY e.id`,
        [groupId]
      );

      // Get settlements
      const settlementsRes = await query(
        'SELECT from_user as "fromUser", to_user as "toUser", amount, currency FROM settlements WHERE group_id = $1',
        [groupId]
      );

      const net = calculateBalances(memberIds, expensesRes.rows, settlementsRes.rows);
      const userBal = net[userId] || 0;

      byGroup[groupId] = parseFloat(userBal.toFixed(2));

      if (userBal > 0.01) totalOwed += userBal;
      else if (userBal < -0.01) totalOwe += Math.abs(userBal);
    }

    res.json({
      totalOwed: parseFloat(totalOwed.toFixed(2)),
      totalOwe: parseFloat(totalOwe.toFixed(2)),
      net: parseFloat((totalOwed - totalOwe).toFixed(2)),
      byGroup,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
