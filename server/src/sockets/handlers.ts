import { Server, Socket } from 'socket.io'
import { pool } from '../db'
import { BoardObject, PresenceUser } from '@collabboard/shared'
import { getUserRole } from '../routes/boards'
import { registerUserSocket, unregisterUserSocket, getCachedRole, setCachedRole } from './socketServer'
import { z } from 'zod'

// In-memory presence: boardId → Map<userId, PresenceUser & socketId>
const presence = new Map<string, Map<string, PresenceUser & { socketId: string }>>()

function getBoardUsers(boardId: string): PresenceUser[] {
  return Array.from(presence.get(boardId)?.values() ?? []).map(({ socketId, ...user }) => user)
}

export function registerSocketHandlers(io: Server, socket: Socket & { userId: string; userName: string; userColor: string }) {
  registerUserSocket(socket.userId, socket.id)
  let currentBoardId: string | null = null

  // ─── board:join ───────────────────────────────────────────────────────────
  socket.on('board:join', async ({ boardId }: { boardId: string }) => {
    if (!z.string().uuid().safeParse(boardId).success) return

    // Check access permission
    const role = await getUserRole(boardId, socket.userId)
    if (!role) {
      socket.emit('error', { message: 'You do not have access to this board' })
      return
    }

    currentBoardId = boardId
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
  })

  // ─── object:update ────────────────────────────────────────────────────────
  const updateQueue = new Map<string, ReturnType<typeof setTimeout>>()

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
      await pool.query(`DELETE FROM objects WHERE id = $1 AND board_id = $2`, [objectId, boardId])
    } catch (err) {
      console.error('Failed to persist object:delete', err)
    }
  })

  // ─── disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    unregisterUserSocket(socket.userId, socket.id)
    if (!currentBoardId) return

    presence.get(currentBoardId)?.delete(socket.userId)
    socket.to(`board:${currentBoardId}`).emit('cursor:leave', { userId: socket.userId })
    io.to(`board:${currentBoardId}`).emit('presence:update', { users: getBoardUsers(currentBoardId) })
  })
}
