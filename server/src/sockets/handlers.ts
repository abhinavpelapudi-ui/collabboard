import { Server, Socket } from 'socket.io'
import { pool } from '../db'
import { BoardObject, PresenceUser } from '@collabboard/shared'
import { getUserRole } from '../routes/boards'
import { registerUserSocket, unregisterUserSocket, getCachedRole, setCachedRole } from './socketServer'
import { z } from 'zod'

// In-memory presence: boardId → Map<userId, PresenceUser & socketId>
const presence = new Map<string, Map<string, PresenceUser & { socketId: string }>>()

const TYPE_LABELS: Record<string, string> = {
  sticky: 'sticky note', rect: 'rectangle', circle: 'circle',
  frame: 'frame', text: 'text', connector: 'connector', image: 'image',
}

async function emitAudit(
  io: Server,
  socket: Socket & { userId: string; userName: string; userColor: string },
  boardId: string,
  content: string
) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO chat_messages (board_id, user_id, user_name, content, message_type)
       VALUES ($1, $2, $3, $4, 'audit') RETURNING id, created_at`,
      [boardId, socket.userId, socket.userName, content]
    )
    io.to(`board:${boardId}`).emit('chat:message', {
      id: rows[0].id,
      userId: socket.userId,
      userName: socket.userName,
      userColor: socket.userColor,
      content,
      createdAt: rows[0].created_at,
      messageType: 'audit',
    })
  } catch (err) {
    console.error('Failed to emit audit log', err)
  }
}

function getBoardUsers(boardId: string): PresenceUser[] {
  return Array.from(presence.get(boardId)?.values() ?? []).map(({ socketId, ...user }) => user)
}

export function registerSocketHandlers(io: Server, socket: Socket & { userId: string; userName: string; userColor: string }) {
  registerUserSocket(socket.userId, socket.id)
  const joinedBoards = new Set<string>()

  // ─── board:join ───────────────────────────────────────────────────────────
  socket.on('board:join', async ({ boardId }: { boardId: string }) => {
    if (!z.string().uuid().safeParse(boardId).success) return

    // Check access permission
    const role = await getUserRole(boardId, socket.userId)
    if (!role) {
      socket.emit('error', { message: 'You do not have access to this board' })
      return
    }

    joinedBoards.add(boardId)
    socket.join(`board:${boardId}`)

    // Cache role for fast checking on object events
    setCachedRole(socket.id, boardId, role)

    // Add to presence
    if (!presence.has(boardId)) presence.set(boardId, new Map())
    presence.get(boardId)!.set(socket.userId, {
      userId: socket.userId,
      userName: socket.userName,
      userColor: socket.userColor,
      socketId: socket.id,
    })

    // Send current board state to the joining client
    const { rows } = await pool.query(
      `SELECT id, type, props, z_index FROM objects WHERE board_id = $1 ORDER BY z_index`,
      [boardId]
    )
    const objects = rows.map(row => ({
      id: row.id,
      type: row.type,
      z_index: row.z_index,
      ...row.props,
    })) as BoardObject[]

    socket.emit('board:state', { objects })

    // Broadcast presence update to everyone in the room
    io.to(`board:${boardId}`).emit('presence:update', { users: getBoardUsers(boardId) })
  })

  // ─── cursor:move ──────────────────────────────────────────────────────────
  let lastCursorEmit = 0
  socket.on('cursor:move', ({ boardId, x, y }: { boardId: string; x: number; y: number }) => {
    const now = Date.now()
    if (now - lastCursorEmit < 16) return // throttle to ~60fps
    lastCursorEmit = now

    socket.to(`board:${boardId}`).emit('cursor:move', {
      userId: socket.userId,
      userName: socket.userName,
      userColor: socket.userColor,
      x,
      y,
    })
  })

  // ─── object:create ────────────────────────────────────────────────────────
  socket.on('object:create', async ({ boardId, object }: { boardId: string; object: BoardObject }) => {
    const role = getCachedRole(socket.id, boardId)
    if (role === 'viewer') {
      socket.emit('error', { message: 'Viewers cannot create objects' })
      return
    }

    // Broadcast to other clients immediately
    socket.to(`board:${boardId}`).emit('object:create', { object })

    // Persist async
    try {
      await pool.query(
        `INSERT INTO objects (id, board_id, type, props, z_index, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET props = $4, updated_at = now()`,
        [object.id, boardId, object.type, JSON.stringify(object), object.z_index, socket.userId]
      )
    } catch (err) {
      console.error('Failed to persist object:create', err)
    }

    // Audit log
    const label = TYPE_LABELS[object.type] || object.type
    await emitAudit(io, socket, boardId, `${socket.userName} added a ${label}`)
  })

  // ─── object:update ────────────────────────────────────────────────────────
  const updateQueue = new Map<string, ReturnType<typeof setTimeout>>()
  const auditQueue = new Map<string, ReturnType<typeof setTimeout>>()

  socket.on('object:update', async ({ boardId, objectId, props }: { boardId: string; objectId: string; props: Partial<BoardObject> }) => {
    const role = getCachedRole(socket.id, boardId)
    if (role === 'viewer') {
      socket.emit('error', { message: 'Viewers cannot edit objects' })
      return
    }

    // Broadcast immediately
    socket.to(`board:${boardId}`).emit('object:update', { objectId, props })

    // Debounce DB write per object (500ms)
    if (updateQueue.has(objectId)) clearTimeout(updateQueue.get(objectId)!)
    updateQueue.set(
      objectId,
      setTimeout(async () => {
        updateQueue.delete(objectId)
        try {
          await pool.query(
            `UPDATE objects SET props = props || $1::jsonb, updated_at = now() WHERE id = $2 AND board_id = $3`,
            [JSON.stringify(props), objectId, boardId]
          )
        } catch (err) {
          console.error('Failed to persist object:update', err)
        }
      }, 500)
    )

    // Audit: text or color change (debounced 2s to avoid flooding on keystrokes)
    const isTextChange = 'text' in props
    const isColorChange = ('color' in props || 'fill' in props) && !isTextChange
    if (isTextChange || isColorChange) {
      if (auditQueue.has(objectId)) clearTimeout(auditQueue.get(objectId)!)
      auditQueue.set(objectId, setTimeout(async () => {
        auditQueue.delete(objectId)
        try {
          const { rows } = await pool.query(
            `SELECT type FROM objects WHERE id = $1`, [objectId]
          )
          const typeLabel = TYPE_LABELS[rows[0]?.type] || 'object'
          const action = isTextChange ? 'edited text on' : 'changed color of'
          await emitAudit(io, socket, boardId, `${socket.userName} ${action} a ${typeLabel}`)
        } catch (err) {
          console.error('Failed to emit audit for object:update', err)
        }
      }, 2000))
    }
  })

  // ─── object:delete ────────────────────────────────────────────────────────
  socket.on('object:delete', async ({ boardId, objectId }: { boardId: string; objectId: string }) => {
    const role = getCachedRole(socket.id, boardId)
    if (role === 'viewer') {
      socket.emit('error', { message: 'Viewers cannot delete objects' })
      return
    }

    socket.to(`board:${boardId}`).emit('object:delete', { objectId })

    try {
      const { rows } = await pool.query(
        `DELETE FROM objects WHERE id = $1 AND board_id = $2 RETURNING type`,
        [objectId, boardId]
      )
      const label = TYPE_LABELS[rows[0]?.type] || 'object'
      await emitAudit(io, socket, boardId, `${socket.userName} removed a ${label}`)
    } catch (err) {
      console.error('Failed to persist object:delete', err)
    }
  })

  // ─── chat:send ────────────────────────────────────────────────────────────
  socket.on('chat:send', async ({ boardId, content }: { boardId: string; content: string }) => {
    const role = getCachedRole(socket.id, boardId)
    if (!role) return // user hasn't joined the board room

    const trimmed = (content ?? '').trim().slice(0, 2000)
    if (!trimmed) return

    try {
      const { rows } = await pool.query(
        `INSERT INTO chat_messages (board_id, user_id, user_name, content)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [boardId, socket.userId, socket.userName, trimmed]
      )
      io.to(`board:${boardId}`).emit('chat:message', {
        id: rows[0].id,
        userId: socket.userId,
        userName: socket.userName,
        userColor: socket.userColor,
        content: trimmed,
        createdAt: rows[0].created_at,
      })
    } catch (err) {
      console.error('Failed to persist chat message', err)
    }
  })

  // ─── comment:create ──────────────────────────────────────────────────────
  socket.on('comment:create', async ({ boardId, objectId, content }: { boardId: string; objectId: string; content: string }) => {
    const role = getCachedRole(socket.id, boardId)
    if (!role) return

    const trimmed = (content ?? '').trim().slice(0, 2000)
    if (!trimmed) return

    try {
      const { rows } = await pool.query(
        `INSERT INTO object_comments (object_id, board_id, user_id, user_name, content)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [objectId, boardId, socket.userId, socket.userName, trimmed]
      )
      io.to(`board:${boardId}`).emit('comment:created', { comment: rows[0] })
    } catch (err) {
      console.error('Failed to persist comment', err)
    }
  })

  // ─── board:leave ─────────────────────────────────────────────────────────
  socket.on('board:leave', ({ boardId }: { boardId: string }) => {
    joinedBoards.delete(boardId)
    presence.get(boardId)?.delete(socket.userId)
    socket.leave(`board:${boardId}`)
    socket.to(`board:${boardId}`).emit('cursor:leave', { userId: socket.userId })
    io.to(`board:${boardId}`).emit('presence:update', { users: getBoardUsers(boardId) })
  })

  // ─── disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    unregisterUserSocket(socket.userId, socket.id)

    for (const boardId of joinedBoards) {
      presence.get(boardId)?.delete(socket.userId)
      socket.to(`board:${boardId}`).emit('cursor:leave', { userId: socket.userId })
      io.to(`board:${boardId}`).emit('presence:update', { users: getBoardUsers(boardId) })
    }
    joinedBoards.clear()
  })
}
