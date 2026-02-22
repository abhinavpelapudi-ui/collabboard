import { Pool } from 'pg'
import { config } from './config'

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: config.NODE_ENV === 'production'
    ? { rejectUnauthorized: !!config.DB_CA_CERT, ...(config.DB_CA_CERT ? { ca: config.DB_CA_CERT } : {}) }
    : false,
  max: 20,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  statement_timeout: 30000,
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
    ['projects table', `
      CREATE TABLE IF NOT EXISTS projects (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        description  TEXT DEFAULT '',
        status       TEXT DEFAULT 'active',
        industry     TEXT DEFAULT '',
        color        TEXT DEFAULT '#6366f1',
        start_date   DATE,
        end_date     DATE,
        owner_id     TEXT NOT NULL REFERENCES users(id),
        metadata     JSONB DEFAULT '{}',
        created_at   TIMESTAMPTZ DEFAULT now()
      )`],
    ['project_members table', `
      CREATE TABLE IF NOT EXISTS project_members (
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
        role       TEXT NOT NULL DEFAULT 'editor',
        PRIMARY KEY (project_id, user_id)
      )`],
    ['boards.project_id', `ALTER TABLE boards ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL`],
    ['projects indexes', `CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id)`],
    ['projects owner index', `CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id)`],
    ['project_members index', `CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id)`],
    ['boards project index', `CREATE INDEX IF NOT EXISTS idx_boards_project ON boards(project_id)`],
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
