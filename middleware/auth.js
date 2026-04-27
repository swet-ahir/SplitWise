const jwt = require('jsonwebtoken');
const { query } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;

// Verifies the JWT, then loads the *current* user record from the DB so:
//  - name/email changes show up immediately (no stale-token notifications)
//  - token_version mismatch (e.g. after password change) rejects old tokens
async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice(7);
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const result = await query(
      'SELECT id, name, email, token_version FROM users WHERE id = $1',
      [decoded.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });

    const tokenVer = decoded.tokenVersion ?? 0;
    if (user.token_version !== tokenVer) {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }

    req.user = { id: user.id, email: user.email, name: user.name };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = authMiddleware;
