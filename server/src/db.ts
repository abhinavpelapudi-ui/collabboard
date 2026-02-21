import { Pool } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

export async function testConnection() {
  const client = await pool.connect()
  console.log('✅ Database connected')
  client.release()
}

export async function runMigrations() {
  // Idempotent: safe to run on every startup
  await pool.query(`
    ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'chat'
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      file_name   TEXT NOT NULL,
      file_type   TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      metadata    JSONB DEFAULT '{}',
      uploaded_by TEXT REFERENCES users(id),
      created_at  TIMESTAMPTZ DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_documents_board ON documents(board_id)
  `)

  console.log('✅ DB migrations applied')
}
