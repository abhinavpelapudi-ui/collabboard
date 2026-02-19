import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { getToken, getUser } from '../../hooks/useAuth'
import { WorkspaceMember } from '@collabboard/shared'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}` }
}

interface Props {
  workspaceId: string
  workspaceName: string
  isOwner: boolean
  onClose: () => void
  onUpdated: (newName?: string) => void
  onDeleted: () => void
}

const roleColors: Record<string, string> = {
  owner: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  editor: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  viewer: 'text-gray-400 bg-gray-700 border-gray-600',
}

export default function WorkspaceModal({ workspaceId, workspaceName, isOwner, onClose, onUpdated, onDeleted }: Props) {
  const user = getUser()
  const [tab, setTab] = useState<'general' | 'members'>('members')
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [name, setName] = useState(workspaceName)
  const [saving, setSaving] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchMembers()
  }, [workspaceId])

  async function fetchMembers() {
    setLoadingMembers(true)
    try {
      const { data } = await axios.get(`${SERVER_URL}/api/workspaces/${workspaceId}/members`, { headers: authHeaders() })
      setMembers(data)
    } finally {
      setLoadingMembers(false)
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || name === workspaceName) return
    setSaving(true)
    try {
      await axios.patch(`${SERVER_URL}/api/workspaces/${workspaceId}`, { name: name.trim() }, { headers: authHeaders() })
      onUpdated(name.trim())
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to rename')
    } finally {
      setSaving(false)
    }
  }

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInviting(true)
    try {
      const { data } = await axios.post(
        `${SERVER_URL}/api/workspaces/${workspaceId}/members`,
        { email: inviteEmail.trim(), role: inviteRole },
        { headers: authHeaders() }
      )
      setMembers(prev => {
        const without = prev.filter(m => m.user_id !== data.user_id)
        return [...without, data]
      })
      setInviteEmail('')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to invite')
    } finally {
      setInviting(false)
    }
  }

  async function changeRole(memberId: string, newRole: 'editor' | 'viewer') {
    try {
      await axios.patch(
        `${SERVER_URL}/api/workspaces/${workspaceId}/members/${memberId}`,
        { role: newRole },
        { headers: authHeaders() }
      )
      setMembers(prev => prev.map(m => m.user_id === memberId ? { ...m, role: newRole } : m))
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to change role')
    }
  }

  async function removeMember(memberId: string) {
    try {
      await axios.delete(
        `${SERVER_URL}/api/workspaces/${workspaceId}/members/${memberId}`,
        { headers: authHeaders() }
      )
      setMembers(prev => prev.filter(m => m.user_id !== memberId))
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove member')
    }
  }

  async function deleteWorkspace() {
    try {
      await axios.delete(`${SERVER_URL}/api/workspaces/${workspaceId}`, { headers: authHeaders() })
      onDeleted()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete workspace')
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold text-base truncate">{workspaceName}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 px-6">
          {(['members', 'general'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-3 mr-6 text-sm font-medium border-b-2 transition-colors capitalize ${tab === t ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {/* ── Members tab ── */}
          {tab === 'members' && (
            <>
              {isOwner && (
                <form onSubmit={inviteMember} className="flex gap-2">
                  <input
                    type="email"
                    placeholder="Email address"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    required
                    className="flex-1 bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 focus:border-indigo-500 outline-none"
                  />
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value as 'editor' | 'viewer')}
                    className="bg-gray-800 text-white text-sm px-2 py-2 rounded-lg border border-gray-700 outline-none"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    type="submit"
                    disabled={inviting || !inviteEmail.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {inviting ? '…' : 'Invite'}
                  </button>
                </form>
              )}

              {loadingMembers ? (
                <p className="text-gray-500 text-sm">Loading...</p>
              ) : (
                <ul className="space-y-2">
                  {members.map(m => (
                    <li key={m.user_id} className="flex items-center gap-3 py-1.5">
                      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {(m.name || m.email)[0].toUpperCase()}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm text-white truncate">{m.name || m.email}</p>
                        <p className="text-xs text-gray-500 truncate">{m.email}</p>
                      </div>
                      {isOwner && m.user_id !== user?.userId ? (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <select
                            value={m.role}
                            onChange={e => changeRole(m.user_id, e.target.value as 'editor' | 'viewer')}
                            className="bg-gray-800 text-gray-300 text-xs px-1.5 py-1 rounded border border-gray-700 outline-none"
                          >
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <button
                            onClick={() => removeMember(m.user_id)}
                            className="text-red-400 hover:text-red-300 text-xs px-1.5 py-1 rounded hover:bg-gray-800 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full border capitalize flex-shrink-0 ${roleColors[m.role]}`}>
                          {m.role}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* ── General tab ── */}
          {tab === 'general' && (
            <>
              {isOwner && (
                <form onSubmit={saveName} className="space-y-2">
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Workspace name</label>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-indigo-500 outline-none text-sm"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                    />
                    <button
                      type="submit"
                      disabled={saving || !name.trim() || name === workspaceName}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </form>
              )}

              {isOwner && (
                <div className="border border-red-900/50 rounded-xl p-4 space-y-3 mt-4">
                  <p className="text-sm text-red-400 font-medium">Danger zone</p>
                  <p className="text-xs text-gray-500">
                    Deleting this workspace removes all member access. Boards will move to Personal.
                  </p>
                  {confirmDelete ? (
                    <div className="flex gap-2">
                      <button
                        onClick={deleteWorkspace}
                        className="bg-red-600 hover:bg-red-500 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Yes, delete
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="text-gray-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="text-red-400 hover:text-red-300 text-sm border border-red-900/50 px-3 py-1.5 rounded-lg hover:bg-red-900/20 transition-colors"
                    >
                      Delete workspace
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
