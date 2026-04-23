require('dotenv').config();

// Log environment state immediately so Railway deployment logs show what was received
console.log('[startup] DATABASE_URL present:', !!process.env.DATABASE_URL);
console.log('[startup] JWT_SECRET present:', !!process.env.JWT_SECRET, '| length:', (process.env.JWT_SECRET || '').length);

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Add it in Railway → your service → Variables.');
  process.exit(1);
}

const express = require('express');
const path = require('path');
const { initSchema } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
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
