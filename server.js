require('dotenv').config();

// If JWT_SECRET is not explicitly set, derive a stable one from DATABASE_URL.
// This produces a strong, consistent secret tied to the database instance —
// the same DATABASE_URL always yields the same secret, so tokens survive restarts.
if (!process.env.JWT_SECRET) {
  if (!process.env.DATABASE_URL) {
    console.error('FATAL: Neither JWT_SECRET nor DATABASE_URL is set. Cannot start.');
    process.exit(1);
  }
  const crypto = require('crypto');
  process.env.JWT_SECRET = crypto
    .createHash('sha256')
    .update(process.env.DATABASE_URL)
    .digest('hex');
  console.log('[startup] JWT_SECRET derived from DATABASE_URL (set JWT_SECRET env var to override)');
} else {
  console.log('[startup] JWT_SECRET loaded from environment');
}

console.log('[startup] DATABASE_URL present:', !!process.env.DATABASE_URL);

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const { initSchema } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Trust the platform proxy (Railway, Heroku, etc.) for X-Forwarded-Proto so
// req.secure is accurate when terminating TLS upstream.
app.set('trust proxy', 1);

// Security response headers. CSP is disabled because the current frontend uses
// inline `onclick=` handlers and `style=""` attributes — turning CSP on without
// `'unsafe-inline'` would break the app, and turning it on *with* `'unsafe-inline'`
// adds little value. Refactoring to event-listener-only would let us enable CSP.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// Force HTTPS in production. Skipped in dev so localhost still works.
if (isProd) {
  app.use((req, res, next) => {
    if (req.secure) return next();
    return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
  });
}

// Middleware
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname)));

// API Routes
const authRouter = require('./routes/auth');
const groupsRouter = require('./routes/groups');
const expensesRouter = require('./routes/expenses');
const settlementsRouter = require('./routes/settlements');
const notificationsRouter = require('./routes/notifications');
const usersRouter = require('./routes/users');
const invitationsRouter = require('./routes/invitations');

app.use('/api/auth', authRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/settlements', settlementsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/users', usersRouter);
app.use('/api/invitations', invitationsRouter);

// SPA fallback — serve index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Global error handler — always return JSON
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack || err.message);
  if (res.headersSent) return;
  // Do not leak internal error details (DB messages, stack traces) to clients.
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// Start server immediately so Railway health check passes
app.listen(PORT, () => {
  console.log(`Splitwise running on port ${PORT}`);
});

// Init DB schema — retry up to 5 times with delay
async function initWithRetry(attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await initSchema();
      console.log('Database ready');
      return;
    } catch (err) {
      console.error(`DB init attempt ${i}/${attempts} failed: ${err.message}`);
      if (i < attempts) await new Promise(r => setTimeout(r, 3000));
    }
  }
  console.error('All DB init attempts failed. API calls will fail until DB is reachable.');
}
initWithRetry();
