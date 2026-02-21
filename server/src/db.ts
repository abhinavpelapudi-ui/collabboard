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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_feedback (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
      trace_id   TEXT NOT NULL,
      rating     TEXT NOT NULL,
      comment    TEXT DEFAULT '',
      command    TEXT DEFAULT '',
      response   TEXT DEFAULT '',
      model      TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_feedback_board ON ai_feedback(board_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_feedback_trace ON ai_feedback(trace_id)`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS object_comments (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      object_id  UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
      board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
      user_name  TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_obj_comments_object ON object_comments(object_id)`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS board_documents (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      title      TEXT NOT NULL DEFAULT 'Untitled',
      content    JSONB NOT NULL DEFAULT '{}',
      created_by TEXT REFERENCES users(id),
      updated_at TIMESTAMPTZ DEFAULT now(),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_board_docs_board ON board_documents(board_id)`)

  console.log('✅ DB migrations applied')
}
