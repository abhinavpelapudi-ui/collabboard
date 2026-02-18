import { Hono } from 'hono'
import { pool } from '../db'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

const admin = new Hono()

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin-dev-secret'

function requireAdminSecret(c: any, next: any) {
  const secret = c.req.header('X-Admin-Secret')
  if (secret !== ADMIN_SECRET) return c.json({ error: 'Forbidden' }, 403)
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

export default admin
