import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Board, Project, ProjectMember } from '@collabboard/shared'
import { getToken, getUser } from '../hooks/useAuth'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}` }
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: 'bg-green-500/10 border-green-500/20', text: 'text-green-400' },
  paused: { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400' },
  completed: { bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400' },
  archived: { bg: 'bg-gray-500/10 border-gray-500/20', text: 'text-gray-400' },
}

const TASK_STATUS_COLORS: Record<string, string> = {
  done: '#22c55e',
  in_progress: '#f59e0b',
  review: '#06b6d4',
  todo: '#6b7280',
}

type Tab = 'overview' | 'boards' | 'timeline' | 'team'

interface TaskItem {
  id: string
  board_id: string
  board_title: string
  type: string
  text: string | null
  title: string | null
  status: string | null
  assigned_to: string | null
  due_date: string | null
  priority: string | null
}

interface ProjectStats {
  total_objects: number
  done_count: number
  in_progress_count: number
  todo_count: number
  review_count: number
  assigned_count: number
  assignees: string[]
  tasks: TaskItem[]
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const user = getUser()

  const [project, setProject] = useState<Project | null>(null)
  const [boards, setBoards] = useState<Board[]>([])
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [stats, setStats] = useState<ProjectStats | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')
  const [inviteError, setInviteError] = useState('')

  useEffect(() => {
    if (!projectId) return
    Promise.all([
      axios.get(`${SERVER_URL}/api/projects/${projectId}`, { headers: authHeaders() }),
      axios.get(`${SERVER_URL}/api/boards`, { headers: authHeaders() }),
      axios.get(`${SERVER_URL}/api/projects/${projectId}/members`, { headers: authHeaders() }),
      axios.get(`${SERVER_URL}/api/projects/${projectId}/stats`, { headers: authHeaders() }),
    ]).then(([projRes, boardsRes, membersRes, statsRes]) => {
      setProject(projRes.data)
      setBoards(boardsRes.data.filter((b: Board) => b.project_id === projectId))
      setMembers(membersRes.data)
      setStats(statsRes.data)
      setDescDraft(projRes.data.description || '')
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })
  }, [projectId])

  async function updateProject(updates: Record<string, unknown>) {
    if (!projectId) return
    const { data } = await axios.patch(`${SERVER_URL}/api/projects/${projectId}`, updates, { headers: authHeaders() })
    setProject(prev => prev ? { ...prev, ...data } : prev)
  }

  async function createBoard() {
    if (!projectId || !project) return
    try {
      const { data } = await axios.post(
        `${SERVER_URL}/api/boards`,
        { title: 'Untitled Board', workspaceId: project.workspace_id, projectId },
        { headers: authHeaders() }
      )
      navigate(`/board/${data.id}`)
    } catch (err: any) {
      console.error('Failed to create board:', err)
    }
  }

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim() || !projectId) return
    setInviteError('')
    try {
      const { data } = await axios.post(
        `${SERVER_URL}/api/projects/${projectId}/members`,
        { email: inviteEmail.trim(), role: inviteRole },
        { headers: authHeaders() }
      )
      setMembers(prev => [...prev, data])
      setInviteEmail('')
    } catch (err: any) {
      setInviteError(err.response?.data?.error || 'Failed to invite')
    }
  }

  async function removeMember(userId: string) {
    if (!projectId || !confirm('Remove this member?')) return
    await axios.delete(`${SERVER_URL}/api/projects/${projectId}/members/${userId}`, { headers: authHeaders() })
    setMembers(prev => prev.filter(m => m.user_id !== userId))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading project...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">Project not found</p>
          <button onClick={() => navigate('/dashboard')} className="text-indigo-400 hover:text-indigo-300">
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const isOwner = project.role === 'owner'
  const canEdit = project.role === 'owner' || project.role === 'editor'
  const statusStyle = STATUS_COLORS[project.status] || STATUS_COLORS.active
  const completionPct = stats && stats.total_objects > 0
    ? Math.round((stats.done_count / stats.total_objects) * 100)
    : 0

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'boards', label: `Boards (${boards.length})` },
    { id: 'timeline', label: 'Timeline' },
    { id: 'team', label: `Team (${members.length})` },
  ]

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white text-sm">
          ← Dashboard
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
            style={{ backgroundColor: project.color || '#6366f1' }}
          >
            {project.name[0]?.toUpperCase()}
          </div>
          <div>
            <h1 className="text-lg font-semibold">{project.name}</h1>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {project.industry && <span>{project.industry}</span>}
              <span className={`px-1.5 py-0.5 rounded border ${statusStyle.bg} ${statusStyle.text}`}>
                {project.status}
              </span>
              {project.start_date && (
                <span>{new Date(project.start_date).toLocaleDateString()} — {project.end_date ? new Date(project.end_date).toLocaleDateString() : 'ongoing'}</span>
              )}
            </div>
          </div>
        </div>
        {canEdit && (
          <select
            value={project.status}
            onChange={e => updateProject({ status: e.target.value })}
            className="bg-gray-800 text-white text-xs px-2 py-1.5 rounded-lg border border-gray-700"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        )}
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-800 px-6 flex gap-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-5xl mx-auto">

          {/* ─── Overview Tab ─── */}
          {tab === 'overview' && (
            <div className="space-y-6">
              {/* Stats cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Boards</p>
                  <p className="text-2xl font-bold">{boards.length}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Total Tasks</p>
                  <p className="text-2xl font-bold">{stats?.total_objects ?? 0}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Completion</p>
                  <p className="text-2xl font-bold text-green-400">{completionPct}%</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Team Members</p>
                  <p className="text-2xl font-bold">{members.length}</p>
                </div>
              </div>

              {/* Progress bar */}
              {stats && stats.total_objects > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                    <span>Project Progress</span>
                    <span>{stats.done_count} / {stats.total_objects} tasks done</span>
                  </div>
                  <div className="h-3 bg-gray-800 rounded-full overflow-hidden flex">
                    {stats.done_count > 0 && (
                      <div className="bg-green-500 h-full" style={{ width: `${(stats.done_count / stats.total_objects) * 100}%` }} />
                    )}
                    {stats.in_progress_count > 0 && (
                      <div className="bg-amber-500 h-full" style={{ width: `${(stats.in_progress_count / stats.total_objects) * 100}%` }} />
                    )}
                    {stats.review_count > 0 && (
                      <div className="bg-cyan-500 h-full" style={{ width: `${(stats.review_count / stats.total_objects) * 100}%` }} />
                    )}
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Done ({stats.done_count})</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> In Progress ({stats.in_progress_count})</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-500" /> Review ({stats.review_count})</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500" /> To Do ({stats.todo_count})</span>
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Description</p>
                  {canEdit && !editingDesc && (
                    <button onClick={() => setEditingDesc(true)} className="text-xs text-gray-500 hover:text-white">Edit</button>
                  )}
                </div>
                {editingDesc ? (
                  <div>
                    <textarea
                      autoFocus
                      value={descDraft}
                      onChange={e => setDescDraft(e.target.value)}
                      className="w-full bg-gray-800 text-white text-sm p-3 rounded-lg border border-gray-700 outline-none resize-none min-h-[100px]"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => { updateProject({ description: descDraft }); setEditingDesc(false) }}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setDescDraft(project.description || ''); setEditingDesc(false) }}
                        className="text-gray-500 hover:text-white text-xs px-3 py-1.5"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-300">{project.description || 'No description yet.'}</p>
                )}
              </div>

              {/* Member avatars */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">Team</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {members.map((m, i) => {
                    const colors = ['bg-indigo-500', 'bg-pink-500', 'bg-amber-500', 'bg-emerald-500', 'bg-cyan-500']
                    return (
                      <div
                        key={m.user_id}
                        title={`${m.name || m.email} (${m.role})`}
                        className={`w-8 h-8 rounded-full ${colors[i % colors.length]} flex items-center justify-center text-white text-xs font-bold`}
                      >
                        {(m.name || m.email)[0].toUpperCase()}
                      </div>
                    )
                  })}
                  <button onClick={() => setTab('team')} className="text-xs text-gray-500 hover:text-gray-300 ml-1">
                    Manage team →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── Boards Tab ─── */}
          {tab === 'boards' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Boards</h2>
                {canEdit && (
                  <button onClick={createBoard} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
                    + New Board
                  </button>
                )}
              </div>
              {boards.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-gray-400 mb-4">No boards in this project yet</p>
                  {canEdit && (
                    <button onClick={createBoard} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium">
                      Create first board
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {boards.map(board => (
                    <div
                      key={board.id}
                      className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-indigo-500 transition-colors cursor-pointer"
                      onClick={() => navigate(`/board/${board.id}`)}
                    >
                      <div className="w-full h-24 bg-gray-800 rounded-lg mb-3 flex items-center justify-center text-gray-600 text-sm">
                        Board
                      </div>
                      <p className="text-sm font-medium text-white truncate">{board.title}</p>
                      <p className="text-xs text-gray-500 mt-1">{new Date(board.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Timeline Tab ─── */}
          {tab === 'timeline' && (
            <div>
              <h2 className="text-lg font-semibold mb-6">Timeline</h2>
              {(!stats?.tasks || stats.tasks.filter(t => t.due_date).length === 0) ? (
                <div className="text-center py-16">
                  <p className="text-gray-400 mb-2">No tasks with due dates yet</p>
                  <p className="text-xs text-gray-600">Add due dates to tasks in your boards using the AI agent or task properties</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Gantt-like timeline */}
                  {(() => {
                    const tasksWithDates = stats!.tasks
                      .filter(t => t.due_date)
                      .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))

                    // Find date range
                    const dates = tasksWithDates.map(t => new Date(t.due_date!).getTime())
                    const minDate = Math.min(...dates)
                    const maxDate = Math.max(...dates)
                    const range = Math.max(maxDate - minDate, 86400000) // At least 1 day

                    // Group by board
                    const byBoard = new Map<string, TaskItem[]>()
                    for (const t of tasksWithDates) {
                      const key = t.board_id
                      if (!byBoard.has(key)) byBoard.set(key, [])
                      byBoard.get(key)!.push(t)
                    }

                    return (
                      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-x-auto">
                        {/* Date axis */}
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-4 px-40">
                          <span>{new Date(minDate).toLocaleDateString()}</span>
                          <span>{new Date((minDate + maxDate) / 2).toLocaleDateString()}</span>
                          <span>{new Date(maxDate).toLocaleDateString()}</span>
                        </div>

                        {Array.from(byBoard.entries()).map(([boardId, tasks]) => (
                          <div key={boardId} className="mb-4">
                            <p className="text-xs text-gray-400 font-medium mb-2 truncate">
                              {tasks[0]?.board_title || 'Board'}
                            </p>
                            {tasks.map(task => {
                              const taskDate = new Date(task.due_date!).getTime()
                              const leftPct = ((taskDate - minDate) / range) * 60 + 20 // 20-80% range
                              const color = TASK_STATUS_COLORS[task.status || 'todo'] || '#6b7280'
                              return (
                                <div
                                  key={task.id}
                                  className="relative h-8 mb-1 cursor-pointer hover:opacity-80"
                                  onClick={() => navigate(`/board/${task.board_id}`)}
                                  title={`${task.text || task.title || 'Task'} — ${task.due_date} ${task.assigned_to ? `(${task.assigned_to})` : ''}`}
                                >
                                  <div className="absolute top-0 left-0 w-36 text-xs text-gray-400 truncate leading-8">
                                    {task.text || task.title || 'Task'}
                                  </div>
                                  <div
                                    className="absolute top-1 h-6 rounded-full min-w-[12px]"
                                    style={{
                                      left: `${leftPct}%`,
                                      width: '80px',
                                      backgroundColor: color,
                                      opacity: 0.7,
                                    }}
                                  />
                                  {task.assigned_to && (
                                    <div
                                      className="absolute top-1 text-xs text-white leading-6 px-2 truncate"
                                      style={{ left: `calc(${leftPct}% + 4px)`, maxWidth: '72px' }}
                                    >
                                      {task.assigned_to}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Task list fallback */}
              {stats?.tasks && stats.tasks.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-400 mb-3">All Tasks</h3>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
                    {stats.tasks.slice(0, 50).map(task => (
                      <div
                        key={task.id}
                        className="px-4 py-3 flex items-center gap-3 hover:bg-gray-800/50 cursor-pointer"
                        onClick={() => navigate(`/board/${task.board_id}`)}
                      >
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: TASK_STATUS_COLORS[task.status || 'todo'] || '#6b7280' }}
                        />
                        <span className="text-sm text-white flex-1 truncate">{task.text || task.title || 'Untitled'}</span>
                        <span className="text-xs text-gray-500">{task.board_title}</span>
                        {task.assigned_to && <span className="text-xs text-indigo-400">{task.assigned_to}</span>}
                        {task.due_date && <span className="text-xs text-gray-500">{new Date(task.due_date).toLocaleDateString()}</span>}
                        {task.priority && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            task.priority === 'high' ? 'text-red-400 bg-red-400/10' :
                            task.priority === 'medium' ? 'text-amber-400 bg-amber-400/10' :
                            'text-gray-400 bg-gray-700'
                          }`}>
                            {task.priority}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Team Tab ─── */}
          {tab === 'team' && (
            <div>
              <h2 className="text-lg font-semibold mb-6">Team Members</h2>

              {/* Invite form */}
              {isOwner && (
                <form onSubmit={inviteMember} className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">Invite Member</p>
                  <div className="flex items-center gap-2">
                    <input
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="Email address"
                      className="flex-1 bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 outline-none focus:border-indigo-500"
                    />
                    <select
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value as 'editor' | 'viewer')}
                      className="bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg font-medium">
                      Invite
                    </button>
                  </div>
                  {inviteError && <p className="text-xs text-red-400 mt-2">{inviteError}</p>}
                </form>
              )}

              {/* Member list */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
                {members.map((m, i) => {
                  const colors = ['bg-indigo-500', 'bg-pink-500', 'bg-amber-500', 'bg-emerald-500', 'bg-cyan-500']
                  // Count tasks assigned to this member
                  const memberTasks = stats?.tasks.filter(t => t.assigned_to === m.name || t.assigned_to === m.email) || []
                  return (
                    <div key={m.user_id} className="px-4 py-3 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${colors[i % colors.length]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                        {(m.name || m.email)[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{m.name || m.email}</p>
                        <p className="text-xs text-gray-500">{m.email}</p>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${
                        m.role === 'owner' ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' :
                        m.role === 'editor' ? 'text-blue-400 bg-blue-400/10 border-blue-400/20' :
                        'text-gray-400 bg-gray-700 border-gray-600'
                      }`}>
                        {m.role}
                      </span>
                      {memberTasks.length > 0 && (
                        <span className="text-xs text-gray-500">{memberTasks.length} tasks</span>
                      )}
                      {isOwner && m.role !== 'owner' && m.user_id !== user?.userId && (
                        <button
                          onClick={() => removeMember(m.user_id)}
                          className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Who's working on what */}
              {stats?.tasks && stats.tasks.filter(t => t.assigned_to).length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Who's Working on What</h3>
                  <div className="space-y-4">
                    {stats.assignees.map(assignee => {
                      const tasks = stats.tasks.filter(t => t.assigned_to === assignee)
                      const doneTasks = tasks.filter(t => t.status === 'done').length
                      return (
                        <div key={assignee} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-white">{assignee}</span>
                            <span className="text-xs text-gray-500">{doneTasks}/{tasks.length} done</span>
                          </div>
                          <div className="space-y-1">
                            {tasks.slice(0, 10).map(task => (
                              <div
                                key={task.id}
                                className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-800/50 px-2 py-1 rounded"
                                onClick={() => navigate(`/board/${task.board_id}`)}
                              >
                                <div
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: TASK_STATUS_COLORS[task.status || 'todo'] || '#6b7280' }}
                                />
                                <span className="text-gray-300 flex-1 truncate">{task.text || task.title || 'Untitled'}</span>
                                <span className="text-gray-600">{task.board_title}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
