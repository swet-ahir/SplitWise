const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const auth = require('../middleware/auth');
const { calculateBalances } = require('../utils/balances');

const router = express.Router();
router.use(auth);

const JWT_SECRET = process.env.JWT_SECRET;
const NAME_MAX = 100;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 200;

// Whitelist of avatar colors. Mirrors AVATAR_COLORS in js/constants.js — keep
// in sync. Restricting to a known list neuters CSS-injection attempts.
const ALLOWED_COLORS = new Set([
  '#5bc5a7', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
  '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#14b8a6',
]);

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      tokenVersion: user.token_version ?? 0,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

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
    const { name, color } = req.body || {};
    const userId = req.user.id;

    if (name === undefined && color === undefined) {
      return res.status(400).json({ error: 'Provide name or color to update' });
    }

    let trimmedName = null;
    if (name !== undefined) {
      trimmedName = String(name).trim();
      if (!trimmedName) return res.status(400).json({ error: 'Name cannot be empty' });
      if (trimmedName.length > NAME_MAX) return res.status(400).json({ error: `Name must be ${NAME_MAX} characters or fewer` });
    }

    let validatedColor = null;
    if (color !== undefined) {
      validatedColor = String(color).toLowerCase();
      if (!ALLOWED_COLORS.has(validatedColor)) {
        return res.status(400).json({ error: 'Invalid color choice' });
      }
    }

    const result = await query(
      `UPDATE users SET
        name = COALESCE($1, name),
        color = COALESCE($2, color)
       WHERE id = $3
       RETURNING id, name, email, color, token_version, created_at`,
      [trimmedName, validatedColor, userId]
    );

    const u = result.rows[0];
    // Re-issue a fresh token so the client's cached name/email matches what the
    // server now stores (without this, JWT-derived display fields go stale until logout).
    const token = signToken(u);
    res.json({ id: u.id, name: u.name, email: u.email, color: u.color, createdAt: u.created_at, token });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/me/password — change password
router.put('/me/password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < PASSWORD_MIN) {
      return res.status(400).json({ error: `New password must be at least ${PASSWORD_MIN} characters` });
    }
    if (newPassword.length > PASSWORD_MAX) {
      return res.status(400).json({ error: `New password must be ${PASSWORD_MAX} characters or fewer` });
    }

    const result = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 10);
    // Bumping token_version invalidates every existing JWT for this user — so a
    // password change actually locks out anyone holding the old token.
    const updated = await query(
      `UPDATE users SET password_hash = $1, token_version = token_version + 1
       WHERE id = $2
       RETURNING id, name, email, token_version`,
      [newHash, userId]
    );

    const token = signToken(updated.rows[0]);
    res.json({ message: 'Password updated successfully', token });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/search?email=x — find user by exact email.
// Returns 200 with {user: null} when not found rather than 404, so an attacker
// can't probe the user directory by status code (account enumeration).
router.get('/search', async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email query parameter is required' });

    const result = await query(
      'SELECT id, name, email, color FROM users WHERE LOWER(email) = LOWER($1)',
      [String(email).trim()]
    );

    if (result.rows.length === 0) return res.json({ user: null });

    const u = result.rows[0];
    res.json({ user: { id: u.id, name: u.name, email: u.email, color: u.color } });
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
