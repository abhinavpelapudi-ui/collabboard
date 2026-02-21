import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { getToken } from './useAuth'
import { useBoardStore } from '../stores/boardStore'
import { useCursorStore } from '../stores/cursorStore'
import { usePresenceStore } from '../stores/presenceStore'
import { useUIStore } from '../stores/uiStore'
import { BoardRole } from '@collabboard/shared'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

export function useSocket(boardId: string, onRoleChanged?: (role: BoardRole) => void) {
  const socketRef = useRef<Socket | null>(null)
  const onRoleChangedRef = useRef(onRoleChanged)
  onRoleChangedRef.current = onRoleChanged

  const { setObjects, clearObjects, addObject, updateObject, removeObject } = useBoardStore()
  const { updateCursor, removeCursor, clearCursors } = useCursorStore()
  const { setUsers } = usePresenceStore()
  const setConnected = useUIStore(s => s.setConnected)
  const triggerFit = useUIStore(s => s.triggerFit)

  useEffect(() => {
    if (!boardId) return
    const token = getToken()
    if (!token) return

    const socket = io(SERVER_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('board:join', { boardId })
    })
    socket.on('disconnect', () => { setConnected(false); clearCursors() })
    socket.on('connect_error', () => setConnected(false))
    socket.on('reconnect', () => { setConnected(true); socket.emit('board:join', { boardId }) })
    socket.on('board:state', ({ objects }) => {
      // Normalize: shift objects into positive coordinate space if any have negative positions
      if (objects?.length > 0) {
        let minX = 0, minY = 0
        for (const obj of objects) {
          if (obj.type === 'connector') continue
          if (obj.x < minX) minX = obj.x
          if (obj.y < minY) minY = obj.y
        }
        if (minX < 0 || minY < 0) {
          const shiftX = minX < 0 ? Math.abs(minX) + 100 : 0
          const shiftY = minY < 0 ? Math.abs(minY) + 100 : 0
          for (const obj of objects) {
            if (obj.type === 'connector') continue
            obj.x += shiftX
            obj.y += shiftY
          }
        }
      }
      setObjects(objects)
      if (objects?.length > 0) setTimeout(() => triggerFit(), 100)
    })
    socket.on('cursor:move', (cursor) => updateCursor(cursor))
    socket.on('cursor:leave', ({ userId }) => removeCursor(userId))
    socket.on('object:create', ({ object }) => addObject(object))
    socket.on('object:update', ({ objectId, props }) => updateObject(objectId, props))
    socket.on('object:delete', ({ objectId }) => removeObject(objectId))
    socket.on('presence:update', ({ users }) => setUsers(users))
    socket.on('role:changed', ({ role }) => onRoleChangedRef.current?.(role))

    return () => {
      socket.emit('board:leave', { boardId })
      socket.disconnect()
      socketRef.current = null
      clearCursors()
      clearObjects()
    }
  }, [boardId])

  return socketRef
}
