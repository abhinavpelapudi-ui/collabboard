import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { getToken } from '../hooks/useAuth'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

export default function DocumentEditor() {
  const { boardId, docId } = useParams<{ boardId: string; docId: string }>()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [editingTitle, setEditingTitle] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function authHeaders() {
    return { Authorization: `Bearer ${getToken()}` }
  }

  const saveContent = useCallback((json: object) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      axios.patch(
        `${SERVER_URL}/api/boards/${boardId}/docs/${docId}`,
        { content: json },
        { headers: authHeaders() }
      ).catch(() => {})
    }, 1000)
  }, [boardId, docId])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing...' }),
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-sm max-w-none focus:outline-none min-h-[calc(100vh-120px)] px-8 py-6',
      },
    },
    onUpdate: ({ editor }) => {
      saveContent(editor.getJSON())
    },
  })

  // Load document
  useEffect(() => {
    if (!boardId || !docId) return
    axios.get(`${SERVER_URL}/api/boards/${boardId}/docs/${docId}`, {
      headers: authHeaders(),
    }).then(({ data }) => {
      const doc = data.document
      setTitle(doc.title || 'Untitled')
      if (editor && doc.content && Object.keys(doc.content).length > 0) {
        editor.commands.setContent(doc.content)
      }
    }).catch(() => navigate(`/board/${boardId}`))
      .finally(() => setLoading(false))
  }, [boardId, docId, editor])

  async function saveTitle() {
    setEditingTitle(false)
    if (!title.trim()) { setTitle('Untitled'); return }
    try {
      await axios.patch(
        `${SERVER_URL}/api/boards/${boardId}/docs/${docId}`,
        { title: title.trim() },
        { headers: authHeaders() }
      )
    } catch {}
  }

  if (loading) {
    return (
      <div className="w-screen h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading document...</p>
      </div>
    )
  }

  return (
    <div className="w-screen h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/board/${boardId}`)}
            className="text-gray-400 hover:text-white text-sm"
          >
            ← Back to Board
          </button>

          {editingTitle ? (
            <input
              autoFocus
              className="bg-gray-800 text-white text-sm font-medium px-2 py-1 rounded border border-indigo-500 outline-none min-w-[200px]"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
              onBlur={saveTitle}
            />
          ) : (
            <span
              className="text-sm font-medium text-white cursor-pointer hover:text-indigo-300"
              onClick={() => setEditingTitle(true)}
            >
              {title}
            </span>
          )}
        </div>

        <span className="text-xs text-gray-500">Auto-saved</span>
      </header>

      {/* Toolbar */}
      {editor && (
        <div className="flex items-center gap-1 px-4 py-2 bg-gray-900/50 border-b border-gray-800">
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`px-2 py-1 text-xs rounded ${editor.isActive('heading', { level: 1 }) ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            H1
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`px-2 py-1 text-xs rounded ${editor.isActive('heading', { level: 2 }) ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            H2
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`px-2 py-1 text-xs rounded font-bold ${editor.isActive('bold') ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            B
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`px-2 py-1 text-xs rounded italic ${editor.isActive('italic') ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            I
          </button>
          <div className="w-px h-5 bg-gray-700 mx-1" />
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`px-2 py-1 text-xs rounded ${editor.isActive('bulletList') ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            List
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`px-2 py-1 text-xs rounded ${editor.isActive('orderedList') ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            1. List
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={`px-2 py-1 text-xs rounded ${editor.isActive('codeBlock') ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            Code
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`px-2 py-1 text-xs rounded ${editor.isActive('blockquote') ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            Quote
          </button>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-y-auto bg-gray-950">
        <div className="max-w-3xl mx-auto">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}
