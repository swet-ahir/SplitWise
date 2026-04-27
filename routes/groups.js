const express = require('express');
const crypto = require('crypto');
const { query } = require('../db');
const auth = require('../middleware/auth');
const { calculateBalances, simplifyDebts } = require('../utils/balances');
const { sendInvitationEmail } = require('../utils/email');

const router = express.Router();
router.use(auth);

const NAME_MAX = 100;
const ICON_MAX = 10;        // matches groups.icon VARCHAR(10)
const COLOR_MAX = 20;       // matches groups.color VARCHAR(20)
const MAX_INVITE_EMAILS = 50;

// Whitelist mirroring js/constants.js GROUP_COLORS — keep in sync.
const ALLOWED_COLORS = new Set([
  '#5bc5a7', '#3b82f6', '#8b5cf6', '#ec4899',
  '#f59e0b', '#ef4444', '#06b6d4', '#84cc16',
]);

// Loose hex-color check as a fallback if a project ever wants free-form colors.
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

function validateName(name) {
  if (name === undefined || name === null) return { error: 'Group name is required' };
  const trimmed = String(name).trim();
  if (!trimmed) return { error: 'Group name cannot be empty' };
  if (trimmed.length > NAME_MAX) return { error: `Group name must be ${NAME_MAX} characters or fewer` };
  return { value: trimmed };
}

function validateIcon(icon) {
  if (icon === undefined || icon === null) return { value: null };
  const s = String(icon);
  if (!s) return { error: 'Icon cannot be empty' };
  if ([...s].length > 4) return { error: 'Icon must be a single emoji' };
  if (s.length > ICON_MAX) return { error: 'Icon is too long' };
  // Real emoji always include at least one non-ASCII codepoint. This rejects
  // free-form text like "abc" without trying to enumerate the unicode emoji ranges.
  if (/^[\x00-\x7F]+$/.test(s)) return { error: 'Icon must be an emoji' };
  return { value: s };
}

function validateColor(color) {
  if (color === undefined || color === null) return { value: null };
  const s = String(color).toLowerCase();
  if (s.length > COLOR_MAX) return { error: 'Color is too long' };
  if (!ALLOWED_COLORS.has(s) && !HEX_COLOR_RE.test(s)) {
    return { error: 'Invalid color' };
  }
  return { value: s };
}

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

