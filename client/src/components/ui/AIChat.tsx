import { useState, useRef, useEffect } from 'react'
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
  traceId?: string
  command?: string
  model?: string
}

// SpeechRecognition types for browser API
interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } }
  resultIndex: number
}

interface SpeechRecognitionInstance {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

function getSpeechRecognition(): SpeechRecognitionInstance | null {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SR) return null
  return new SR() as SpeechRecognitionInstance
}

export default function AIChat({ boardId, socketRef }: Props) {
  const { objects, addObject, updateObject, removeObject } = useBoardStore()
  const { selectedIds, triggerFit } = useUIStore()
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: 'Hi! Tell me what to create on the board. Try: "Create a SWOT analysis" or "Add 3 yellow sticky notes"' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile')
  const [availableModels, setAvailableModels] = useState<Array<{
    model_id: string; display_name: string; provider: string; is_free: boolean; available: boolean
  }>>([])
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({})
  const [feedbackComment, setFeedbackComment] = useState<Record<string, string>>({})
  const [showCommentFor, setShowCommentFor] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Fetch available models on mount
  useEffect(() => {
    axios.get(`${SERVER_URL}/api/agent/models`)
      .then(({ data }) => {
        setAvailableModels(data.models || [])
        if (data.default) setSelectedModel(data.default)
      })
      .catch(() => {
        setAvailableModels([
          { model_id: 'llama-3.3-70b-versatile', display_name: 'Llama 3.3 70B (Groq, free)', provider: 'groq', is_free: true, available: true }
        ])
      })
  }, [])

  function applyActions(data: any) {
    if (data.createdObjects?.length) {
      data.createdObjects.forEach((obj: BoardObject) => {
        addObject(obj)
        socketRef.current?.emit('object:create', { boardId, object: obj })
      })
      triggerFit()
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
    if (data.fitToView) {
      triggerFit()
    }
  }

  async function submitFeedback(msg: Message, rating: 'up' | 'down', comment = '') {
    if (!msg.traceId) return
    setFeedback(prev => ({ ...prev, [msg.traceId!]: rating }))
    setShowCommentFor(null)
    try {
      const token = getToken()
      await axios.post(
        `${SERVER_URL}/api/agent/feedback`,
        {
          boardId,
          traceId: msg.traceId,
          rating,
          comment,
          command: msg.command || '',
          response: msg.text,
          model: msg.model || '',
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
    } catch {
      // Non-critical — silently fail
    }
  }

  async function sendCommand() {
    if (!input.trim() || loading) return
    const command = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: command }])
    setLoading(true)

    try {
      const token = getToken()
      const endpoint = `${SERVER_URL}/api/agent/command`

      // If user has an object selected, include its details so they can say "describe this" etc.
      let contextCommand = command
      if (selectedIds.length === 1) {
        const sel = objects.get(selectedIds[0])
        if (sel) {
          const text = (sel as any).text || (sel as any).title || ''
          contextCommand = `[Selected object: id=${sel.id}, type=${sel.type}${text ? `, text="${text}"` : ''}] ${command}`
        }
      }

      const body: any = { boardId, command: contextCommand, model: selectedModel }

      const { data } = await axios.post(
        endpoint,
        body,
        { headers: { Authorization: `Bearer ${token}` } }
      )

      applyActions(data)
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: data.message || 'Done!',
        traceId: data.traceId || undefined,
        command,
        model: selectedModel,
      }])
    } catch (err: any) {
      const errMsg = err?.response?.data?.error || 'Something went wrong. Try again.'
      setMessages(prev => [...prev, { role: 'assistant', text: errMsg }])
    } finally {
      setLoading(false)
    }
  }

  // ─── File Upload ────────────────────────────────────────────────────────────

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const allowed = ['.pdf', '.docx', '.txt', '.doc']
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
    if (!allowed.includes(ext)) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Unsupported file type. Please upload PDF, DOCX, or TXT files.` }])
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'File too large. Maximum size is 10MB.' }])
      return
    }

    setMessages(prev => [...prev, { role: 'user', text: `Uploading: ${file.name}` }])
    setLoading(true)

    try {
      const token = getToken()
      const formData = new FormData()
      formData.append('file', file)
      formData.append('boardId', boardId)

      const { data } = await axios.post(
        `${SERVER_URL}/api/agent/upload`,
        formData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      )

      setUploadedFile(file.name)
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `Uploaded "${file.name}" (${data.metadata?.page_count || data.metadata?.word_count || '?'} pages/words). You can now ask me to create a sprint board, summarize it, or extract action items from it.`
      }])
    } catch (err: any) {
      const errMsg = err?.response?.data?.error || 'Failed to upload file.'
      setMessages(prev => [...prev, { role: 'assistant', text: errMsg }])
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ─── Voice Input ────────────────────────────────────────────────────────────

  function toggleVoice() {
    if (isRecording) {
      recognitionRef.current?.stop()
      setIsRecording(false)
      return
    }

    const recognition = getSpeechRecognition()
    if (!recognition) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Voice input is not supported in this browser. Try Chrome.' }])
      return
    }

    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = ''
      for (let i = event.resultIndex; i < Object.keys(event.results).length; i++) {
        transcript += event.results[i][0].transcript
      }
      setInput(transcript)
    }

    recognition.onerror = () => {
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsRecording(true)
  }

  return (
    <div className="absolute right-4 bottom-20 z-30 w-80 bg-surface-raised border border-surface-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-border flex items-center gap-2">
        <span className="text-indigo-400">✦</span>
        <span className="text-sm font-semibold text-white">AI Board Agent</span>
      </div>

      {/* Model selector */}
      {availableModels.length > 0 && (
        <div className="px-3 py-1.5 bg-surface-overlay/50 border-b border-surface-border">
          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            className="w-full bg-surface-overlay text-slate-200 text-xs rounded-md px-2 py-1.5 border border-surface-border outline-none focus:border-emerald-500"
          >
            {availableModels.map(m => (
              <option key={m.model_id} value={m.model_id} disabled={!m.available}>
                {m.display_name}{m.is_free ? ' (free)' : ''}{!m.available ? ' — no key' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Uploaded file indicator */}
      {uploadedFile && (
        <div className="px-3 py-1.5 bg-surface-overlay border-b border-surface-border flex items-center justify-between">
          <span className="text-xs text-emerald-400 truncate">📄 {uploadedFile}</span>
          <button
            onClick={() => setUploadedFile(null)}
            className="text-slate-500 hover:text-slate-300 text-xs ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-72">
        {messages.map((msg, i) => (
          <div key={i} className={`max-w-[90%] ${msg.role === 'user' ? 'ml-auto' : ''}`}>
            <div
              className={`text-sm rounded-xl px-3 py-2 ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-surface-overlay text-slate-200'
              }`}
            >
              {msg.text}
            </div>
            {msg.role === 'assistant' && msg.traceId && (
              <div className="mt-1 flex items-center gap-1">
                {feedback[msg.traceId] ? (
                  <span className="text-xs text-slate-500">
                    {feedback[msg.traceId] === 'up' ? '👍' : '👎'} Thanks for your feedback!
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => submitFeedback(msg, 'up')}
                      className="text-xs text-slate-500 hover:text-emerald-400 px-1.5 py-0.5 rounded hover:bg-surface-overlay transition-colors"
                      title="Good response"
                    >
                      👍
                    </button>
                    <button
                      onClick={() => {
                        if (showCommentFor === msg.traceId) {
                          setShowCommentFor(null)
                        } else {
                          setShowCommentFor(msg.traceId!)
                        }
                      }}
                      className="text-xs text-slate-500 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-surface-overlay transition-colors"
                      title="Bad response"
                    >
                      👎
                    </button>
                  </>
                )}
              </div>
            )}
            {showCommentFor === msg.traceId && !feedback[msg.traceId!] && (
              <div className="mt-1 flex gap-1">
                <input
                  className="flex-1 bg-surface-overlay text-white text-xs rounded-md px-2 py-1 outline-none border border-surface-border focus:border-red-500"
                  placeholder="What went wrong? (optional)"
                  value={feedbackComment[msg.traceId!] || ''}
                  onChange={e => setFeedbackComment(prev => ({ ...prev, [msg.traceId!]: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      submitFeedback(msg, 'down', feedbackComment[msg.traceId!] || '')
                    }
                  }}
                />
                <button
                  onClick={() => submitFeedback(msg, 'down', feedbackComment[msg.traceId!] || '')}
                  className="text-xs bg-surface-overlay hover:bg-surface-hover text-slate-300 px-2 py-1 rounded-md transition-colors"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="bg-surface-overlay text-slate-400 text-sm rounded-xl px-3 py-2 w-fit">
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-surface-border flex flex-col gap-2">
        {selectedIds.length === 1 && (() => {
          const sel = objects.get(selectedIds[0])
          if (!sel || sel.type === 'connector') return null
          const text = (sel as any).text || (sel as any).title || ''
          return (
            <div className="text-[10px] text-indigo-300 bg-indigo-900/30 px-2 py-1 rounded">
              Selected: {sel.type}{text ? ` — "${text.length > 30 ? text.slice(0, 30) + '...' : text}"` : ''}
            </div>
          )
        })()}
        <div className="flex gap-2">
          <input
            className="flex-1 bg-surface-overlay text-white text-sm rounded-lg px-3 py-2 outline-none border border-surface-border focus:border-indigo-500"
            placeholder={isRecording ? 'Listening...' : selectedIds.length === 1 ? 'Ask about selected object...' : 'Tell AI what to do...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendCommand()}
          />
          <button
            onClick={sendCommand}
            disabled={loading || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-3 py-2 rounded-lg font-medium"
          >
            ➜
          </button>
        </div>

        {/* Action buttons: Upload + Voice */}
        <div className="flex gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="flex-1 bg-surface-overlay hover:bg-surface-hover disabled:opacity-50 text-slate-300 text-xs px-3 py-1.5 rounded-lg border border-surface-border transition-colors"
            title="Upload PDF, DOCX, or TXT file"
          >
            📎 Upload File
          </button>
          <button
            onClick={toggleVoice}
            disabled={loading}
            className={`flex-1 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              isRecording
                ? 'bg-red-600/20 border-red-500 text-red-400 hover:bg-red-600/30'
                : 'bg-surface-overlay border-surface-border text-slate-300 hover:bg-surface-hover'
            } disabled:opacity-50`}
            title="Voice input (requires microphone)"
          >
            {isRecording ? '⏹ Stop' : '🎤 Voice'}
          </button>
        </div>
      </div>
    </div>
  )
}
