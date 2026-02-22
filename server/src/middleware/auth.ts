import { createMiddleware } from 'hono/factory'
import jwt from 'jsonwebtoken'
import { pool } from '../db'
import { config } from '../config'

export type AuthVariables = {
  userId: string
  userName: string
  userEmail: string
}

function verifyToken(token: string) {
  const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as { sub: string; name: string; email: string }
  return {
    userId: payload.sub,
    userName: payload.name || payload.email?.split('@')[0] || 'Anonymous',
    userEmail: payload.email || '',
  }
}

export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const token = c.req.header('Authorization')?.split(' ')[1]
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const { userId, userName, userEmail } = verifyToken(token)
    // Confirm user still exists in DB (catches wiped/deleted accounts)
    const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [userId])
    if (!rows[0]) return c.json({ error: 'Session expired', sessionExpired: true }, 401)
    c.set('userId', userId)
    c.set('userName', userName)
    c.set('userEmail', userEmail)
    await next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})

// Used for Socket.IO handshake (outside Hono context)
export function decodeSocketToken(token: string): { userId: string; userName: string; userColor: string } | null {
  try {
    const { userId, userName } = verifyToken(token)
    const colors = ['#F87171', '#FB923C', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA', '#F472B6']
    const colorIndex = Math.abs(userId.charCodeAt(0)) % colors.length
    return { userId, userName, userColor: colors[colorIndex] }
  } catch {
    return null
  }
}
