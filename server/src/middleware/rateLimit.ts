import type { MiddlewareHandler } from 'hono'

interface Window { count: number; resetAt: number }
const store = new Map<string, Window>()

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, w] of store) { if (now > w.resetAt) store.delete(key) }
}, 5 * 60 * 1000)

/**
 * Simple in-memory rate limiter for Hono.
 * @param maxRequests  Max requests allowed per window
 * @param windowMs     Window size in milliseconds
 */
export function rateLimit(maxRequests: number, windowMs: number): MiddlewareHandler {
  return async (c, next) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
      c.req.header('cf-connecting-ip') ||
      'unknown'
    const now = Date.now()
    const w = store.get(ip)
    if (!w || now > w.resetAt) {
      store.set(ip, { count: 1, resetAt: now + windowMs })
    } else {
      w.count++
      if (w.count > maxRequests) {
        return c.json({ error: 'Too many requests, please slow down.' }, 429)
      }
    }
    return next()
  }
}
