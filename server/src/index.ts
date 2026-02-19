import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'
import { Server } from 'socket.io'
import dotenv from 'dotenv'
import { testConnection, runMigrations } from './db'
import { rateLimit } from './middleware/rateLimit'
import boardsRouter from './routes/boards'
import membersRouter from './routes/members'
import aiRouter from './routes/ai'
import authRouter from './routes/auth'
import adminRouter from './routes/admin'
import oauthRouter from './routes/oauth'
import notificationsRouter from './routes/notifications'
import workspacesRouter from './routes/workspaces'
import { registerSocketHandlers } from './sockets/handlers'
import { setIO } from './sockets/socketServer'
import { decodeSocketToken } from './middleware/auth'

dotenv.config()

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'
const PORT = Number(process.env.PORT) || 3001

const app = new Hono()

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use('*', logger())
app.use('*', cors({ origin: CLIENT_URL, credentials: true }))
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
app.route('/api/admin', adminRouter)
app.route('/api/notifications', notificationsRouter)
app.route('/api/workspaces', workspacesRouter)

// ─── Start HTTP server ────────────────────────────────────────────────────────
const server = serve({ fetch: app.fetch, port: PORT }, async () => {
  await testConnection()
  await runMigrations()
  console.log(`🚀 Hono server running on port ${PORT}`)
})

// ─── Socket.IO (attached to the same HTTP server) ────────────────────────────
const io = new Server(server as any, {
  cors: { origin: CLIENT_URL, credentials: true },
  pingTimeout: 60_000,
})
setIO(io)

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
  console.log(`🔌 Connected: ${(socket as any).userName}`)
  registerSocketHandlers(io, socket as any)
  socket.on('disconnect', () => console.log(`🔌 Disconnected: ${(socket as any).userName}`))
})
