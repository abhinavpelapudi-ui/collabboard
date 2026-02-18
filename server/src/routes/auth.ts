import { Hono } from 'hono'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { pool } from '../db'
import { v4 as uuidv4 } from 'uuid'

const auth = new Hono()

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod'

// POST /api/auth/register
auth.post('/register', async (c) => {
  const body = await c.req.json()
  const schema = z.object({
    name: z.string().min(1).max(50),
    email: z.string().email(),
    password: z.string().min(6),
  })

  let parsed
  try {
    parsed = schema.parse(body)
  } catch (err: any) {
    return c.json({ error: err.errors?.[0]?.message || 'Invalid input' }, 400)
  }

  const { name, email, password } = parsed

  // Check if email already exists
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email])
  if (existing.rows.length > 0) {
    return c.json({ error: 'Email already registered. Please sign in.' }, 409)
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const userId = uuidv4()

  await pool.query(
    `INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)`,
    [userId, name, email, passwordHash]
  )

  const token = jwt.sign({ sub: userId, name, email }, JWT_SECRET, { expiresIn: '7d' })
  return c.json({ token, userId, name, email }, 201)
})

// POST /api/auth/login
auth.post('/login', async (c) => {
  const body = await c.req.json()
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  })

  let parsed
  try {
    parsed = schema.parse(body)
  } catch (err: any) {
    return c.json({ error: err.errors?.[0]?.message || 'Invalid input' }, 400)
  }

  const { email, password } = parsed

  const result = await pool.query(
    'SELECT id, name, email, password_hash FROM users WHERE email = $1',
    [email]
  )

  if (result.rows.length === 0) {
    return c.json({ error: 'No account found with that email.' }, 401)
  }

  const user = result.rows[0]
  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    return c.json({ error: 'Incorrect password.' }, 401)
  }

  const token = jwt.sign(
    { sub: user.id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
  return c.json({ token, userId: user.id, name: user.name, email: user.email })
})

// GET /api/auth/me — verify token and return user (including plan)
auth.get('/me', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1]
  if (!token) return c.json({ error: 'No token' }, 401)
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; name: string; email: string }
    const { rows } = await pool.query('SELECT plan FROM users WHERE id = $1', [payload.sub])
    const plan = rows[0]?.plan ?? 'free'
    return c.json({ userId: payload.sub, name: payload.name, email: payload.email, plan })
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})

// POST /api/auth/activate-license — redeem a license key to upgrade the user's plan
auth.post('/activate-license', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1]
  if (!token) return c.json({ error: 'Authentication required' }, 401)

  let userId: string
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string }
    userId = payload.sub
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }

  const body = await c.req.json()
  const schema = z.object({ key: z.string().min(1) })
  let parsed
  try {
    parsed = schema.parse(body)
  } catch {
    return c.json({ error: 'Invalid request' }, 400)
  }

  const { key } = parsed

  // Look up the key and check availability
  const { rows: keyRows } = await pool.query(
    `SELECT plan, max_activations, activations FROM license_keys WHERE key = $1`,
    [key]
  )
  if (!keyRows[0]) return c.json({ error: 'Invalid license key' }, 404)
  if (keyRows[0].activations >= keyRows[0].max_activations) {
    return c.json({ error: 'This license key has already been fully used' }, 409)
  }

  const newPlan = keyRows[0].plan

  // Atomic update: increment activations and upgrade user
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE license_keys SET activations = activations + 1 WHERE key = $1`,
      [key]
    )
    await client.query(
      `UPDATE users SET plan = $1 WHERE id = $2`,
      [newPlan, userId]
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  return c.json({ plan: newPlan })
})

export default auth
