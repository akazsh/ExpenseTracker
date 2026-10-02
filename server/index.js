import 'dotenv/config'
import pg from 'pg'
import { createApp } from './app.js'

const { Pool } = pg
const port = Number(process.env.PORT || 3001)
const jwtSecret = process.env.JWT_SECRET

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Configure your PostgreSQL connection in .env.')
  process.exit(1)
}
if (!jwtSecret || jwtSecret.length < 32) {
  console.error('JWT_SECRET must be set to a random value of at least 32 characters in .env.')
  process.exit(1)
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
      category TEXT NOT NULL,
      expense_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS expenses_user_date_idx ON expenses(user_id, expense_date DESC);
  `)
}

initializeDatabase()
  .then(() => createApp({ pool, jwtSecret }).listen(port, () => console.log(`Ledgerly API listening on http://localhost:${port}`)))
  .catch((error) => {
    console.error('Could not initialize PostgreSQL. Check DATABASE_URL and make sure the database exists.', error.message)
    process.exit(1)
  })
