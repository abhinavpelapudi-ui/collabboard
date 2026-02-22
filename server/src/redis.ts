import Redis from 'ioredis'
import { config } from './config'

export const redis = config.REDIS_URL ? new Redis(config.REDIS_URL) : null

if (redis) {
  redis.on('error', (err) => console.error('Redis connection error:', err.message))
}
