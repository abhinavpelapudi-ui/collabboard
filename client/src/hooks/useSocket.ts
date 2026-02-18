import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { getToken } from './useAuth'
import { useBoardStore } from '../stores/boardStore'
import { useCursorStore } from '../stores/cursorStore'
import { usePresenceStore } from '../stores/presenceStore'
import { BoardRole } from '@collabboard/shared'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

export function useSocket(boardId: string, onRoleChanged?: (role: BoardRole) => void) {
  const socketRef = useRef<Socket | null>(null)
  const onRoleChangedRef = useRef(onRoleChanged)
  onRoleChangedRef.current = onRoleChanged

  const { setObjects, clearObjects, addObject, updateObject, removeObject } = useBoardStore()
  const { updateCursor, removeCursor, clearCursors } = useCursorStore()
  const { setUsers } = usePresenceStore()

  useEffect(() => {
    if (!boardId) return
    const token = getToken()
    if (!token) return

    const socket = io(SERVER_URL, { auth: { token }, transports: ['websocket'] })
    socketRef.current = socket

    socket.on('connect', () => { console.log('✅ Socket connected'); socket.emit('board:join', { boardId }) })
    socket.on('board:state', ({ objects }) => setObjects(objects))
    socket.on('cursor:move', (cursor) => updateCursor(cursor))
    socket.on('cursor:leave', ({ userId }) => removeCursor(userId))
    socket.on('object:create', ({ object }) => addObject(object))
    socket.on('object:update', ({ objectId, props }) => updateObject(objectId, props))
    socket.on('object:delete', ({ objectId }) => removeObject(objectId))
    socket.on('presence:update', ({ users }) => setUsers(users))
    socket.on('role:changed', ({ role }) => onRoleChangedRef.current?.(role))
    socket.on('disconnect', () => { console.log('❌ Disconnected'); clearCursors() })

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
