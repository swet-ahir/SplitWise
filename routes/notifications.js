const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// GET /api/notifications — get current user's notifications
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
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

// PUT /api/notifications/read-all — mark all as read
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

module.exports = router;
