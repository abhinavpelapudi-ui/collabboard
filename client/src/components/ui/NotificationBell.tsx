import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { getToken } from '../../hooks/useAuth'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

interface Notification {
  id: string
  type: string
  data: {
    boardId: string
    boardTitle: string
    sharedBy: string
    role: string
  }
  read_at: string | null
  created_at: string
}

interface Props {
  // Socket.IO instance to listen for real-time notifications
  socket: any
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function NotificationBell({ socket }: Props) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const ref = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.read_at).length

  function authHeaders() {
    return { Authorization: `Bearer ${getToken()}` }
  }

  async function fetchNotifications() {
    try {
      const { data } = await axios.get(`${SERVER_URL}/api/notifications`, { headers: authHeaders() })
      setNotifications(data)
    } catch {}
  }

  async function markAllRead() {
    await axios.patch(`${SERVER_URL}/api/notifications/read-all`, {}, { headers: authHeaders() })
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Fetch on mount
  useEffect(() => { fetchNotifications() }, [])

  // Real-time new notifications via Socket.IO
  useEffect(() => {
    if (!socket) return
    function onNew(notif: Notification) {
      setNotifications(prev => [notif, ...prev])
    }
    socket.on('notification:new', onNew)
    return () => socket.off('notification:new', onNew)
  }, [socket])

  function handleOpen() {
    setOpen(o => !o)
    if (!open && unreadCount > 0) markAllRead()
  }

  function goToBoard(boardId: string) {
    setOpen(false)
    navigate(`/board/${boardId}`)
  }

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        aria-label="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center bg-indigo-500 text-white text-[10px] font-bold rounded-full px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {notifications.length > 0 && (
              <button onClick={markAllRead} className="text-xs text-indigo-400 hover:text-indigo-300">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">No notifications yet</p>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => goToBoard(n.data.boardId)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-800 transition-colors border-b border-gray-800/50 last:border-0 ${!n.read_at ? 'bg-indigo-500/5' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${!n.read_at ? 'bg-indigo-400' : 'bg-transparent'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white leading-snug">
                        <span className="font-medium">{n.data.sharedBy}</span> shared{' '}
                        <span className="font-medium">"{n.data.boardTitle}"</span> with you
                        <span className="text-gray-400"> as {n.data.role}</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
