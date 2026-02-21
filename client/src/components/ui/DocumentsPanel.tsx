import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { getToken } from '../../hooks/useAuth'
import { BoardDocument } from '@collabboard/shared'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

interface Props {
  boardId: string
  onClose: () => void
}

export default function DocumentsPanel({ boardId, onClose }: Props) {
  const navigate = useNavigate()
  const [docs, setDocs] = useState<BoardDocument[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${SERVER_URL}/api/boards/${boardId}/docs`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }).then(({ data }) => setDocs(data.documents || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [boardId])

  async function createDoc() {
    try {
      const { data } = await axios.post(
        `${SERVER_URL}/api/boards/${boardId}/docs`,
        { title: 'Untitled' },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      )
      const doc = data.document
      navigate(`/board/${boardId}/doc/${doc.id}`)
    } catch {}
  }

  async function deleteDoc(docId: string) {
    try {
      await axios.delete(`${SERVER_URL}/api/boards/${boardId}/docs/${docId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      setDocs(prev => prev.filter(d => d.id !== docId))
    } catch {}
  }

  return (
    <div className="absolute right-4 bottom-20 z-30 w-80 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-96">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Documents</span>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">✕</button>
      </div>

      {/* Create */}
      <div className="px-3 py-2 border-b border-gray-700">
        <button
          onClick={createDoc}
          className="w-full text-xs bg-indigo-600 hover:bg-indigo-500 text-white py-1.5 rounded-lg font-medium"
        >
          + New Document
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && <p className="text-xs text-gray-500 px-2 py-1">Loading...</p>}
        {!loading && docs.length === 0 && (
          <p className="text-xs text-gray-500 px-2 py-1">No documents yet</p>
        )}
        {docs.map(doc => (
          <div
            key={doc.id}
            className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-800 cursor-pointer group"
            onClick={() => navigate(`/board/${boardId}/doc/${doc.id}`)}
          >
            <div className="min-w-0">
              <p className="text-sm text-gray-200 truncate">{doc.title}</p>
              <p className="text-[10px] text-gray-500">
                {new Date(doc.updated_at).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); deleteDoc(doc.id) }}
              className="text-gray-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 ml-2"
              title="Delete"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
