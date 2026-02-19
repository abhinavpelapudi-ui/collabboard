import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Board, BoardRole } from '@collabboard/shared'
import { getToken, getUser } from '../hooks/useAuth'
import UpgradeModal from '../components/ui/UpgradeModal'
import UserMenu from '../components/ui/UserMenu'

const FREE_BOARD_LIMIT = 2

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}` }
}

const roleBadge: Record<BoardRole, { label: string; className: string }> = {
  owner: { label: 'Owner', className: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
  editor: { label: 'Editor', className: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  viewer: { label: 'Viewer', className: 'text-gray-400 bg-gray-700 border-gray-600' },
}

export default function Dashboard() {
  const navigate = useNavigate()
  const user = getUser()
  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [showUpgrade, setShowUpgrade] = useState(false)

  const plan = user?.plan ?? 'free'
  const ownedCount = boards.filter(b => b.role === 'owner').length
  const atLimit = plan === 'free' && ownedCount >= FREE_BOARD_LIMIT

  async function fetchBoards() {
    const { data } = await axios.get(`${SERVER_URL}/api/boards`, { headers: authHeaders() })
    setBoards(data)
    setLoading(false)
  }

  async function createBoard() {
    try {
      const { data } = await axios.post(`${SERVER_URL}/api/boards`, { title: 'Untitled Board' }, { headers: authHeaders() })
      navigate(`/board/${data.id}`)
    } catch (err: any) {
      if (err.response?.data?.upgradeRequired) {
        setShowUpgrade(true)
      }
    }
  }

  async function renameBoard(id: string, title: string) {
    await axios.patch(`${SERVER_URL}/api/boards/${id}`, { title }, { headers: authHeaders() })
    setBoards(prev => prev.map(b => (b.id === id ? { ...b, title } : b)))
    setEditingId(null)
  }

  async function deleteBoard(id: string) {
    if (!confirm('Delete this board?')) return
    await axios.delete(`${SERVER_URL}/api/boards/${id}`, { headers: authHeaders() })
    setBoards(prev => prev.filter(b => b.id !== id))
  }

  useEffect(() => { fetchBoards() }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">CollabBoard</h1>
        <div className="flex items-center gap-3">
          {plan === 'free' && !loading && (
            <span className={`text-xs px-2.5 py-1 rounded-full border ${atLimit ? 'text-amber-400 bg-amber-400/10 border-amber-400/30' : 'text-gray-400 bg-gray-800 border-gray-700'}`}>
              {ownedCount} / {FREE_BOARD_LIMIT} boards
              {atLimit && (
                <button onClick={() => navigate('/pricing')} className="ml-1.5 text-amber-300 hover:text-white font-medium">
                  Upgrade
                </button>
              )}
            </span>
          )}
          {user && <UserMenu user={user} />}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-semibold">My Boards</h2>
          <button
            onClick={createBoard}
            className={`px-4 py-2 rounded-lg font-medium transition-colors text-white ${atLimit ? 'bg-gray-700 hover:bg-gray-600' : 'bg-indigo-600 hover:bg-indigo-500'}`}
          >
            + New Board
          </button>
        </div>

        {loading ? (
          <div className="text-gray-400">Loading...</div>
        ) : boards.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg mb-4">No boards yet</p>
            <button onClick={createBoard} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium">
              Create your first board
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map(board => {
              const boardRole = board.role ?? 'viewer'
              const isOwner = boardRole === 'owner'
              const canEdit = boardRole === 'owner' || boardRole === 'editor'
              const badge = roleBadge[boardRole]

              return (
                <div
                  key={board.id}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-indigo-500 transition-colors cursor-pointer group"
                  onClick={() => navigate(`/board/${board.id}`)}
                >
                  <div className="w-full h-28 bg-gray-800 rounded-lg mb-4 flex items-center justify-center text-gray-600 text-sm">
                    Board
                  </div>

                  {editingId === board.id ? (
                    <input
                      autoFocus
                      className="bg-gray-800 text-white text-sm font-medium w-full px-2 py-1 rounded border border-indigo-500 outline-none"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') renameBoard(board.id, editTitle)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={() => renameBoard(board.id, editTitle)}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <p className="text-sm font-medium text-white truncate">{board.title}</p>
                  )}

                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-gray-500">{new Date(board.created_at).toLocaleDateString()}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    {canEdit && (
                      <button
                        className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                        onClick={e => { e.stopPropagation(); setEditingId(board.id); setEditTitle(board.title) }}
                      >
                        Rename
                      </button>
                    )}
                    {isOwner && (
                      <button
                        className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                        onClick={e => { e.stopPropagation(); deleteBoard(board.id) }}
                      >
                        Delete
                      </button>
                    )}
                    <button
                      className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 ml-auto"
                      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}/board/${board.id}`); alert('Link copied!') }}
                    >
                      Copy link
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  )
}
