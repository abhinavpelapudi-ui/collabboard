import { useEffect, useRef, useState } from 'react'
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
import BoardChat from '../components/ui/BoardChat'
import ActivityLog from '../components/ui/ActivityLog'
import ObjectDetailPanel from '../components/ui/ObjectDetailPanel'
import DocumentsPanel from '../components/ui/DocumentsPanel'
import { EmbeddedDocEditor } from './DocumentEditor'
import { Board as BoardType, BoardRole } from '@collabboard/shared'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

export default function Board() {
  const { boardId } = useParams<{ boardId: string }>()
  const navigate = useNavigate()
  const socketRef = useSocket(boardId!, (newRole) => setRole(newRole))
  const { objects, addObject, removeObject, pushUndo, undo } = useBoardStore()
  const { showAIPanel, selectedIds, setSelectedIds, clearSelection, isConnected, setConnected } = useUIStore()

  // Keep stable refs so the keydown handler always sees fresh state
  const selectedIdsRef = useRef(selectedIds)
  const objectsRef = useRef(objects)
  useEffect(() => { selectedIdsRef.current = selectedIds }, [selectedIds])
  useEffect(() => { objectsRef.current = objects }, [objects])

  // Reset connected state on mount so the banner doesn't flash on navigation
  useEffect(() => { setConnected(true) }, [])

  // Unread chat badge — count incoming chat messages while panel is closed
  useEffect(() => {
    const socket = socketRef.current
    if (!socket || !isConnected) return
    function onChatMessage(raw: any) {
      if ((raw.messageType ?? 'chat') !== 'chat') return
      if (!showChatRef.current) setUnreadChat(n => n + 1)
    }
    socket.on('chat:message', onChatMessage)
    return () => { socket.off('chat:message', onChatMessage) }
  }, [isConnected])
  const [board, setBoard] = useState<BoardType | null>(null)
  const [role, setRole] = useState<BoardRole | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [showShare, setShowShare] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [unreadChat, setUnreadChat] = useState(0)
  const [showDocs, setShowDocs] = useState(false)
  const [activeDocId, setActiveDocId] = useState<string | null>(null)
  const showChatRef = useRef(showChat)
  useEffect(() => { showChatRef.current = showChat }, [showChat])

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
      if (inInput) return

      // Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); return }

      const ids = selectedIdsRef.current
      const objs = objectsRef.current
      if (ids.length === 0) return

      // Delete / Backspace — remove all selected objects
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        pushUndo()
        ids.forEach(id => {
          removeObject(id)
          socketRef.current?.emit('object:delete', { boardId, objectId: id })
        })
        clearSelection()
        return
      }

      // Ctrl/Cmd+D — duplicate selected objects
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault()
        pushUndo()
        const newIds: string[] = []
        ids.forEach(id => {
          const obj = objs.get(id)
          if (!obj || obj.type === 'connector') return
          const copy = { ...obj, id: crypto.randomUUID(), x: obj.x + 20, y: obj.y + 20, updated_at: new Date().toISOString() }
          addObject(copy)
          socketRef.current?.emit('object:create', { boardId, object: copy })
          newIds.push(copy.id)
        })
        if (newIds.length) setSelectedIds(newIds)
        return
      }

      // Ctrl/Cmd+A — select all non-connector objects
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        const allIds = Array.from(objs.values()).filter(o => o.type !== 'connector').map(o => o.id)
        setSelectedIds(allIds)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [boardId, undo, pushUndo, removeObject, addObject, clearSelection, setSelectedIds])

  async function saveTitle() {
    if (!board || titleValue === board.title) { setEditingTitle(false); return }
    await axios.patch(`${SERVER_URL}/api/boards/${boardId}`, { title: titleValue }, { headers: authHeaders() })
    setBoard(prev => prev ? { ...prev, title: titleValue } : prev)
    setEditingTitle(false)
  }

  if (!boardId) return null

  return (
    <div className="w-screen h-screen overflow-hidden bg-surface flex flex-col">
      {/* Top bar */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2 bg-surface-raised/80 backdrop-blur-sm border-b border-surface-border">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-slate-500 hover:text-slate-900 text-sm">
            ← Boards
          </button>

          {canEdit && editingTitle ? (
            <input
              autoFocus
              className="bg-surface-overlay text-slate-900 text-sm font-medium px-2 py-1 rounded border border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none min-w-[200px]"
              value={titleValue}
              onChange={e => setTitleValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
              onBlur={saveTitle}
            />
          ) : (
            <span
              className={`text-sm font-medium text-slate-900 ${canEdit ? 'cursor-pointer hover:text-indigo-600' : ''}`}
              onClick={() => canEdit && setEditingTitle(true)}
            >
              {board?.title || 'Loading...'}
            </span>
          )}

          {isViewer && (
            <span className="text-xs text-slate-400 bg-surface-overlay px-2 py-0.5 rounded-full border border-surface-border">
              View only
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <PresenceBar />
          {role === 'owner' && (
            <button
              className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded bg-surface-overlay hover:bg-surface-hover transition-colors"
              onClick={() => setShowShare(true)}
            >
              Manage access
            </button>
          )}
          <button
            className={`relative text-xs px-2 py-1 rounded transition-colors ${showChat ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500' : 'bg-surface-overlay text-slate-500 hover:text-slate-900 hover:bg-surface-hover'}`}
            onClick={() => { setShowChat(s => !s); setUnreadChat(0); setShowActivity(false) }}
            title="Board chat"
          >
            💬 Chat
            {unreadChat > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
                {unreadChat > 9 ? '9+' : unreadChat}
              </span>
            )}
          </button>
          <button
            className={`text-xs px-2 py-1 rounded transition-colors ${showActivity ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-500' : 'bg-surface-overlay text-slate-500 hover:text-slate-900 hover:bg-surface-hover'}`}
            onClick={() => { setShowActivity(s => !s); setShowChat(false) }}
            title="Activity log"
          >
            📋 Activity
          </button>
          <button
            className={`text-xs px-2 py-1 rounded transition-colors ${showDocs ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500' : 'bg-surface-overlay text-slate-500 hover:text-slate-900 hover:bg-surface-hover'}`}
            onClick={() => setShowDocs(s => !s)}
            title="Documents"
          >
            📄 Docs
          </button>
        </div>
      </header>

      {/* Disconnected banner */}
      {!isConnected && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-red-900/90 border border-red-700 text-red-200 text-xs px-4 py-2 rounded-xl shadow-lg pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse flex-shrink-0" />
          Connection lost — reconnecting…
        </div>
      )}

      {/* Canvas */}
      <BoardCanvas boardId={boardId} socketRef={socketRef} />

      {/* Toolbar — hidden for viewers */}
      {!isViewer && <Toolbar />}

      {/* AI Chat Panel — editors and owners only */}
      {!isViewer && showAIPanel && <AIChat boardId={boardId} socketRef={socketRef} />}

      {/* Share / Manage access modal */}
      {showShare && <ShareModal boardId={boardId} onClose={() => setShowShare(false)} />}

      {/* Board chat panel */}
      {showChat && (
        <BoardChat
          boardId={boardId}
          socket={socketRef.current}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* Activity log panel */}
      {showActivity && (
        <ActivityLog
          boardId={boardId}
          socket={socketRef.current}
          onClose={() => setShowActivity(false)}
        />
      )}

      {/* Object detail panel — task metadata + comments */}
      {selectedIds.length === 1 && (() => {
        const obj = objects.get(selectedIds[0])
        return obj && obj.type !== 'connector'
      })() && (
        <ObjectDetailPanel
          boardId={boardId}
          objectId={selectedIds[0]}
          socketRef={socketRef}
          onClose={clearSelection}
        />
      )}

      {/* Documents panel */}
      {showDocs && (
        <DocumentsPanel
          boardId={boardId}
          onClose={() => setShowDocs(false)}
          onOpenDoc={(docId) => { setActiveDocId(docId); setShowDocs(false) }}
        />
      )}

      {/* Embedded document editor overlay */}
      {activeDocId && (
        <div className="absolute inset-0 z-40 bg-surface/95 backdrop-blur-sm">
          <EmbeddedDocEditor
            boardId={boardId}
            docId={activeDocId}
            onClose={() => setActiveDocId(null)}
          />
        </div>
      )}
    </div>
  )
}
