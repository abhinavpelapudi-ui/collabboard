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
  // Each migration wrapped individually so one failure doesn't block the rest
  const migrations: [string, string][] = [
    ['chat_messages.message_type', `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'chat'`],
    ['documents table', `
      CREATE TABLE IF NOT EXISTS documents (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        file_name   TEXT NOT NULL,
        file_type   TEXT NOT NULL,
        content     TEXT NOT NULL DEFAULT '',
        metadata    JSONB DEFAULT '{}',
        uploaded_by TEXT REFERENCES users(id),
        created_at  TIMESTAMPTZ DEFAULT now()
      )`],
    ['documents index', `CREATE INDEX IF NOT EXISTS idx_documents_board ON documents(board_id)`],
    ['ai_feedback table', `
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
      )`],
    ['ai_feedback indexes', `CREATE INDEX IF NOT EXISTS idx_feedback_board ON ai_feedback(board_id)`],
    ['ai_feedback trace index', `CREATE INDEX IF NOT EXISTS idx_feedback_trace ON ai_feedback(trace_id)`],
    ['object_comments table', `
      CREATE TABLE IF NOT EXISTS object_comments (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        object_id  UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
        board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
        user_name  TEXT NOT NULL,
        content    TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )`],
    ['object_comments index', `CREATE INDEX IF NOT EXISTS idx_obj_comments_object ON object_comments(object_id)`],
    ['board_documents table', `
      CREATE TABLE IF NOT EXISTS board_documents (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        title      TEXT NOT NULL DEFAULT 'Untitled',
        content    JSONB NOT NULL DEFAULT '{}',
        created_by TEXT REFERENCES users(id),
        updated_at TIMESTAMPTZ DEFAULT now(),
        created_at TIMESTAMPTZ DEFAULT now()
      )`],
    ['board_documents index', `CREATE INDEX IF NOT EXISTS idx_board_docs_board ON board_documents(board_id)`],
  ]

  for (const [name, sql] of migrations) {
    try {
      await pool.query(sql)
    } catch (err: any) {
      console.warn(`⚠️  Migration "${name}" skipped: ${err.message}`)
    }
  }

  console.log('✅ DB migrations applied')
}
