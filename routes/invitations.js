const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/invitations/:token — fetch invitation details (public, token is the auth)
router.get('/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const result = await query(
      `SELECT gi.email, gi.group_id, gi.accepted_at, gi.expires_at,
              g.name AS group_name, u.name AS inviter_name
       FROM group_invitations gi
       JOIN groups g ON g.id = gi.group_id
       JOIN users u ON u.id = gi.invited_by
       WHERE gi.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    const inv = result.rows[0];
    if (inv.accepted_at) {
      return res.status(409).json({ error: 'Invitation already accepted' });
    }
    if (new Date(inv.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Invitation has expired' });
    }

    res.json({
      groupId: inv.group_id,
      groupName: inv.group_name,
      inviterName: inv.inviter_name,
      email: inv.email,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/invitations/:token/accept — accept invitation (requires auth)
router.post('/:token/accept', auth, async (req, res, next) => {
  try {
    const { token } = req.params;
    const userId = req.user.id;

    const result = await query(
      `SELECT gi.*, g.name AS group_name
       FROM group_invitations gi
       JOIN groups g ON g.id = gi.group_id
       WHERE gi.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    const inv = result.rows[0];
    if (inv.accepted_at) {
      return res.status(409).json({ error: 'Invitation already accepted' });
    }
    if (new Date(inv.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Invitation has expired' });
    }

    // Add to group if not already a member
    const memberCheck = await query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [inv.group_id, userId]
    );
    if (memberCheck.rows.length === 0) {
      await query(
        'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
        [inv.group_id, userId]
      );
    }

    await query(
      'UPDATE group_invitations SET accepted_at = NOW() WHERE token = $1',
      [token]
    );

    res.json({ groupId: inv.group_id, groupName: inv.group_name });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
