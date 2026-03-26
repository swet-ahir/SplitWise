const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function query(text, params) {
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
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
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

  console.log('Database schema initialized');
}

module.exports = { query, initSchema };
