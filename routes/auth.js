const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'splitwise_secret_key';

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Check if email already exists
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Pick a color based on existing user count
    const countRes = await query('SELECT COUNT(*) FROM users');
    const count = parseInt(countRes.rows[0].count, 10);
    const colors = ['#5bc5a7', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#14b8a6'];
    const color = colors[count % colors.length];

    const result = await query(
      'INSERT INTO users (name, email, password_hash, color) VALUES ($1, $2, $3, $4) RETURNING id, name, email, color, created_at',
      [name.trim(), email.trim().toLowerCase(), passwordHash, color]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        color: user.color,
        createdAt: user.created_at,
      },
      token,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await query(
      'SELECT id, name, email, password_hash, color, created_at FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        color: user.color,
        createdAt: user.created_at,
      },
      token,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/demo
router.post('/demo', async (req, res, next) => {
  try {
    const demoEmail = 'alex@demo.com';
    const demoPassword = 'demo123';
    const demoName = 'Alex (Demo)';

    let result = await query(
      'SELECT id, name, email, color, created_at FROM users WHERE LOWER(email) = $1',
      [demoEmail]
    );

    if (result.rows.length === 0) {
      const passwordHash = await bcrypt.hash(demoPassword, 10);
      result = await query(
        'INSERT INTO users (name, email, password_hash, color) VALUES ($1, $2, $3, $4) RETURNING id, name, email, color, created_at',
        [demoName, demoEmail, passwordHash, '#5bc5a7']
      );
    }

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        color: user.color,
        createdAt: user.created_at,
      },
      token,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
