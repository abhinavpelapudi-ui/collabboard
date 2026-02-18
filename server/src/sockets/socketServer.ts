/**
 * Central Socket.IO registry.
 * Tracks userId → socketIds and per-socket role cache.
 * Allows HTTP route handlers (e.g. members.ts) to push events to connected users.
 */
import { Server } from 'socket.io'

let io: Server | null = null

// userId → Set<socketId>  (user may have multiple tabs open)
const userSockets = new Map<string, Set<string>>()

// socketId → Map<boardId, role>
const roleCache = new Map<string, Map<string, string>>()

export function setIO(instance: Server) {
  io = instance
}

export function registerUserSocket(userId: string, socketId: string) {
  if (!userSockets.has(userId)) userSockets.set(userId, new Set())
  userSockets.get(userId)!.add(socketId)
}

export function unregisterUserSocket(userId: string, socketId: string) {
  userSockets.get(userId)?.delete(socketId)
  if (!userSockets.get(userId)?.size) userSockets.delete(userId)
  roleCache.delete(socketId)
}

export function getCachedRole(socketId: string, boardId: string): string | undefined {
  return roleCache.get(socketId)?.get(boardId)
}

export function setCachedRole(socketId: string, boardId: string, role: string) {
  if (!roleCache.has(socketId)) roleCache.set(socketId, new Map())
  roleCache.get(socketId)!.set(boardId, role)
}

/**
 * Pushes a `role:changed` event to all active sockets for `userId`
 * and updates their role cache so subsequent object events are enforced correctly.
 */
export function notifyRoleChanged(userId: string, boardId: string, newRole: string) {
  if (!io) return
  const sockets = userSockets.get(userId) ?? new Set<string>()
  for (const socketId of sockets) {
    // Keep cache consistent with new role
    if (roleCache.has(socketId)) {
      roleCache.get(socketId)!.set(boardId, newRole)
    }
    // Push event to this socket
    io.to(socketId).emit('role:changed', { boardId, role: newRole })
  }
}
