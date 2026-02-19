import { useEffect, useRef, useState } from 'react'
import { Socket } from 'socket.io-client'
import axios from 'axios'
import { getToken, getUser } from '../../hooks/useAuth'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

interface ChatMessage {
  id: string
  userId: string
  userName: string
  userColor: string
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
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Generate a deterministic pastel color from a userId string
function colorFromId(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue},60%,65%)`
}

export default function BoardChat({ boardId, socket, onClose }: Props) {
  const user = getUser()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Fetch history
  useEffect(() => {
    axios
      .get(`${SERVER_URL}/api/boards/${boardId}/chat`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      .then(({ data }) => {
        setMessages(
          data.map((m: any) => ({
            id: m.id,
            userId: m.user_id,
            userName: m.user_name,
            userColor: colorFromId(m.user_id ?? m.user_name),
            content: m.content,
            createdAt: m.created_at,
          }))
        )
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [boardId])

  // Listen for new real-time messages
  useEffect(() => {
    if (!socket) return
    function onMessage(msg: ChatMessage) {
      setMessages(prev => [...prev, msg])
    }
    socket.on('chat:message', onMessage)
    return () => { socket.off('chat:message', onMessage) }
  }, [socket])

  // Auto-scroll to bottom when messages change or panel opens
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function sendMessage() {
    const trimmed = input.trim()
    if (!trimmed || !socket) return
    socket.emit('chat:send', { boardId, content: trimmed })
    setInput('')
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-gray-900 border-l border-gray-800 flex flex-col z-30 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-sm font-semibold text-white">Board Chat</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white transition-colors"
          aria-label="Close chat"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {loading ? (
          <p className="text-gray-500 text-xs text-center mt-4">Loading...</p>
        ) : messages.length === 0 ? (
          <p className="text-gray-600 text-xs text-center mt-8">
            No messages yet. Say hello!
          </p>
        ) : (
          messages.map(msg => {
            const isMe = msg.userId === user?.userId
            const color = msg.userColor || colorFromId(msg.userId)
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && (
                  <span className="text-xs font-medium mb-1" style={{ color }}>
                    {msg.userName}
                  </span>
                )}
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm break-words whitespace-pre-wrap ${
                    isMe
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-gray-800 text-gray-100 rounded-bl-sm'
                  }`}
                >
                  {msg.content}
                </div>
                <span className="text-gray-600 text-[10px] mt-0.5 px-1">
                  {timeLabel(msg.createdAt)}
                </span>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-800 px-3 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            className="flex-1 bg-gray-800 text-white text-sm px-3 py-2 rounded-xl border border-gray-700 focus:border-indigo-500 outline-none resize-none leading-relaxed"
            placeholder="Message… (Enter to send)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ maxHeight: '120px', overflowY: 'auto' }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white p-2 rounded-xl transition-colors flex-shrink-0"
            aria-label="Send"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-gray-700 text-[10px] mt-1 pl-1">Shift+Enter for new line</p>
      </div>
    </div>
  )
}
