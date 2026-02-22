import { useState, useRef, useEffect } from 'react'
import { api } from '../../lib/api'

interface Props {
  onNavigate: (boardId: string) => void
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  boardId?: string
  boardTitle?: string
}

export default function DashboardAIChat({ onNavigate }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { id: crypto.randomUUID(), role: 'assistant', text: 'Hi! Ask me to find a board — e.g. "Where is my SWOT analysis?" or "Take me to the project board"' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function sendQuery() {
    if (!input.trim() || loading) return
    const command = input.trim()
    setInput('')
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text: command }])
    setLoading(true)

    try {
      const { data } = await api.post(
        '/api/agent/dashboard',
        { command }
      )

      const msg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: data.message,
        boardId: data.boardId || undefined,
        boardTitle: data.boardTitle || undefined,
      }
      setMessages(prev => [...prev, msg])

      // Auto-navigate after 1.5s if a board was identified
      if (data.boardId) {
        setTimeout(() => onNavigate(data.boardId), 1500)
      }
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', text: err?.response?.data?.error || 'Something went wrong. Try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed right-6 bottom-6 z-50 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg transition-transform hover:scale-105"
        title="Ask AI to find a board"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    )
  }

  return (
    <div className="fixed right-6 bottom-6 z-50 w-80 bg-surface-raised border border-surface-border rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[480px]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">Board Navigator</span>
        <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-900 text-sm">
          ✕
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[200px]">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-surface-overlay text-slate-700'
              }`}
            >
              {msg.text}
              {msg.boardId && (
                <button
                  onClick={() => onNavigate(msg.boardId!)}
                  className="mt-2 block w-full text-center bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-1.5 rounded-lg font-medium"
                >
                  Go to {msg.boardTitle || 'board'} →
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface-overlay text-slate-500 px-3 py-2 rounded-xl text-xs">
              Searching...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-surface-border px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendQuery()}
            placeholder="Which board do you need?"
            className="flex-1 bg-surface-overlay text-slate-900 text-xs px-3 py-2 rounded-lg border border-surface-border focus:border-indigo-500 outline-none"
            disabled={loading}
          />
          <button
            onClick={sendQuery}
            disabled={loading || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs px-3 py-2 rounded-lg font-medium"
          >
            ➜
          </button>
        </div>
      </div>
    </div>
  )
}
