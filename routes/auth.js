const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { query } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Rate limiters scoped per-route. Numbers are intentionally generous for
// legitimate users on a NAT'd network but tight enough to deter brute force.
// 429 fires per IP; switch to a Redis store if you ever scale beyond one process.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in a few minutes.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registrations from this IP. Try again later.' },
});

const demoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demo account creation is rate-limited. Try again later.' },
});

const NAME_MAX = 100;
const EMAIL_MAX = 255;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 200;

// RFC-5322-flavoured (not exhaustive but rejects clear garbage like "a@b.c").
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function signToken(user, opts = {}) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      tokenVersion: user.token_version ?? 0,
    },
    JWT_SECRET,
    { expiresIn: '7d', ...opts }
  );
}

// POST /api/auth/register
router.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    const trimmedName = String(name).trim();
    const trimmedEmail = String(email).trim();
    if (!trimmedName) return res.status(400).json({ error: 'Name cannot be empty' });
    if (trimmedName.length > NAME_MAX) return res.status(400).json({ error: `Name must be ${NAME_MAX} characters or fewer` });
    if (trimmedEmail.length > EMAIL_MAX) return res.status(400).json({ error: 'Email is too long' });
    if (!EMAIL_RE.test(trimmedEmail)) return res.status(400).json({ error: 'Please enter a valid email address' });
    if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
      return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN} characters` });
    }
    if (password.length > PASSWORD_MAX) {
      return res.status(400).json({ error: `Password must be ${PASSWORD_MAX} characters or fewer` });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Pick a color based on existing user count
    const countRes = await query('SELECT COUNT(*) FROM users');
    const count = parseInt(countRes.rows[0].count, 10);
    const colors = ['#5bc5a7', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#14b8a6'];
    const color = colors[count % colors.length];

    let result;
    try {
      result = await query(
        'INSERT INTO users (name, email, password_hash, color) VALUES ($1, $2, $3, $4) RETURNING id, name, email, color, token_version, created_at',
        [trimmedName, trimmedEmail.toLowerCase(), passwordHash, color]
      );
    } catch (err) {
      // Postgres unique_violation — converts a race-window collision into a clean 409.
      if (err && err.code === '23505') {
        return res.status(409).json({ error: 'Email already registered' });
      }
      throw err;
    }

    const user = result.rows[0];
    const token = signToken(user);

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
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await query(
      'SELECT id, name, email, password_hash, color, token_version, created_at FROM users WHERE LOWER(email) = LOWER($1)',
      [String(email).trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);

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
// Creates a fresh isolated demo account per session so multiple demo users don't share data.
router.post('/demo', demoLimiter, async (req, res, next) => {
  try {
    const crypto = require('crypto');
    const suffix = crypto.randomBytes(8).toString('hex'); // widened from 4 → 8 bytes; collision space ~10^19
    const demoEmail = `demo_${suffix}@demo.splitwise`;
    const demoName = 'Demo User';
    const demoPassword = crypto.randomBytes(16).toString('hex'); // not used for login

    const colors = ['#5bc5a7', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const passwordHash = await bcrypt.hash(demoPassword, 10);
    const result = await query(
      'INSERT INTO users (name, email, password_hash, color) VALUES ($1, $2, $3, $4) RETURNING id, name, email, color, token_version, created_at',
      [demoName, demoEmail, passwordHash, color]
    );

    const user = result.rows[0];
    // Demo tokens expire in 2 hours to limit orphaned demo accounts
    const token = signToken(user, { expiresIn: '2h' });

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
