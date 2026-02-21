import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { getToken } from '../hooks/useAuth'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

interface EmbeddedProps {
  boardId: string
  docId: string
  onClose: () => void
}

/** Embedded document editor panel (used within Board page) */
export function EmbeddedDocEditor({ boardId, docId, onClose }: EmbeddedProps) {
  return <DocumentEditorInner boardId={boardId} docId={docId} onClose={onClose} />
}

/** Standalone page (used via /board/:boardId/doc/:docId route) */
export default function DocumentEditor() {
  const { boardId, docId } = useParams<{ boardId: string; docId: string }>()
  const navigate = useNavigate()
  if (!boardId || !docId) return null
  return <DocumentEditorInner boardId={boardId} docId={docId} onClose={() => navigate(`/board/${boardId}`)} standalone />
}

function DocumentEditorInner({ boardId, docId, onClose, standalone }: { boardId: string; docId: string; onClose: () => void; standalone?: boolean }) {
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
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[300px] px-8 py-6',
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
    }).catch(() => onClose())
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

  const wrapperClass = standalone
    ? 'w-screen h-screen bg-surface flex flex-col'
    : 'w-full h-full bg-surface flex flex-col'

  if (loading) {
    return (
      <div className={`${wrapperClass} items-center justify-center`}>
        <p className="text-slate-500 text-sm">Loading document...</p>
      </div>
    )
  }

  return (
    <div className={wrapperClass}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-surface-raised border-b border-surface-border">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900 text-sm"
          >
            {standalone ? '← Back to Board' : '← Close'}
          </button>

          {editingTitle ? (
            <input
              autoFocus
              className="bg-surface-overlay text-slate-900 text-sm font-medium px-2 py-1 rounded border border-indigo-500 outline-none min-w-[200px]"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
              onBlur={saveTitle}
            />
          ) : (
            <span
              className="text-sm font-medium text-slate-900 cursor-pointer hover:text-indigo-600"
              onClick={() => setEditingTitle(true)}
            >
              {title}
            </span>
          )}
        </div>

        <span className="text-xs text-slate-400">Auto-saved</span>
      </header>

      {/* Toolbar */}
      {editor && (
        <div className="flex items-center gap-1 px-4 py-2 bg-surface-raised/50 border-b border-surface-border">
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`px-2 py-1 text-xs rounded ${editor.isActive('heading', { level: 1 }) ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-surface-overlay'}`}
          >
            H1
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`px-2 py-1 text-xs rounded ${editor.isActive('heading', { level: 2 }) ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-surface-overlay'}`}
          >
            H2
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`px-2 py-1 text-xs rounded font-bold ${editor.isActive('bold') ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-surface-overlay'}`}
          >
            B
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`px-2 py-1 text-xs rounded italic ${editor.isActive('italic') ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-surface-overlay'}`}
          >
            I
          </button>
          <div className="w-px h-5 bg-surface-border mx-1" />
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`px-2 py-1 text-xs rounded ${editor.isActive('bulletList') ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-surface-overlay'}`}
          >
            List
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`px-2 py-1 text-xs rounded ${editor.isActive('orderedList') ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-surface-overlay'}`}
          >
            1. List
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={`px-2 py-1 text-xs rounded ${editor.isActive('codeBlock') ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-surface-overlay'}`}
          >
            Code
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`px-2 py-1 text-xs rounded ${editor.isActive('blockquote') ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-surface-overlay'}`}
          >
            Quote
          </button>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-y-auto bg-surface">
        <div className="max-w-3xl mx-auto">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}
