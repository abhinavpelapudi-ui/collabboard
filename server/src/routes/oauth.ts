import { Hono } from 'hono'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { pool } from '../db'
import { v4 as uuidv4 } from 'uuid'
import { sendWelcomeEmail } from '../email'
import { config } from '../config'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'

const oauth = new Hono()

// ─── Google OAuth ──────────────────────────────────────────────────────────────

// GET /api/auth/google — redirect user to Google consent screen
oauth.get('/google', (c) => {
  const clientId = config.GOOGLE_CLIENT_ID
  if (!clientId) return c.json({ error: 'Google OAuth not configured' }, 503)

  const state = crypto.randomBytes(32).toString('hex')
  setCookie(c, 'oauth_state', state, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 300, // 5 minutes
    path: '/',
  })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${config.SERVER_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    state,
  })
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
})

// GET /api/auth/google/callback — Google redirects here after consent
oauth.get('/google/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, 'oauth_state')
  const clientId = config.GOOGLE_CLIENT_ID
  const clientSecret = config.GOOGLE_CLIENT_SECRET

  // Clear the state cookie
  deleteCookie(c, 'oauth_state', { path: '/' })

  // Validate CSRF state
  if (!state || !storedState || state !== storedState) {
    return c.redirect(`${config.CLIENT_URL}/sign-in?error=oauth_csrf_failed`)
  }

  if (!code || !clientId || !clientSecret) {
    return c.redirect(`${config.CLIENT_URL}/sign-in?error=oauth_failed`)
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${config.SERVER_URL}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      return c.redirect(`${config.CLIENT_URL}/sign-in?error=oauth_token_exchange_failed`)
    }

    const tokenData = await tokenRes.json() as { access_token: string }

    if (!tokenData.access_token) {
      return c.redirect(`${config.CLIENT_URL}/sign-in?error=oauth_no_access_token`)
    }

    // Get user profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const profile = await profileRes.json() as { id: string; email: string; name: string; picture: string }

    const { userId, name, email } = await upsertOAuthUser({
      provider: 'google',
      providerId: profile.id,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.picture,
    })

    const token = jwt.sign({ sub: userId, name, email }, config.JWT_SECRET, { expiresIn: '7d' })
    return c.redirect(`${config.CLIENT_URL}/oauth-callback#token=${token}&userId=${userId}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`)
  } catch (err) {
    console.error('Google OAuth error:', err)
    return c.redirect(`${config.CLIENT_URL}/sign-in?error=oauth_failed`)
  }
})

// ─── GitHub OAuth ──────────────────────────────────────────────────────────────

// GET /api/auth/github — redirect user to GitHub OAuth
oauth.get('/github', (c) => {
  const clientId = config.GITHUB_CLIENT_ID
  if (!clientId) return c.json({ error: 'GitHub OAuth not configured' }, 503)

  const state = crypto.randomBytes(32).toString('hex')
  setCookie(c, 'oauth_state', state, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 300, // 5 minutes
    path: '/',
  })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${config.SERVER_URL}/api/auth/github/callback`,
    scope: 'user:email',
    state,
  })
  return c.redirect(`https://github.com/login/oauth/authorize?${params}`)
})

// GET /api/auth/github/callback — GitHub redirects here after authorization
oauth.get('/github/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, 'oauth_state')
  const clientId = config.GITHUB_CLIENT_ID
  const clientSecret = config.GITHUB_CLIENT_SECRET

  // Clear the state cookie
  deleteCookie(c, 'oauth_state', { path: '/' })

  // Validate CSRF state
  if (!state || !storedState || state !== storedState) {
    return c.redirect(`${config.CLIENT_URL}/sign-in?error=oauth_csrf_failed`)
  }

  if (!code || !clientId || !clientSecret) {
    return c.redirect(`${config.CLIENT_URL}/sign-in?error=oauth_failed`)
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${config.SERVER_URL}/api/auth/github/callback`,
      }),
    })

    if (!tokenRes.ok) {
      return c.redirect(`${config.CLIENT_URL}/sign-in?error=oauth_token_exchange_failed`)
    }

    const tokenData = await tokenRes.json() as { access_token: string }

    if (!tokenData.access_token) {
      return c.redirect(`${config.CLIENT_URL}/sign-in?error=oauth_no_access_token`)
    }

    // Get user profile
    const profileRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'CollabBoard' },
    })
    const profile = await profileRes.json() as { id: number; login: string; name: string; avatar_url: string; email: string }

    // GitHub may not expose email — fetch primary verified email if needed
    let email = profile.email
    if (!email) {
      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'CollabBoard' },
      })
      const emails = await emailsRes.json() as { email: string; primary: boolean; verified: boolean }[]
      email = emails.find(e => e.primary && e.verified)?.email || emails[0]?.email || `${profile.login}@github.noemail`
    }

    const name = profile.name || profile.login

    const { userId, name: userName, email: userEmail } = await upsertOAuthUser({
      provider: 'github',
      providerId: String(profile.id),
      email,
      name,
      avatarUrl: profile.avatar_url,
    })

    const token = jwt.sign({ sub: userId, name: userName, email: userEmail }, config.JWT_SECRET, { expiresIn: '7d' })
    return c.redirect(`${config.CLIENT_URL}/oauth-callback#token=${token}&userId=${userId}&name=${encodeURIComponent(userName)}&email=${encodeURIComponent(userEmail)}`)
  } catch (err) {
    console.error('GitHub OAuth error:', err)
    return c.redirect(`${config.CLIENT_URL}/sign-in?error=oauth_failed`)
  }
})

// ─── Shared helper ─────────────────────────────────────────────────────────────

async function upsertOAuthUser(params: {
  provider: string
  providerId: string
  email: string
  name: string
  avatarUrl?: string
}) {
  const { provider, providerId, email, name, avatarUrl } = params

  // Check if this OAuth account already exists
  const { rows: existing } = await pool.query(
    `SELECT user_id FROM oauth_accounts WHERE provider = $1 AND provider_id = $2`,
    [provider, providerId]
  )

  if (existing[0]) {
    // Existing OAuth user — fetch their details
    const userId = existing[0].user_id
    const { rows } = await pool.query('SELECT name, email FROM users WHERE id = $1', [userId])
    return { userId, name: rows[0].name, email: rows[0].email }
  }

  // Check if a user with this email already exists (link accounts)
  const { rows: byEmail } = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email])

  let userId: string
  let finalName: string
  let finalEmail: string

  if (byEmail[0]) {
    // Link this OAuth provider to the existing user
    userId = byEmail[0].id
    finalName = byEmail[0].name
    finalEmail = byEmail[0].email
    // Update avatar if they don't have one
    if (avatarUrl) {
      await pool.query('UPDATE users SET avatar_url = COALESCE(avatar_url, $1), email_confirmed = true WHERE id = $2', [avatarUrl, userId])
    }
  } else {
    // Create a new user
    userId = uuidv4()
    finalName = name
    finalEmail = email
    await pool.query(
      `INSERT INTO users (id, name, email, avatar_url, email_confirmed) VALUES ($1, $2, $3, $4, true)`,
      [userId, name, email, avatarUrl || null]
    )
    // Send welcome email (non-blocking)
    sendWelcomeEmail(email, name).catch(console.error)
  }

  // Register the OAuth account link
  await pool.query(
    `INSERT INTO oauth_accounts (user_id, provider, provider_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [userId, provider, providerId]
  )

  return { userId, name: finalName, email: finalEmail }
}

export default oauth
