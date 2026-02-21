import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { io, Socket } from 'socket.io-client'
import { Board, BoardRole, Workspace, Project } from '@collabboard/shared'
import { getToken, getUser } from '../hooks/useAuth'
import UpgradeModal from '../components/ui/UpgradeModal'
import UserMenu from '../components/ui/UserMenu'
import NotificationBell from '../components/ui/NotificationBell'
import WorkspaceModal from '../components/ui/WorkspaceModal'
import MoveToWorkspaceModal from '../components/ui/MoveToWorkspaceModal'
import DashboardAIChat from '../components/ui/DashboardAIChat'
import ProjectModal from '../components/ui/ProjectModal'

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
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [workspaceModal, setWorkspaceModal] = useState<{ id: string; name: string; isOwner: boolean } | null>(null)
  const [moveBoard, setMoveBoard] = useState<Board | null>(null)
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [projectModal, setProjectModal] = useState<string | null>(null) // workspaceId to create project in
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set())
  const socketRef = useRef<Socket | null>(null)

  const plan = user?.plan ?? 'free'
  const ownedCount = boards.filter(b => b.role === 'owner').length
  const atLimit = plan === 'free' && ownedCount >= FREE_BOARD_LIMIT

  // Filter boards based on selected workspace/project
  const visibleBoards = boards.filter(b => {
    if (selectedProjectId) return b.project_id === selectedProjectId
    if (selectedWorkspaceId) return b.workspace_id === selectedWorkspaceId && !b.project_id
    return !b.workspace_id
  })

  const selectedWorkspace = workspaces.find(w => w.id === selectedWorkspaceId) ?? null
  const selectedProject = projects.find(p => p.id === selectedProjectId) ?? null

  useEffect(() => {
    Promise.all([
      axios.get(`${SERVER_URL}/api/boards`, { headers: authHeaders() }),
      axios.get(`${SERVER_URL}/api/workspaces`, { headers: authHeaders() }),
      axios.get(`${SERVER_URL}/api/projects`, { headers: authHeaders() }),
    ]).then(([boardsRes, wsRes, projRes]) => {
      setBoards(boardsRes.data)
      setWorkspaces(wsRes.data)
      setProjects(projRes.data)
      setLoading(false)
    }).catch(() => setLoading(false))

    const token = getToken()
    if (token) {
      const socket = io(SERVER_URL, { auth: { token }, transports: ['websocket'] })
      socketRef.current = socket
      return () => { socket.disconnect(); socketRef.current = null }
    }
  }, [])

  async function createBoard() {
    try {
      const { data } = await axios.post(
        `${SERVER_URL}/api/boards`,
        {
          title: 'Untitled Board',
          workspaceId: selectedProjectId ? selectedProject?.workspace_id : (selectedWorkspaceId ?? undefined),
          projectId: selectedProjectId ?? undefined,
        },
        { headers: authHeaders() }
      )
      navigate(`/board/${data.id}`)
    } catch (err: any) {
      if (err.response?.data?.upgradeRequired) setShowUpgrade(true)
    }
  }

  async function renameBoard(id: string, title: string) {
    await axios.patch(`${SERVER_URL}/api/boards/${id}`, { title }, { headers: authHeaders() })
    setBoards(prev => prev.map(b => b.id === id ? { ...b, title } : b))
    setEditingId(null)
  }

  async function deleteBoard(id: string) {
    if (!confirm('Delete this board?')) return
    await axios.delete(`${SERVER_URL}/api/boards/${id}`, { headers: authHeaders() })
    setBoards(prev => prev.filter(b => b.id !== id))
  }

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault()
    if (!newWsName.trim()) return
    try {
      const { data } = await axios.post(
        `${SERVER_URL}/api/workspaces`,
        { name: newWsName.trim() },
        { headers: authHeaders() }
      )
      setWorkspaces(prev => [...prev, data])
      setSelectedWorkspaceId(data.id)
      setSelectedProjectId(null)
      setNewWsName('')
      setCreatingWorkspace(false)
    } catch (err: any) {
      if (err.response?.data?.upgradeRequired) { setCreatingWorkspace(false); setNewWsName(''); setShowUpgrade(true) }
    }
  }

  function selectWorkspace(wsId: string | null) {
    setSelectedWorkspaceId(wsId)
    setSelectedProjectId(null)
  }

  function selectProject(projId: string) {
    const proj = projects.find(p => p.id === projId)
    if (proj) {
      setSelectedWorkspaceId(proj.workspace_id)
      setSelectedProjectId(projId)
    }
  }

  function toggleWorkspaceExpand(wsId: string) {
    setExpandedWorkspaces(prev => {
      const next = new Set(prev)
      if (next.has(wsId)) next.delete(wsId)
      else next.add(wsId)
      return next
    })
  }

  // Get heading text
  let headingText = 'Personal'
  let headingSubtext = ''
  if (selectedProject) {
    headingText = selectedProject.name
    headingSubtext = `${selectedProject.board_count ?? 0} boards · ${selectedProject.status}`
  } else if (selectedWorkspace) {
    headingText = selectedWorkspace.name
    headingSubtext = `${selectedWorkspace.member_count} member${Number(selectedWorkspace.member_count) !== 1 ? 's' : ''} · ${selectedWorkspace.role}`
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
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
          <NotificationBell socket={socketRef.current} />
          {user && <UserMenu user={user} />}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col py-4 overflow-y-auto">
          <p className="text-xs text-gray-500 uppercase tracking-widest px-4 mb-2 font-medium">Workspaces</p>

          {/* Personal */}
          <button
            onClick={() => selectWorkspace(null)}
            className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left ${!selectedWorkspaceId && !selectedProjectId ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/60 hover:text-white'}`}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Personal
          </button>

          {/* Workspace list with projects */}
          {workspaces.map(ws => {
            const wsProjects = projects.filter(p => p.workspace_id === ws.id)
            const isExpanded = expandedWorkspaces.has(ws.id) || selectedWorkspaceId === ws.id
            const isWsSelected = selectedWorkspaceId === ws.id && !selectedProjectId

            return (
              <div key={ws.id}>
                <div className={`group flex items-center px-4 py-2 transition-colors ${isWsSelected ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/60 hover:text-white'}`}>
                  {/* Expand/collapse toggle */}
                  {wsProjects.length > 0 && (
                    <button
                      onClick={() => toggleWorkspaceExpand(ws.id)}
                      className="text-gray-600 hover:text-gray-400 mr-1 flex-shrink-0"
                    >
                      <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                        <path d="M6 6l4 4-4 4V6z" />
                      </svg>
                    </button>
                  )}
                  {wsProjects.length === 0 && <span className="w-4 flex-shrink-0" />}

                  <button
                    className="flex-1 flex items-center gap-2 text-sm text-left overflow-hidden"
                    onClick={() => selectWorkspace(ws.id)}
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span className="truncate">{ws.name}</span>
                  </button>
                  <button
                    onClick={() => setWorkspaceModal({ id: ws.id, name: ws.name, isOwner: ws.role === 'owner' })}
                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white transition-all flex-shrink-0 ml-1 p-0.5"
                    title="Workspace settings"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                </div>

                {/* Projects under this workspace */}
                {isExpanded && wsProjects.map(proj => (
                  <button
                    key={proj.id}
                    onClick={() => selectProject(proj.id)}
                    className={`w-full flex items-center gap-2 pl-10 pr-4 py-1.5 text-xs transition-colors text-left ${
                      selectedProjectId === proj.id ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-800/60 hover:text-gray-300'
                    }`}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: proj.color || '#6366f1' }}
                    />
                    <span className="truncate">{proj.name}</span>
                  </button>
                ))}

                {/* New project button under expanded workspace */}
                {isExpanded && (ws.role === 'owner' || ws.role === 'editor') && (
                  <button
                    onClick={() => setProjectModal(ws.id)}
                    className="w-full flex items-center gap-1.5 pl-10 pr-4 py-1.5 text-[11px] text-gray-600 hover:text-gray-400 transition-colors text-left"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    New project
                  </button>
                )}
              </div>
            )
          })}

          {/* New workspace */}
          <div className="px-4 mt-2">
            {creatingWorkspace ? (
              <form onSubmit={createWorkspace} className="space-y-1.5">
                <input
                  autoFocus
                  className="w-full bg-gray-800 text-white text-sm px-2.5 py-1.5 rounded-lg border border-indigo-500 outline-none"
                  placeholder="Workspace name"
                  value={newWsName}
                  onChange={e => setNewWsName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setCreatingWorkspace(false); setNewWsName('') } }}
                />
                <div className="flex gap-1.5">
                  <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-1 rounded transition-colors">Create</button>
                  <button type="button" onClick={() => { setCreatingWorkspace(false); setNewWsName('') }} className="flex-1 text-gray-500 hover:text-white text-xs py-1 rounded hover:bg-gray-800 transition-colors">Cancel</button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setCreatingWorkspace(true)}
                className="w-full flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 py-1.5 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New workspace
                {plan === 'free' && (
                  <span className="ml-auto text-[10px] text-gray-600">
                    {workspaces.filter(w => w.role === 'owner').length}/1
                  </span>
                )}
              </button>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto px-6 py-8">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <div className="flex items-center gap-2">
                  {selectedProject && (
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: selectedProject.color || '#6366f1' }}
                    >
                      {selectedProject.name[0]?.toUpperCase()}
                    </div>
                  )}
                  <h2 className="text-2xl font-semibold">{headingText}</h2>
                  {selectedProject && (
                    <button
                      onClick={() => navigate(`/project/${selectedProject.id}`)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 ml-2"
                    >
                      Open project →
                    </button>
                  )}
                </div>
                {headingSubtext && (
                  <p className="text-xs text-gray-500 mt-0.5">{headingSubtext}</p>
                )}
              </div>
              <button
                onClick={createBoard}
                className={`px-4 py-2 rounded-lg font-medium transition-colors text-white ${atLimit && !selectedWorkspaceId ? 'bg-gray-700 hover:bg-gray-600' : 'bg-indigo-600 hover:bg-indigo-500'}`}
              >
                + New Board
              </button>
            </div>

            {loading ? (
              <div className="text-gray-400">Loading...</div>
            ) : visibleBoards.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-gray-400 text-lg mb-4">
                  {selectedProject ? `No boards in ${selectedProject.name} yet` : selectedWorkspace ? `No boards in ${selectedWorkspace.name} yet` : 'No personal boards yet'}
                </p>
                <button onClick={createBoard} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium">
                  Create your first board
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleBoards.map(board => {
                  const boardRole = board.role ?? 'viewer'
                  const isOwner = boardRole === 'owner'
                  const canEdit = boardRole === 'owner' || boardRole === 'editor'
                  const badge = roleBadge[boardRole]
                  const wsName = workspaces.find(w => w.id === board.workspace_id)?.name
                  const projName = projects.find(p => p.id === board.project_id)?.name
                  const projColor = projects.find(p => p.id === board.project_id)?.color

                  return (
                    <div
                      key={board.id}
                      className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-indigo-500 transition-colors cursor-pointer group"
                      onClick={() => navigate(`/board/${board.id}`)}
                    >
                      <div className="w-full h-28 bg-gray-800 rounded-lg mb-3 flex items-center justify-center text-gray-600 text-sm">
                        Board
                      </div>

                      {/* Contributor avatars */}
                      {board.contributors && board.contributors.length > 0 && (() => {
                        const shown = board.contributors.slice(0, 4)
                        const extra = board.contributors.length - shown.length
                        const colors = ['bg-indigo-500', 'bg-pink-500', 'bg-amber-500', 'bg-emerald-500']
                        return (
                          <div className="flex items-center mb-3">
                            <div className="flex -space-x-2">
                              {shown.map((c, i) => (
                                <div
                                  key={c.user_id}
                                  title={c.name || c.email}
                                  className={`w-6 h-6 rounded-full ${colors[i % colors.length]} border-2 border-gray-900 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}
                                >
                                  {(c.name || c.email)[0].toUpperCase()}
                                </div>
                              ))}
                              {extra > 0 && (
                                <div className="w-6 h-6 rounded-full bg-gray-700 border-2 border-gray-900 flex items-center justify-center text-gray-300 text-[10px] font-bold flex-shrink-0">
                                  +{extra}
                                </div>
                              )}
                            </div>
                            <span className="text-xs text-gray-500 ml-2">
                              {board.contributors.length} contributor{board.contributors.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )
                      })()}

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

                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <p className="text-xs text-gray-500">{new Date(board.created_at).toLocaleDateString()}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${badge.className}`}>
                          {badge.label}
                        </span>
                        {!selectedWorkspaceId && wsName && (
                          <span className="text-xs px-1.5 py-0.5 rounded border text-indigo-300 bg-indigo-500/10 border-indigo-500/20">
                            {wsName}
                          </span>
                        )}
                        {!selectedProjectId && projName && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded border border-opacity-20"
                            style={{ color: projColor || '#6366f1', borderColor: projColor || '#6366f1', backgroundColor: `${projColor || '#6366f1'}15` }}
                          >
                            {projName}
                          </span>
                        )}
                      </div>

                      <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
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
                            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                            onClick={e => { e.stopPropagation(); setMoveBoard(board) }}
                          >
                            Move
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
          </div>
        </main>
      </div>

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}

      {workspaceModal && (
        <WorkspaceModal
          workspaceId={workspaceModal.id}
          workspaceName={workspaceModal.name}
          isOwner={workspaceModal.isOwner}
          onClose={() => setWorkspaceModal(null)}
          onUpdated={newName => {
            if (newName) setWorkspaces(prev => prev.map(w => w.id === workspaceModal.id ? { ...w, name: newName } : w))
            setWorkspaceModal(null)
          }}
          onDeleted={() => {
            setWorkspaces(prev => prev.filter(w => w.id !== workspaceModal.id))
            setBoards(prev => prev.map(b => b.workspace_id === workspaceModal.id ? { ...b, workspace_id: null } : b))
            setProjects(prev => prev.filter(p => p.workspace_id !== workspaceModal.id))
            if (selectedWorkspaceId === workspaceModal.id) { setSelectedWorkspaceId(null); setSelectedProjectId(null) }
            setWorkspaceModal(null)
          }}
        />
      )}

      {moveBoard && (
        <MoveToWorkspaceModal
          boardId={moveBoard.id}
          currentWorkspaceId={moveBoard.workspace_id}
          workspaces={workspaces}
          onClose={() => setMoveBoard(null)}
          onMoved={newWsId => {
            setBoards(prev => prev.map(b => b.id === moveBoard.id ? { ...b, workspace_id: newWsId } : b))
            setMoveBoard(null)
          }}
        />
      )}

      {projectModal && (
        <ProjectModal
          workspaceId={projectModal}
          onClose={() => setProjectModal(null)}
          onCreated={proj => {
            setProjects(prev => [...prev, proj])
            setSelectedProjectId(proj.id)
            setSelectedWorkspaceId(proj.workspace_id)
            setExpandedWorkspaces(prev => new Set([...prev, proj.workspace_id]))
          }}
        />
      )}

      <DashboardAIChat onNavigate={(boardId) => navigate(`/board/${boardId}`)} />
    </div>
  )
}
