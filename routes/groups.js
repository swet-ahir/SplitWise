const express = require('express');
const crypto = require('crypto');
const { query } = require('../db');
const auth = require('../middleware/auth');
const { calculateBalances, simplifyDebts } = require('../utils/balances');
const { sendInvitationEmail } = require('../utils/email');

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

// Helper: get group with creator check
async function getGroupWithCreator(groupId) {
  const res = await query('SELECT * FROM groups WHERE id = $1', [groupId]);
  return res.rows[0] || null;
}

// Helper: get group members with user info
async function getGroupMembers(groupId) {
  const res = await query(
    `SELECT u.id, u.name, u.email, u.color, u.created_at, gm.joined_at
     FROM group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1
     ORDER BY gm.joined_at ASC`,
    [groupId]
  );
  return res.rows;
}

// Helper: add notification
async function addNotification(userId, type, message, meta = {}) {
  await query(
    'INSERT INTO notifications (user_id, type, message, meta) VALUES ($1, $2, $3, $4)',
    [userId, type, message, JSON.stringify(meta)]
  );
}

// GET /api/groups — get all groups for current user
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const groupsRes = await query(
      `SELECT g.* FROM groups g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = $1
       ORDER BY g.created_at DESC`,
      [userId]
    );

    const groups = await Promise.all(groupsRes.rows.map(async (g) => {
      const members = await getGroupMembers(g.id);

      // Expense count
      const expCountRes = await query('SELECT COUNT(*) FROM expenses WHERE group_id = $1', [g.id]);
      const expenseCount = parseInt(expCountRes.rows[0].count, 10);

      // Calculate user balance
      const expensesRes = await query(
        `SELECT e.id, e.paid_by as "paidBy", e.currency,
                json_object_agg(es.user_id, es.amount) as splits
         FROM expenses e
         JOIN expense_splits es ON es.expense_id = e.id
         WHERE e.group_id = $1
         GROUP BY e.id`,
        [g.id]
      );

      const settlementsRes = await query(
        'SELECT from_user as "fromUser", to_user as "toUser", amount, currency FROM settlements WHERE group_id = $1',
        [g.id]
      );

      const memberIds = members.map(m => m.id);
      const net = calculateBalances(memberIds, expensesRes.rows, settlementsRes.rows);
      const userBalance = net[userId] || 0;

      return {
        id: g.id,
        name: g.name,
        icon: g.icon,
        color: g.color,
        createdBy: g.created_by,
        createdAt: g.created_at,
        members,
        memberCount: members.length,
        expenseCount,
        userBalance,
      };
    }));

    res.json(groups);
  } catch (err) {
    next(err);
  }
});

