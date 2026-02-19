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
  console.log('✅ DB migrations applied')
}
