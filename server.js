require('dotenv').config();
const express = require('express');
const path = require('path');
const { initSchema } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Note: Set JWT_SECRET env var in production. Default is 'splitwise_secret_key'.
// For Railway: add DATABASE_URL and JWT_SECRET in environment variables.

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

app.use('/api/auth', authRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/settlements', settlementsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/users', usersRouter);

// SPA fallback — serve index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start server immediately so Railway health check passes
app.listen(PORT, () => {
  console.log(`Splitwise running on port ${PORT}`);
});

// Init DB schema in background after server is up
initSchema()
  .then(() => console.log('Database ready'))
  .catch(err => {
    console.error('Database init failed:', err.message);
    // Don't exit — keep serving static files even if DB is down
  });
