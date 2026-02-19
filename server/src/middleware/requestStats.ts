import type { MiddlewareHandler } from 'hono'
import { stats } from '../stats'

export const trackRequest: MiddlewareHandler = async (c, next) => {
  const start = Date.now()
  await next()
  stats.requests++
  stats.totalResponseMs += Date.now() - start
  if (c.res.status >= 500) stats.errors++
}
