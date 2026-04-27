const { Pool } = require('pg');

// Local Postgres usually has no SSL configured, so skip SSL when DATABASE_URL
// points at localhost. Managed Postgres (Railway, Heroku, RDS) keeps the
// rejectUnauthorized:false relaxed mode the original code used.
const isLocalDb = /^postgres(?:ql)?:\/\/[^@]*@?(localhost|127\.0\.0\.1)/.test(process.env.DATABASE_URL || '');
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isLocalDb ? false : { rejectUnauthorized: false },
    })
  : null;

async function getClient() {
  if (!pool) throw new Error('DATABASE_URL is not configured');
  return pool.connect();
}

async function query(text, params) {
  if (!pool) throw new Error('DATABASE_URL is not configured');
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      color VARCHAR(20) DEFAULT '#5bc5a7',
      token_version INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Backfill: existing deployments may have a users table without token_version.
  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      icon VARCHAR(10) DEFAULT '🏠',
      color VARCHAR(20),
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS group_members (
      group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (group_id, user_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
      description VARCHAR(200) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'USD',
      paid_by UUID REFERENCES users(id),
      category VARCHAR(50) DEFAULT 'other',
      date DATE,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS expense_splits (
      expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id),
      amount DECIMAL(12,2) NOT NULL,
      PRIMARY KEY (expense_id, user_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS settlements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
      from_user UUID REFERENCES users(id),
      to_user UUID REFERENCES users(id),
      amount DECIMAL(12,2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'USD',
      created_by UUID REFERENCES users(id),
      date DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50),
      message TEXT,
      read BOOLEAN DEFAULT FALSE,
      meta JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS group_invitations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      invited_by UUID REFERENCES users(id),
      token VARCHAR(64) UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
      accepted_at TIMESTAMPTZ,
      UNIQUE (group_id, email)
    )
  `);

  // Performance index: "which groups does user X belong to?" runs on every dashboard load
  await query(`
    CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id)
  `);

  // Performance index: expense lookups by group
  await query(`
    CREATE INDEX IF NOT EXISTS idx_expenses_group_id ON expenses(group_id)
  `);

  // Performance index: settlement lookups by group
  await query(`
    CREATE INDEX IF NOT EXISTS idx_settlements_group_id ON settlements(group_id)
  `);

  // Performance index: notifications by user
  await query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)
  `);

  // Clean up duplicate invitations then add unique constraint if missing
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'group_invitations_group_id_email_key'
      ) THEN
        DELETE FROM group_invitations
        WHERE id NOT IN (
          SELECT DISTINCT ON (group_id, email) id
          FROM group_invitations
          ORDER BY group_id, email, created_at DESC
        );
        ALTER TABLE group_invitations ADD CONSTRAINT group_invitations_group_id_email_key UNIQUE (group_id, email);
      END IF;
    END $$
  `);

  console.log('Database schema initialized');
}

module.exports = { query, initSchema, getClient };
