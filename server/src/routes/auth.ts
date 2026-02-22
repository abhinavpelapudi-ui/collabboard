import { Hono } from 'hono'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { randomInt } from 'node:crypto'
import { pool } from '../db'
import { v4 as uuidv4 } from 'uuid'
import { sendWelcomeEmail, sendEmailConfirmation, sendOTPEmail } from '../email'
import { config } from '../config'

const auth = new Hono()

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

  // Send welcome + confirmation emails (non-blocking)
  const confirmToken = uuidv4()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  await pool.query(
    `INSERT INTO email_confirmations (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [confirmToken, userId, expiresAt]
  )
  sendEmailConfirmation(email, name, confirmToken).catch(console.error)
  sendWelcomeEmail(email, name).catch(console.error)

  const token = jwt.sign({ sub: userId, name, email }, config.JWT_SECRET, { expiresIn: '7d' })
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
  if (!user.password_hash) {
    return c.json({ error: 'This account uses social login. Please sign in with Google or GitHub.' }, 401)
  }
  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    return c.json({ error: 'Incorrect password.' }, 401)
  }

  const token = jwt.sign(
    { sub: user.id, name: user.name, email: user.email },
    config.JWT_SECRET,
    { expiresIn: '7d' }
  )
  return c.json({ token, userId: user.id, name: user.name, email: user.email })
})

// GET /api/auth/me — verify token and return user (including plan)
auth.get('/me', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1]
  if (!token) return c.json({ error: 'No token' }, 401)
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as { sub: string; name: string; email: string }
    const { rows } = await pool.query('SELECT plan, email_confirmed FROM users WHERE id = $1', [payload.sub])
    const plan = rows[0]?.plan ?? 'free'
    const emailConfirmed = rows[0]?.email_confirmed ?? false
    return c.json({ userId: payload.sub, name: payload.name, email: payload.email, plan, emailConfirmed })
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})

// GET /api/auth/confirm-email?token=... — confirm email via link
auth.get('/confirm-email', async (c) => {
  const token = c.req.query('token')
  if (!token) return c.redirect(`${config.CLIENT_URL}/sign-in?error=invalid_token`)

  const { rows } = await pool.query(
    `SELECT user_id, expires_at, confirmed_at FROM email_confirmations WHERE token = $1`,
    [token]
  )

  if (!rows[0]) return c.redirect(`${config.CLIENT_URL}/sign-in?error=invalid_token`)
  if (rows[0].confirmed_at) return c.redirect(`${config.CLIENT_URL}/dashboard?confirmed=1`)
  if (new Date(rows[0].expires_at) < new Date()) return c.redirect(`${config.CLIENT_URL}/sign-in?error=token_expired`)

  const userId = rows[0].user_id
  await pool.query('UPDATE users SET email_confirmed = true WHERE id = $1', [userId])
  await pool.query('UPDATE email_confirmations SET confirmed_at = now() WHERE token = $1', [token])

  return c.redirect(`${config.CLIENT_URL}/dashboard?confirmed=1`)
})

// POST /api/auth/otp/send — send a 6-digit OTP to an email
auth.post('/otp/send', async (c) => {
  const body = await c.req.json()
  const schema = z.object({ email: z.string().email() })
  let parsed
  try { parsed = schema.parse(body) } catch {
    return c.json({ error: 'Valid email required' }, 400)
  }

  const { email } = parsed
  const code = String(randomInt(100000, 999999))
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

  // Expire previous unused codes for this email
  await pool.query(`UPDATE otp_codes SET used_at = now() WHERE email = $1 AND used_at IS NULL`, [email])

  await pool.query(
    `INSERT INTO otp_codes (email, code, expires_at) VALUES ($1, $2, $3)`,
    [email, code, expiresAt]
  )

  if (!config.RESEND_API_KEY) {
    // Dev mode — log code to server console instead of sending email
    console.log(`[DEV] OTP for ${email}: ${code}`)
    return c.json({ ok: true })
  }

  // Only log the code server-side in non-production
  if (config.NODE_ENV !== 'production') {
    console.log(`[otp] Code for ${email}: ${code}  (expires in 10 min)`)
  }

  try {
    await sendOTPEmail(email, code)
    if (config.NODE_ENV !== 'production') console.log(`[otp] Email sent to ${email}`)
  } catch (err: any) {
    console.error('[otp] Email send failed:', err?.message ?? err)
    return c.json({ error: 'Could not send verification code. Please try again.' }, 503)
  }

  return c.json({ ok: true })
})

// POST /api/auth/otp/verify — verify the OTP code and sign in / create account
auth.post('/otp/verify', async (c) => {
  const body = await c.req.json()
  const schema = z.object({
    email: z.string().email(),
    code: z.string().length(6),
    name: z.string().min(1).max(50).optional(),
  })
  let parsed
  try { parsed = schema.parse(body) } catch {
    return c.json({ error: 'Invalid input' }, 400)
  }

  const { email, code, name: providedName } = parsed

  const { rows } = await pool.query(
    `SELECT id, expires_at FROM otp_codes WHERE email = $1 AND code = $2 AND used_at IS NULL ORDER BY expires_at DESC LIMIT 1`,
    [email, code]
  )

  if (!rows[0]) return c.json({ error: 'Invalid or expired code.' }, 401)
  if (new Date(rows[0].expires_at) < new Date()) return c.json({ error: 'Code expired. Request a new one.' }, 401)

  // Mark code as used
  await pool.query('UPDATE otp_codes SET used_at = now() WHERE id = $1', [rows[0].id])

  // Upsert user
  const { rows: existing } = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email])
  let userId: string
  let name: string

  if (existing[0]) {
    userId = existing[0].id
    name = existing[0].name
    // Mark email as confirmed since they verified via OTP
    await pool.query('UPDATE users SET email_confirmed = true WHERE id = $1', [userId])
  } else {
    userId = uuidv4()
    name = providedName || email.split('@')[0]
    await pool.query(
      `INSERT INTO users (id, name, email, email_confirmed) VALUES ($1, $2, $3, true)`,
      [userId, name, email]
    )
    sendWelcomeEmail(email, name).catch(console.error)
  }

  const token = jwt.sign({ sub: userId, name, email }, config.JWT_SECRET, { expiresIn: '7d' })
  return c.json({ token, userId, name, email })
})

// POST /api/auth/activate-license — redeem a license key to upgrade the user's plan
auth.post('/activate-license', async (c) => {
  const token = c.req.header('Authorization')?.split(' ')[1]
  if (!token) return c.json({ error: 'Authentication required' }, 401)

  let userId: string
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as { sub: string }
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

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // SELECT ... FOR UPDATE to prevent TOCTOU race on concurrent activations
    const { rows: keyRows } = await client.query(
      `SELECT plan, max_activations, activations FROM license_keys WHERE key = $1 FOR UPDATE`,
      [key]
    )
    if (!keyRows[0]) {
      await client.query('ROLLBACK')
      return c.json({ error: 'Invalid license key' }, 404)
    }
    if (keyRows[0].activations >= keyRows[0].max_activations) {
      await client.query('ROLLBACK')
      return c.json({ error: 'This license key has already been fully used' }, 409)
    }

    const newPlan = keyRows[0].plan
    await client.query(`UPDATE license_keys SET activations = activations + 1 WHERE key = $1`, [key])
    await client.query(`UPDATE users SET plan = $1 WHERE id = $2`, [newPlan, userId])
    await client.query('COMMIT')

    return c.json({ plan: newPlan })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

export default auth
