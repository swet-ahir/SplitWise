const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T/;

// GET /api/notifications?limit=&before=
//   limit: 1-200 (default 50)
//   before: ISO timestamp; returns notifications older than this (cursor pagination)
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    let limit = parseInt(req.query.limit, 10);
    if (isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    const before = req.query.before;
    let result;
    if (before) {
      if (!ISO_TS_RE.test(before)) {
        return res.status(400).json({ error: 'before must be an ISO timestamp' });
      }
      result = await query(
        'SELECT * FROM notifications WHERE user_id = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT $3',
        [userId, before, limit]
      );
    } else {
      result = await query(
        'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
        [userId, limit]
      );
    }

    const notifications = result.rows.map(n => ({
      id: n.id,
      userId: n.user_id,
      type: n.type,
      message: n.message,
      read: n.read,
      meta: n.meta || {},
      createdAt: n.created_at,
    }));
    res.json(notifications);
  } catch (err) {
    next(err);
  }
});

// PUT /api/notifications/read-all — mark all as read (must be before /:id to avoid conflict)
router.put('/read-all', async (req, res, next) => {
  try {
    const userId = req.user.id;
    await query(
      'UPDATE notifications SET read = TRUE WHERE user_id = $1',
      [userId]
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/notifications/:id — mark a single notification as read
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const result = await query(
      'UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/notifications — delete all current user's notifications
router.delete('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    await query('DELETE FROM notifications WHERE user_id = $1', [userId]);
    res.json({ message: 'All notifications deleted' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/notifications/:id — delete a single notification (own only)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const result = await query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
