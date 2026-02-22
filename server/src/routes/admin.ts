import { Hono } from 'hono'
import { pool } from '../db'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { stats } from '../stats'
import { getRealtimeStats } from '../sockets/socketServer'
import { config } from '../config'

const admin = new Hono()

function requireAdminSecret(c: any, next: any) {
  const secret = c.req.header('X-Admin-Secret')
  if (secret !== config.ADMIN_SECRET) return c.json({ error: 'Forbidden' }, 403)
  return next()
}

// POST /api/admin/generate-license
// Body: { plan: 'pro' | 'business' | 'enterprise', max_activations?: number }
// Header: X-Admin-Secret: <secret>
admin.post('/generate-license', requireAdminSecret, async (c) => {
  const body = await c.req.json()
  const schema = z.object({
    plan: z.enum(['pro', 'business', 'enterprise']),
    max_activations: z.number().int().min(1).default(1),
  })

  let parsed
  try {
    parsed = schema.parse(body)
  } catch (err: any) {
    return c.json({ error: err.errors?.[0]?.message || 'Invalid input' }, 400)
  }

  const { plan, max_activations } = parsed
  const key = uuidv4()

  await pool.query(
    `INSERT INTO license_keys (key, plan, max_activations) VALUES ($1, $2, $3)`,
    [key, plan, max_activations]
  )

  return c.json({ key, plan, max_activations }, 201)
})

// GET /api/admin/licenses — list all keys and their usage
admin.get('/licenses', requireAdminSecret, async (c) => {
  const { rows } = await pool.query(
    `SELECT key, plan, max_activations, activations, created_at FROM license_keys ORDER BY created_at DESC`
  )
  return c.json(rows)
})

// GET /api/admin/metrics — full system metrics
admin.get('/metrics', requireAdminSecret, async (c) => {
  const uptimeMs = Date.now() - stats.startedAt
  const avgResponseMs = stats.requests > 0
    ? Math.round(stats.totalResponseMs / stats.requests)
    : 0

  const [businessRows] = await Promise.all([
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM users WHERE created_at >= now() - interval '1 day') AS signups_today,
        (SELECT COUNT(*) FROM users WHERE created_at >= now() - interval '7 days') AS signups_week,
        (SELECT COUNT(*) FROM boards) AS total_boards,
        (SELECT COUNT(*) FROM boards WHERE created_at >= now() - interval '1 day') AS boards_today,
        (SELECT COUNT(*) FROM workspaces) AS total_workspaces,
        (SELECT COUNT(*) FROM users WHERE plan != 'free') AS paid_users
    `),
  ])

  const biz = businessRows.rows[0]
  const realtime = getRealtimeStats()

  return c.json({
    app: {
      uptime_seconds: Math.floor(uptimeMs / 1000),
      requests_total: stats.requests,
      errors_total: stats.errors,
      error_rate_pct: stats.requests > 0
        ? +((stats.errors / stats.requests) * 100).toFixed(2)
        : 0,
      avg_response_ms: avgResponseMs,
    },
    realtime: {
      connected_users: realtime.connectedUsers,
      active_boards: realtime.activeBoards,
    },
    business: {
      total_users: Number(biz.total_users),
      signups_today: Number(biz.signups_today),
      signups_this_week: Number(biz.signups_week),
      paid_users: Number(biz.paid_users),
      total_boards: Number(biz.total_boards),
      boards_created_today: Number(biz.boards_today),
      total_workspaces: Number(biz.total_workspaces),
    },
  })
})

export default admin
