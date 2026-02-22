import { useEffect, useRef, useState } from 'react'
import { Socket } from 'socket.io-client'
import { api } from '../../lib/api'

interface ActivityEntry {
  id: string
  userId: string
  userName: string
  content: string
  createdAt: string
}

interface Props {
  boardId: string
  socket: Socket | null
  onClose: () => void
}

function timeLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ActivityLog({ boardId, socket, onClose }: Props) {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Fetch history (audit entries only)
  useEffect(() => {
    api
      .get(`/api/boards/${boardId}/chat`)
      .then(({ data }) => {
        setEntries(
          data
            .filter((m: any) => (m.message_type ?? 'chat') === 'audit')
            .map((m: any) => ({
              id: m.id,
              userId: m.user_id,
              userName: m.user_name,
              content: m.content,
              createdAt: m.created_at,
            }))
        )
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [boardId])

  // Listen for real-time audit events
  useEffect(() => {
    if (!socket) return
    function onMessage(raw: any) {
      if ((raw.messageType ?? 'chat') !== 'audit') return
      setEntries(prev => [
        ...prev,
        {
          id: raw.id,
          userId: raw.userId,
          userName: raw.userName,
          content: raw.content,
          createdAt: raw.createdAt,
        },
      ])
    }
    socket.on('chat:message', onMessage)
    return () => { socket.off('chat:message', onMessage) }
  }, [socket])

  // Auto-scroll when new entries arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-surface-raised border-l border-surface-border flex flex-col z-30 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <span className="text-sm font-semibold text-slate-900">Activity Log</span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-900 transition-colors"
          aria-label="Close activity log"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Subtitle */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-surface-border bg-surface-raised/60">
        <p className="text-[10px] text-slate-400 uppercase tracking-widest">Board changes &amp; actions</p>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {loading ? (
          <p className="text-slate-400 text-xs text-center mt-4">Loading...</p>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-12 gap-3 text-center">
            <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-slate-400 text-xs">No activity yet.<br />Changes to the board will appear here.</p>
          </div>
        ) : (
          entries.map((entry, i) => {
            const isFirst = i === 0
            const prevDate = isFirst ? null : new Date(entries[i - 1].createdAt)
            const thisDate = new Date(entry.createdAt)
            const dayChanged =
              prevDate &&
              (prevDate.getFullYear() !== thisDate.getFullYear() ||
                prevDate.getMonth() !== thisDate.getMonth() ||
                prevDate.getDate() !== thisDate.getDate())

            return (
              <div key={entry.id}>
                {/* Day separator */}
                {(isFirst || dayChanged) && (
                  <div className="flex items-center gap-2 my-2">
                    <div className="flex-1 h-px bg-surface-overlay" />
                    <span className="text-[9px] text-slate-400 uppercase tracking-widest">
                      {thisDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <div className="flex-1 h-px bg-surface-overlay" />
                  </div>
                )}

                {/* Activity row */}
                <div className="flex items-start gap-2.5 py-1.5 px-2 rounded-lg hover:bg-surface-hover transition-colors group">
                  {/* Dot */}
                  <div className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500/70" />

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-600 leading-relaxed">{entry.content}</p>
                  </div>

                  {/* Time */}
                  <span className="text-[10px] text-slate-400 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {timeLabel(entry.createdAt)}
                  </span>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