// POST /api/groups — create a group
router.post('/', async (req, res, next) => {
  try {
    const { name, icon, color, memberEmails = [] } = req.body;
    const userId = req.user.id;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    // Create group
    const groupRes = await query(
      'INSERT INTO groups (name, icon, color, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [name.trim(), icon || '🏠', color || '#5bc5a7', userId]
    );
    const group = groupRes.rows[0];

    // Add creator as member
    await query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [group.id, userId]
    );

    // Add other members by email; send invitations to those without accounts
    const invited = [];
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    for (const email of memberEmails) {
      if (!email || !email.trim()) continue;
      const normalizedEmail = email.trim().toLowerCase();
      const userRes = await query(
        'SELECT id, name FROM users WHERE LOWER(email) = LOWER($1)',
        [normalizedEmail]
      );
      if (userRes.rows.length === 0) {
        // No account — send invitation email
        const token = crypto.randomBytes(32).toString('hex');
        await query(
          `INSERT INTO group_invitations (group_id, email, invited_by, token)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [group.id, normalizedEmail, userId, token]
        );
        const inviteUrl = `${appUrl}?invite=${token}`;
        await sendInvitationEmail({ to: normalizedEmail, inviterName: req.user.name, groupName: group.name, inviteUrl });
        invited.push(normalizedEmail);
        continue;
      }
      const member = userRes.rows[0];
      if (member.id === userId) continue; // skip self

      const alreadyMember = await isMember(group.id, member.id);
      if (!alreadyMember) {
        await query(
          'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
          [group.id, member.id]
        );
        await addNotification(
          member.id,
          'group_added',
          `${req.user.name} added you to the group "${group.name}"`,
          { groupId: group.id }
        );
      }
    }

    const members = await getGroupMembers(group.id);

    res.status(201).json({
      group: {
        id: group.id,
        name: group.name,
        icon: group.icon,
        color: group.color,
        createdBy: group.created_by,
        createdAt: group.created_at,
        members,
      },
      invited,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/groups/:id — get single group
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const member = await isMember(id, userId);
    if (!member) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const group = await getGroupWithCreator(id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const members = await getGroupMembers(id);

    res.json({
      id: group.id,
      name: group.name,
      icon: group.icon,
      color: group.color,
      createdBy: group.created_by,
      createdAt: group.created_at,
      members,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/groups/:id — update group (creator only)
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { name, icon, color } = req.body;

    const group = await getGroupWithCreator(id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.created_by !== userId) return res.status(403).json({ error: 'Only the group creator can update it' });

    const result = await query(
      'UPDATE groups SET name = COALESCE($1, name), icon = COALESCE($2, icon), color = COALESCE($3, color) WHERE id = $4 RETURNING *',
      [name || null, icon || null, color || null, id]
    );

    const updated = result.rows[0];
    const members = await getGroupMembers(id);

    res.json({
      id: updated.id,
      name: updated.name,
      icon: updated.icon,
      color: updated.color,
      createdBy: updated.created_by,
      createdAt: updated.created_at,
      members,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/groups/:id — delete group (creator only)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const group = await getGroupWithCreator(id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.created_by !== userId) return res.status(403).json({ error: 'Only the group creator can delete it' });

    await query('DELETE FROM groups WHERE id = $1', [id]);

    res.json({ message: 'Group deleted' });
  } catch (err) {
    next(err);
  }
});

// POST /api/groups/:id/members — add member by email
router.post('/:id/members', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { email } = req.body;

    const member = await isMember(id, userId);
    if (!member) return res.status(403).json({ error: 'Not a member of this group' });

    const group = await getGroupWithCreator(id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    if (!email) return res.status(400).json({ error: 'Email is required' });

    const userRes = await query(
      'SELECT id, name, email, color FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );

    if (userRes.rows.length === 0) {
      // User doesn't have an account — send invitation email
      const token = crypto.randomBytes(32).toString('hex');
      const normalizedEmail = email.trim().toLowerCase();

      // Upsert invitation (replace existing pending invite for same group+email)
      await query(
        `INSERT INTO group_invitations (group_id, email, invited_by, token)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [id, normalizedEmail, req.user.id, token]
      );

      // If a row already existed (conflict), update it with a fresh token + expiry
      await query(
        `UPDATE group_invitations
         SET token = $1, invited_by = $2, created_at = NOW(),
             expires_at = NOW() + INTERVAL '7 days', accepted_at = NULL
         WHERE group_id = $3 AND LOWER(email) = $4 AND accepted_at IS NULL`,
        [token, req.user.id, id, normalizedEmail]
      );

      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const inviteUrl = `${appUrl}?invite=${token}`;

      await sendInvitationEmail({
        to: normalizedEmail,
        inviterName: req.user.name,
        groupName: group.name,
        inviteUrl,
      });

      return res.json({ invited: true, email: normalizedEmail });
    }

    const newMember = userRes.rows[0];
    const alreadyMember = await isMember(id, newMember.id);
    if (alreadyMember) {
      return res.status(409).json({ error: 'User is already a member' });
    }

    await query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [id, newMember.id]
    );

    await addNotification(
      newMember.id,
      'group_added',
      `${req.user.name} added you to the group "${group.name}"`,
      { groupId: id }
    );

    res.json({ id: newMember.id, name: newMember.name, email: newMember.email, color: newMember.color });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/groups/:id/members/:userId — remove member (creator only, can't remove creator)
router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const { id, userId: targetUserId } = req.params;
    const userId = req.user.id;

    const group = await getGroupWithCreator(id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.created_by !== userId) return res.status(403).json({ error: 'Only the group creator can remove members' });
    if (targetUserId === group.created_by) return res.status(400).json({ error: 'Cannot remove the group creator' });

    await query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
      [id, targetUserId]
    );

    res.json({ message: 'Member removed' });
  } catch (err) {
    next(err);
  }
});

// GET /api/groups/:id/balances — get balances for a group
router.get('/:id/balances', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const member = await isMember(id, userId);
    if (!member) return res.status(403).json({ error: 'Not a member of this group' });

    const members = await getGroupMembers(id);
    const memberIds = members.map(m => m.id);

    const expensesRes = await query(
      `SELECT e.id, e.paid_by as "paidBy", e.currency,
              json_object_agg(es.user_id, es.amount) as splits
       FROM expenses e
       JOIN expense_splits es ON es.expense_id = e.id
       WHERE e.group_id = $1
       GROUP BY e.id`,
      [id]
    );

    const settlementsRes = await query(
      'SELECT from_user as "fromUser", to_user as "toUser", amount, currency FROM settlements WHERE group_id = $1',
      [id]
    );

    const net = calculateBalances(memberIds, expensesRes.rows, settlementsRes.rows);
    const simplified = simplifyDebts(net);

    res.json({
      net,
      simplified,
      members: members.map(m => ({ id: m.id, name: m.name, color: m.color })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
