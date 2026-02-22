import { Hono } from 'hono'
import { ZodError } from 'zod'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { config } from './config'
import { redis } from './redis'
import { testConnection, runMigrations, pool } from './db'
import { rateLimit } from './middleware/rateLimit'
import { trackRequest } from './middleware/requestStats'
import boardsRouter from './routes/boards'
import membersRouter from './routes/members'
import aiRouter from './routes/ai'
import agentRouter from './routes/agent'
import authRouter from './routes/auth'
import adminRouter from './routes/admin'
import oauthRouter from './routes/oauth'
import notificationsRouter from './routes/notifications'
import workspacesRouter from './routes/workspaces'
import projectsRouter from './routes/projects'
import commentsRouter from './routes/comments'
import documentsRouter from './routes/documents'
import { registerSocketHandlers } from './sockets/handlers'
import { setIO } from './sockets/socketServer'
import { decodeSocketToken } from './middleware/auth'

const app = new Hono()

app.onError((err, c) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return c.json({ error: 'Invalid JSON in request body' }, 400)
  }
  if (err instanceof ZodError) {
    return c.json({ error: err.errors[0]?.message ?? 'Validation error' }, 400)
  }
  console.error('Unhandled error:', err)
  return c.json({ error: 'Internal server error' }, 500)
})

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use('*', logger())
app.use('*', cors({ origin: config.CLIENT_URL, credentials: true }))

// Security headers
app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  if (config.NODE_ENV === 'production') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
})

app.use('*', trackRequest)
// Reject oversized request bodies (2MB global limit)
app.use('*', async (c, next) => {
  const contentLength = c.req.header('content-length')
  if (contentLength && parseInt(contentLength, 10) > 2_000_000) {
    return c.json({ error: 'Request body too large (max 2MB)' }, 413)
  }
  await next()
})
// Global rate limit: 200 req/min per IP; tighter 30/min on auth routes
app.use('/api/*', rateLimit(200, 60_000))
app.use('/api/auth/*', rateLimit(30, 60_000))

// ─── Routes ──────────────────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))
app.route('/api/auth', authRouter)
app.route('/api/auth', oauthRouter)
app.route('/api/boards', boardsRouter)
app.route('/api/boards/:id/members', membersRouter)
app.route('/api/ai', aiRouter)
app.route('/api/agent', agentRouter)
app.route('/api/admin', adminRouter)
app.route('/api/notifications', notificationsRouter)
app.route('/api/workspaces', workspacesRouter)
app.route('/api/projects', projectsRouter)
app.route('/api', commentsRouter)
app.route('/api', documentsRouter)

// ─── Start HTTP server ────────────────────────────────────────────────────────
const server = serve({ fetch: app.fetch, port: config.PORT }, async () => {
  await testConnection()
  await runMigrations()
  console.log(`🚀 Hono server running on port ${config.PORT}`)
})

// ─── Socket.IO (attached to the same HTTP server) ────────────────────────────
const io = new Server(server as any, {
  cors: { origin: config.CLIENT_URL, credentials: true },
  pingTimeout: 60_000,
})
setIO(io)

// ─── Redis adapter (enables horizontal scaling across multiple instances) ─────
if (redis) {
  const subClient = redis.duplicate()
  io.adapter(createAdapter(redis, subClient))
  console.log('🔴 Redis adapter connected')
} else {
  console.log('⚠️  No REDIS_URL — using in-memory adapter (single instance only)')
}

io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  if (!token) return next(new Error('Authentication required'))
  const user = decodeSocketToken(token)
  if (!user) return next(new Error('Invalid token'))
  ;(socket as any).userId = user.userId
  ;(socket as any).userName = user.userName
  ;(socket as any).userColor = user.userColor
  next()
})

io.on('connection', (socket) => {
  console.log(`🔌 Connected: ${(socket as any).userId}`)
  registerSocketHandlers(io, socket as any)
  socket.on('disconnect', () => console.log(`🔌 Disconnected: ${(socket as any).userId}`))
})

async function shutdown() {
  console.log('Graceful shutdown initiated...')
  io.close()
  if (redis) await redis.quit()
  await pool.end()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
