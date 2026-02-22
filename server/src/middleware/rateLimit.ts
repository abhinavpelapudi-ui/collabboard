import type { MiddlewareHandler } from 'hono'
import { redis } from '../redis'
import { config } from '../config'

interface Window { count: number; resetAt: number }
const store = new Map<string, Window>()

// Clean up expired entries every 5 minutes (in-memory fallback only)
setInterval(() => {
  const now = Date.now()
  for (const [key, w] of store) { if (now > w.resetAt) store.delete(key) }
}, 5 * 60 * 1000)

export function rateLimit(maxRequests: number, windowMs: number): MiddlewareHandler {
  return async (c, next) => {
    const trustedProxies = config.TRUSTED_PROXIES?.split(',').map(s => s.trim()) || []
    const forwardedFor = c.req.header('x-forwarded-for')?.split(',')[0].trim()
    const directIp = c.req.header('cf-connecting-ip') || 'unknown'
    const ip = (trustedProxies.length > 0 && forwardedFor) ? forwardedFor : directIp

    let count: number

    if (redis) {
      const key = `rl:${ip}:${Math.floor(Date.now() / windowMs)}`
      count = await redis.incr(key)
      if (count === 1) await redis.pexpire(key, windowMs)
    } else {
      const now = Date.now()
      const w = store.get(ip)
      if (!w || now > w.resetAt) {
        store.set(ip, { count: 1, resetAt: now + windowMs })
        count = 1
      } else {
        count = ++w.count
      }
    }

    if (count > maxRequests) {
      return c.json({ error: 'Too many requests, please slow down.' }, 429)
    }

    return next()
  }
}