// Helper: load expenses + settlements for balance calc.
async function getGroupBalanceState(groupId) {
  const expensesRes = await query(
    `SELECT e.id, e.paid_by as "paidBy", e.currency,
            json_object_agg(es.user_id, es.amount) as splits
     FROM expenses e
     JOIN expense_splits es ON es.expense_id = e.id
     WHERE e.group_id = $1
     GROUP BY e.id`,
    [groupId]
  );
  const settlementsRes = await query(
    'SELECT from_user as "fromUser", to_user as "toUser", amount, currency FROM settlements WHERE group_id = $1',
    [groupId]
  );
  return { expenses: expensesRes.rows, settlements: settlementsRes.rows };
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

      const expCountRes = await query('SELECT COUNT(*) FROM expenses WHERE group_id = $1', [g.id]);
      const expenseCount = parseInt(expCountRes.rows[0].count, 10);

      const { expenses, settlements } = await getGroupBalanceState(g.id);
      const memberIds = members.map(m => m.id);
      const net = calculateBalances(memberIds, expenses, settlements);
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
    const { name, icon, color, memberEmails = [] } = req.body || {};
    const userId = req.user.id;

    const nameV = validateName(name);
    if (nameV.error) return res.status(400).json({ error: nameV.error });
    const iconV = validateIcon(icon);
    if (iconV.error) return res.status(400).json({ error: iconV.error });
    const colorV = validateColor(color);
    if (colorV.error) return res.status(400).json({ error: colorV.error });

    if (!Array.isArray(memberEmails)) {
      return res.status(400).json({ error: 'memberEmails must be an array' });
    }
    if (memberEmails.length > MAX_INVITE_EMAILS) {
      return res.status(400).json({ error: `Cannot invite more than ${MAX_INVITE_EMAILS} members at once` });
    }

    const groupRes = await query(
      'INSERT INTO groups (name, icon, color, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [nameV.value, iconV.value || '🏠', colorV.value || '#5bc5a7', userId]
    );
    const group = groupRes.rows[0];

    await query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [group.id, userId]
    );

    const invited = [];
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    for (const email of memberEmails) {
      if (!email || !String(email).trim()) continue;
      const normalizedEmail = String(email).trim().toLowerCase();

      const userRes = await query(
        'SELECT id, name FROM users WHERE LOWER(email) = LOWER($1)',
        [normalizedEmail]
      );
      if (userRes.rows.length === 0) {
        const token = crypto.randomBytes(32).toString('hex');
        await query(
          `INSERT INTO group_invitations (group_id, email, invited_by, token)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (group_id, email) DO UPDATE
           SET token = EXCLUDED.token, invited_by = EXCLUDED.invited_by,
               created_at = NOW(), expires_at = NOW() + INTERVAL '7 days', accepted_at = NULL`,
          [group.id, normalizedEmail, userId, token]
        );
        const inviteUrl = `${appUrl}?invite=${token}`;
        // Best-effort: don't fail the whole request if the email service is unreachable.
        try {
          await sendInvitationEmail({ to: normalizedEmail, inviterName: req.user.name, groupName: group.name, inviteUrl });
        } catch (e) {
          console.warn(`[email] failed for ${normalizedEmail}: ${e.message}`);
        }
        invited.push(normalizedEmail);
        continue;
      }
      const member = userRes.rows[0];
      if (member.id === userId) continue;

      const alreadyMember = await isMember(group.id, member.id);
      if (!alreadyMember) {
        await query(
          'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
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
    const { name, icon, color } = req.body || {};

    const group = await getGroupWithCreator(id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.created_by !== userId) return res.status(403).json({ error: 'Only the group creator can update it' });

    let nameVal = null;
    if (name !== undefined) {
      const v = validateName(name);
      if (v.error) return res.status(400).json({ error: v.error });
      nameVal = v.value;
    }
    let iconVal = null;
    if (icon !== undefined) {
      const v = validateIcon(icon);
      if (v.error) return res.status(400).json({ error: v.error });
      iconVal = v.value;
    }
    let colorVal = null;
    if (color !== undefined) {
      const v = validateColor(color);
      if (v.error) return res.status(400).json({ error: v.error });
      colorVal = v.value;
    }

    const result = await query(
      'UPDATE groups SET name = COALESCE($1, name), icon = COALESCE($2, icon), color = COALESCE($3, color) WHERE id = $4 RETURNING *',
      [nameVal, iconVal, colorVal, id]
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

// DELETE /api/groups/:id — delete group (creator only).
// Refuses while any member still has an unsettled balance, unless `?force=true`
// is passed by the creator who acknowledges the data loss.
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const force = req.query.force === 'true';

    const group = await getGroupWithCreator(id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.created_by !== userId) return res.status(403).json({ error: 'Only the group creator can delete it' });

    if (!force) {
      const members = await getGroupMembers(id);
      const memberIds = members.map(m => m.id);
      const { expenses, settlements } = await getGroupBalanceState(id);
      const net = calculateBalances(memberIds, expenses, settlements);
      const hasOpen = Object.values(net).some(v => Math.abs(v) > 0.01);
      if (hasOpen) {
        return res.status(409).json({
          error: 'Group has unsettled balances. Settle up first, or pass ?force=true to delete anyway and discard the history.',
        });
      }
    }

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
    const { email } = req.body || {};

    const member = await isMember(id, userId);
    if (!member) return res.status(403).json({ error: 'Not a member of this group' });

    const group = await getGroupWithCreator(id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    if (!email || !String(email).trim()) return res.status(400).json({ error: 'Email is required' });

    const trimmedEmail = String(email).trim();
    const userRes = await query(
      'SELECT id, name, email, color FROM users WHERE LOWER(email) = LOWER($1)',
      [trimmedEmail]
    );

    if (userRes.rows.length === 0) {
      const token = crypto.randomBytes(32).toString('hex');
      const normalizedEmail = trimmedEmail.toLowerCase();

      await query(
        `INSERT INTO group_invitations (group_id, email, invited_by, token)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (group_id, email) DO UPDATE
         SET token = EXCLUDED.token, invited_by = EXCLUDED.invited_by,
             created_at = NOW(), expires_at = NOW() + INTERVAL '7 days', accepted_at = NULL`,
        [id, normalizedEmail, req.user.id, token]
      );

      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const inviteUrl = `${appUrl}?invite=${token}`;

      try {
        await sendInvitationEmail({
          to: normalizedEmail,
          inviterName: req.user.name,
          groupName: group.name,
          inviteUrl,
        });
      } catch (e) {
        console.warn(`[email] failed for ${normalizedEmail}: ${e.message}`);
      }

      return res.json({ invited: true, email: normalizedEmail });
    }

    const newMember = userRes.rows[0];
    const alreadyMember = await isMember(id, newMember.id);
    if (alreadyMember) {
      return res.status(409).json({ error: 'User is already a member' });
    }

    await query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
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

// DELETE /api/groups/:id/members/:userId — remove member.
// Creator can remove anyone except themselves; any member can remove themselves (leave).
// Blocks removal while the target still has a non-zero balance — settling first
// keeps the net-balance invariant from drifting (see `expense_splits` not having
// ON DELETE CASCADE for users).
router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const { id, userId: targetUserId } = req.params;
    const userId = req.user.id;

    const group = await getGroupWithCreator(id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const isSelfRemoval = targetUserId === userId;

    if (!isSelfRemoval && group.created_by !== userId) {
      return res.status(403).json({ error: 'Only the group creator can remove other members' });
    }
    if (targetUserId === group.created_by) {
      return res.status(400).json({ error: 'The group creator cannot be removed. Delete the group instead.' });
    }

    const memberExists = await isMember(id, targetUserId);
    if (!memberExists) return res.status(404).json({ error: 'Member not found in this group' });

    // Balance check
    const members = await getGroupMembers(id);
    const memberIds = members.map(m => m.id);
    const { expenses, settlements } = await getGroupBalanceState(id);
    const net = calculateBalances(memberIds, expenses, settlements);
    const targetBal = net[targetUserId] || 0;
    if (Math.abs(targetBal) > 0.01) {
      return res.status(409).json({
        error: isSelfRemoval
          ? 'You have an unsettled balance in this group. Settle up before leaving.'
          : 'This member has an unsettled balance. Settle up before removing them.',
        balance: parseFloat(targetBal.toFixed(2)),
      });
    }

    await query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
      [id, targetUserId]
    );

    res.json({ message: isSelfRemoval ? 'You have left the group' : 'Member removed' });
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
    const { expenses, settlements } = await getGroupBalanceState(id);

    const net = calculateBalances(memberIds, expenses, settlements);
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
