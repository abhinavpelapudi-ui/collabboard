import { useState } from 'react'
import axios from 'axios'
import { getToken } from '../../hooks/useAuth'
import type { Socket } from 'socket.io-client'
import { useBoardStore } from '../../stores/boardStore'
import { useUIStore } from '../../stores/uiStore'
import { BoardObject } from '@collabboard/shared'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

interface Props {
  boardId: string
  socketRef: React.MutableRefObject<Socket | null>
}

interface Message {
  role: 'user' | 'assistant'
  text: string
}

export default function AIChat({ boardId, socketRef }: Props) {
  const { addObject, updateObject, removeObject } = useBoardStore()
  const { triggerFit } = useUIStore()
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: 'Hi! Tell me what to create on the board. Try: "Create a SWOT analysis" or "Add 3 yellow sticky notes"' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  async function sendCommand() {
    if (!input.trim() || loading) return
    const command = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: command }])
    setLoading(true)

    try {
      const token = getToken()
      const { data } = await axios.post(
        `${SERVER_URL}/api/ai/command`,
        { boardId, command },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      // Apply AI-created objects to local store + broadcast via socket
      if (data.createdObjects?.length) {
        data.createdObjects.forEach((obj: BoardObject) => {
          addObject(obj)
          socketRef.current?.emit('object:create', { boardId, object: obj })
        })
        triggerFit() // pan canvas to origin so new objects are visible
      }

      if (data.updatedObjects?.length) {
        data.updatedObjects.forEach(({ objectId, props }: { objectId: string; props: Partial<BoardObject> }) => {
          updateObject(objectId, props)
          socketRef.current?.emit('object:update', { boardId, objectId, props })
        })
      }

      if (data.deletedObjectIds?.length) {
        data.deletedObjectIds.forEach((objectId: string) => {
          removeObject(objectId)
          socketRef.current?.emit('object:delete', { boardId, objectId })
        })
      }

      setMessages(prev => [...prev, { role: 'assistant', text: data.message || 'Done!' }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Something went wrong. Try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="absolute right-4 bottom-20 z-30 w-80 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
        <span className="text-indigo-400">✦</span>
        <span className="text-sm font-semibold text-white">AI Board Agent</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-72">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`text-sm rounded-xl px-3 py-2 max-w-[90%] ${
              msg.role === 'user'
                ? 'bg-indigo-600 text-white ml-auto'
                : 'bg-gray-800 text-gray-200'
            }`}
          >
            {msg.text}
          </div>
        ))}
        {loading && (
          <div className="bg-gray-800 text-gray-400 text-sm rounded-xl px-3 py-2 w-fit">
            Thinking...
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-700 flex gap-2">
        <input
          className="flex-1 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 outline-none border border-gray-600 focus:border-indigo-500"
          placeholder="Tell AI what to do..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendCommand()}
        />
        <button
          onClick={sendCommand}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-3 py-2 rounded-lg font-medium"
        >
          →
        </button>
      </div>
    </div>
  )
}
