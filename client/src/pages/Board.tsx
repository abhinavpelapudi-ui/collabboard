import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { getToken } from '../hooks/useAuth'
import { useSocket } from '../hooks/useSocket'
import { useBoardStore } from '../stores/boardStore'
import { useUIStore } from '../stores/uiStore'
import BoardCanvas from '../components/canvas/BoardCanvas'
import Toolbar from '../components/ui/Toolbar'
import PresenceBar from '../components/ui/PresenceBar'
import AIChat from '../components/ui/AIChat'
import ShareModal from '../components/ui/ShareModal'
import { Board as BoardType, BoardRole } from '@collabboard/shared'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

export default function Board() {
  const { boardId } = useParams<{ boardId: string }>()
  const navigate = useNavigate()
  const socketRef = useSocket(boardId!, (newRole) => setRole(newRole))
  const { undo } = useBoardStore()
  const { showAIPanel } = useUIStore()
  const [board, setBoard] = useState<BoardType | null>(null)
  const [role, setRole] = useState<BoardRole | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [showShare, setShowShare] = useState(false)

  const isViewer = role === 'viewer'
  const canEdit = role === 'editor' || role === 'owner'

  function authHeaders() {
    return { Authorization: `Bearer ${getToken()}` }
  }

  useEffect(() => {
    if (!boardId) return
    axios.get(`${SERVER_URL}/api/boards/${boardId}`, { headers: authHeaders() })
      .then(({ data }) => {
        setBoard(data)
        setTitleValue(data.title)
        setRole(data.role ?? 'viewer')
      })
  }, [boardId])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const focused = document.activeElement
      const inInput = focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !inInput) { e.preventDefault(); undo() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo])

  async function saveTitle() {
    if (!board || titleValue === board.title) { setEditingTitle(false); return }
    await axios.patch(`${SERVER_URL}/api/boards/${boardId}`, { title: titleValue }, { headers: authHeaders() })
    setBoard(prev => prev ? { ...prev, title: titleValue } : prev)
    setEditingTitle(false)
  }

  if (!boardId) return null

  return (
    <div className="w-screen h-screen overflow-hidden bg-gray-950 flex flex-col">
      {/* Top bar */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2 bg-gray-900/80 backdrop-blur border-b border-gray-800">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white text-sm">
            ← Boards
          </button>

          {canEdit && editingTitle ? (
            <input
              autoFocus
              className="bg-gray-800 text-white text-sm font-medium px-2 py-1 rounded border border-indigo-500 outline-none min-w-[200px]"
              value={titleValue}
              onChange={e => setTitleValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
              onBlur={saveTitle}
            />
          ) : (
            <span
              className={`text-sm font-medium text-white ${canEdit ? 'cursor-pointer hover:text-indigo-300' : ''}`}
              onClick={() => canEdit && setEditingTitle(true)}
            >
              {board?.title || 'Loading...'}
            </span>
          )}

          {isViewer && (
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
              View only
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <PresenceBar />
          {role === 'owner' && (
            <button
              className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-800"
              onClick={() => setShowShare(true)}
            >
              Manage access
            </button>
          )}
          <button
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-800"
            onClick={() => { navigator.clipboard.writeText(window.location.href); alert('Link copied!') }}
          >
            Share
          </button>
        </div>
      </header>

      {/* Canvas */}
      <BoardCanvas boardId={boardId} socketRef={socketRef} />

      {/* Toolbar — hidden for viewers */}
      {!isViewer && <Toolbar />}

      {/* AI Chat Panel — editors and owners only */}
      {!isViewer && showAIPanel && <AIChat boardId={boardId} socketRef={socketRef} />}

      {/* Share / Manage access modal */}
      {showShare && <ShareModal boardId={boardId} onClose={() => setShowShare(false)} />}
    </div>
  )
}
