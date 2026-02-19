import { Hono } from 'hono'
import { pool } from '../db'
import { requireAuth, AuthVariables } from '../middleware/auth'

const notifications = new Hono<{ Variables: AuthVariables }>()

// GET /api/notifications — fetch latest 30 notifications for the logged-in user
notifications.get('/', requireAuth, async (c) => {
  const userId = c.get('userId')
  const { rows } = await pool.query(
    `SELECT id, type, data, read_at, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 30`,
    [userId]
  )
  return c.json(rows)
})

// PATCH /api/notifications/read-all — mark all as read
notifications.patch('/read-all', requireAuth, async (c) => {
  const userId = c.get('userId')
  await pool.query(
    `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  )
  return c.json({ ok: true })
})

// PATCH /api/notifications/:id/read — mark one as read
notifications.patch('/:id/read', requireAuth, async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  await pool.query(
    `UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2`,
    [id, userId]
  )
  return c.json({ ok: true })
})

export default notifications
