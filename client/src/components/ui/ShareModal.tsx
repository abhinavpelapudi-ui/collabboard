import { useEffect, useState } from 'react'
import axios from 'axios'
import { BoardMember, BoardRole } from '@collabboard/shared'
import { getToken, getUser } from '../../hooks/useAuth'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

interface Props {
  boardId: string
  onClose: () => void
}

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}` }
}

export default function ShareModal({ boardId, onClose }: Props) {
  const [members, setMembers] = useState<BoardMember[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function fetchMembers() {
    try {
      const { data } = await axios.get(`${SERVER_URL}/api/boards/${boardId}/members`, {
        headers: authHeaders(),
      })
      setMembers(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMembers() }, [boardId])

  async function invite() {
    if (!email.trim()) return
    setInviting(true)
    setError('')
    try {
      const { data } = await axios.post(
        `${SERVER_URL}/api/boards/${boardId}/members`,
        { email: email.trim(), role },
        { headers: authHeaders() }
      )
      setMembers(prev => {
        const existing = prev.findIndex(m => m.user_id === data.user_id)
        if (existing >= 0) {
          const updated = [...prev]
          updated[existing] = data
          return updated
        }
        return [...prev, data]
      })
      setEmail('')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to invite user')
    } finally {
      setInviting(false)
    }
  }

  async function changeRole(userId: string, newRole: 'editor' | 'viewer') {
    try {
      await axios.patch(
        `${SERVER_URL}/api/boards/${boardId}/members/${userId}`,
        { role: newRole },
        { headers: authHeaders() }
      )
      setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role: newRole } : m))
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to change role')
    }
  }

  async function removeMember(userId: string) {
    try {
      await axios.delete(
        `${SERVER_URL}/api/boards/${boardId}/members/${userId}`,
        { headers: authHeaders() }
      )
      setMembers(prev => prev.filter(m => m.user_id !== userId))
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to remove member')
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const plan = getUser()?.plan ?? 'free'
  const nonOwnerCount = members.filter(m => m.role !== 'owner').length
  const atMemberLimit = plan === 'free' && nonOwnerCount >= 3

  const roleBadgeColor: Record<BoardRole, string> = {
    owner: 'text-yellow-400',
    editor: 'text-blue-400',
    viewer: 'text-gray-400',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold text-lg">Share Board</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Copy link */}
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={window.location.href}
              className="flex-1 bg-gray-800 text-gray-300 text-xs px-3 py-2 rounded-lg border border-gray-700 outline-none truncate"
            />
            <button
              onClick={copyLink}
              className="text-xs px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors whitespace-nowrap"
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>

          {/* Invite by email */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Invite people</p>
              {plan === 'free' && (
                <span className={`text-xs ${atMemberLimit ? 'text-amber-400' : 'text-gray-500'}`}>
                  {nonOwnerCount} / 3 members
                </span>
              )}
            </div>
            {atMemberLimit ? (
              <p className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2">
                Member limit reached. Upgrade to invite more people.
              </p>
            ) : (
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && invite()}
                  className="flex-1 bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 focus:border-indigo-500 outline-none"
                />
                <div className="flex rounded-lg border border-gray-700 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setRole('editor')}
                    className={`px-3 py-2 transition-colors ${role === 'editor' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                  >
                    Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('viewer')}
                    className={`px-3 py-2 transition-colors border-l border-gray-700 ${role === 'viewer' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                  >
                    Viewer
                  </button>
                </div>
                <button
                  onClick={invite}
                  disabled={inviting || !email.trim()}
                  className="text-xs px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                >
                  {inviting ? '...' : 'Invite'}
                </button>
              </div>
            )}
            {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
          </div>

          {/* Member list */}
          <div>
            <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">Members</p>
            {loading ? (
              <p className="text-gray-500 text-sm">Loading...</p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {members.map(member => (
                  <li key={member.user_id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs text-white font-medium flex-shrink-0">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{member.name}</p>
                      <p className="text-gray-500 text-xs truncate">{member.email}</p>
                    </div>
                    {member.role === 'owner' ? (
                      <span className={`text-xs font-medium ${roleBadgeColor.owner}`}>Owner</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="flex rounded-md border border-gray-700 overflow-hidden text-xs">
                          <button
                            type="button"
                            onClick={() => member.role !== 'editor' && changeRole(member.user_id, 'editor')}
                            className={`px-2 py-1 transition-colors ${member.role === 'editor' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                          >
                            Editor
                          </button>
                          <button
                            type="button"
                            onClick={() => member.role !== 'viewer' && changeRole(member.user_id, 'viewer')}
                            className={`px-2 py-1 transition-colors border-l border-gray-700 ${member.role === 'viewer' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                          >
                            Viewer
                          </button>
                        </div>
                        <button
                          onClick={() => removeMember(member.user_id)}
                          className="text-gray-500 hover:text-red-400 text-xs px-1"
                          title="Remove member"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Role legend */}
          <div className="border-t border-gray-800 pt-3 space-y-1">
            <p className="text-xs text-gray-500"><span className={`font-medium ${roleBadgeColor.owner}`}>Owner</span> — full control, can delete board and manage members</p>
            <p className="text-xs text-gray-500"><span className={`font-medium ${roleBadgeColor.editor}`}>Editor</span> — can create and edit objects, rename board</p>
            <p className="text-xs text-gray-500"><span className={`font-medium ${roleBadgeColor.viewer}`}>Viewer</span> — read-only, can see cursors and board state</p>
          </div>
        </div>
      </div>
    </div>
  )
}
