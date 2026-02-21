import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import type { Socket } from 'socket.io-client'
import { getToken } from '../../hooks/useAuth'
import { useBoardStore } from '../../stores/boardStore'
import { BoardMember, ObjectComment } from '@collabboard/shared'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

interface Props {
  boardId: string
  objectId: string
  socketRef: React.MutableRefObject<Socket | null>
  onClose: () => void
}

export default function ObjectDetailPanel({ boardId, objectId, socketRef, onClose }: Props) {
  const { objects, updateObject } = useBoardStore()
  const obj = objects.get(objectId)

  const [members, setMembers] = useState<BoardMember[]>([])
  const [comments, setComments] = useState<ObjectComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [tagInput, setTagInput] = useState('')
  const commentsEndRef = useRef<HTMLDivElement>(null)

  // Collect all tags used on the board for autocomplete
  const allTags = Array.from(
    new Set(Array.from(objects.values()).flatMap(o => (o as any).tags || []))
  )

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  // Fetch board members
  useEffect(() => {
    axios.get(`${SERVER_URL}/api/boards/${boardId}/members`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }).then(({ data }) => setMembers(data.members || data || []))
      .catch(() => {})
  }, [boardId])

  // Fetch comments
  useEffect(() => {
    axios.get(`${SERVER_URL}/api/boards/${boardId}/objects/${objectId}/comments`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }).then(({ data }) => setComments(data.comments || []))
      .catch(() => {})
  }, [boardId, objectId])

  // Listen for real-time comments
  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return
    function onComment(data: any) {
      if (data.comment?.object_id === objectId) {
        setComments(prev => [...prev, data.comment])
      }
    }
    socket.on('comment:created', onComment)
    return () => { socket.off('comment:created', onComment) }
  }, [objectId, socketRef])

  if (!obj) return null

  const props: any = obj

  function updateProp(key: string, value: any) {
    updateObject(objectId, { [key]: value })
    socketRef.current?.emit('object:update', { boardId, objectId, props: { [key]: value } })
  }

  function addTag() {
    const tag = tagInput.trim().toLowerCase()
    if (!tag) return
    const current: string[] = props.tags || []
    if (current.includes(tag)) { setTagInput(''); return }
    updateProp('tags', [...current, tag])
    setTagInput('')
  }

  function removeTag(tag: string) {
    const current: string[] = props.tags || []
    updateProp('tags', current.filter(t => t !== tag))
  }

  async function submitComment() {
    const content = newComment.trim()
    if (!content) return
    setNewComment('')
    socketRef.current?.emit('comment:create', { boardId, objectId, content })
  }

  const typeIcons: Record<string, string> = {
    sticky: 'Note', rect: 'Rect', circle: 'Circle',
    text: 'Text', frame: 'Frame', image: 'Image',
  }

  const priorityColors: Record<string, string> = {
    low: 'text-slate-400', medium: 'text-yellow-400', high: 'text-red-400',
  }
  const statusColors: Record<string, string> = {
    todo: 'text-slate-400', in_progress: 'text-blue-400', review: 'text-purple-400', done: 'text-green-400',
  }

  return (
    <div className="absolute right-0 top-12 bottom-0 w-80 bg-surface-raised border-l border-surface-border z-20 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
        <span className="text-sm font-semibold text-white">{typeIcons[obj.type] || obj.type}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Assignment */}
        <div>
          <label className="text-xs text-slate-400 block mb-1">Assigned to</label>
          <select
            value={props.assigned_to || ''}
            onChange={e => updateProp('assigned_to', e.target.value || undefined)}
            className="w-full bg-surface-overlay text-slate-200 text-xs rounded-md px-2 py-1.5 border border-surface-border outline-none"
          >
            <option value="">Unassigned</option>
            {members.map(m => (
              <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>
            ))}
          </select>
        </div>

        {/* Tags */}
        <div>
          <label className="text-xs text-slate-400 block mb-1">Tags</label>
          <div className="flex flex-wrap gap-1 mb-1">
            {(props.tags || []).map((tag: string) => (
              <span key={tag} className="inline-flex items-center gap-1 bg-indigo-600/30 text-indigo-300 text-xs px-2 py-0.5 rounded-full">
                {tag}
                <button onClick={() => removeTag(tag)} className="hover:text-white">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              className="flex-1 bg-surface-overlay text-white text-xs rounded-md px-2 py-1 border border-surface-border outline-none"
              placeholder="Add tag..."
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTag() }}
              list="tag-suggestions"
            />
            <datalist id="tag-suggestions">
              {allTags.filter(t => !(props.tags || []).includes(t)).map(t => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <button onClick={addTag} className="text-xs bg-surface-overlay text-slate-300 px-2 rounded-md hover:bg-surface-hover">+</button>
          </div>
        </div>

        {/* Due Date */}
        <div>
          <label className="text-xs text-slate-400 block mb-1">Due date</label>
          <input
            type="date"
            value={props.due_date || ''}
            onChange={e => updateProp('due_date', e.target.value || undefined)}
            className="w-full bg-surface-overlay text-slate-200 text-xs rounded-md px-2 py-1.5 border border-surface-border outline-none"
          />
        </div>

        {/* Priority */}
        <div>
          <label className="text-xs text-slate-400 block mb-1">Priority</label>
          <select
            value={props.priority || ''}
            onChange={e => updateProp('priority', e.target.value || undefined)}
            className={`w-full bg-surface-overlay text-xs rounded-md px-2 py-1.5 border border-surface-border outline-none ${priorityColors[props.priority] || 'text-slate-200'}`}
          >
            <option value="">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        {/* Status */}
        <div>
          <label className="text-xs text-slate-400 block mb-1">Status</label>
          <select
            value={props.status || ''}
            onChange={e => updateProp('status', e.target.value || undefined)}
            className={`w-full bg-surface-overlay text-xs rounded-md px-2 py-1.5 border border-surface-border outline-none ${statusColors[props.status] || 'text-slate-200'}`}
          >
            <option value="">None</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="review">Review</option>
            <option value="done">Done</option>
          </select>
        </div>

        {/* Comments */}
        <div>
          <label className="text-xs text-slate-400 block mb-2">Comments</label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {comments.length === 0 && (
              <p className="text-xs text-slate-500">No comments yet</p>
            )}
            {comments.map(c => (
              <div key={c.id} className="bg-surface-overlay rounded-lg px-3 py-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium text-indigo-300">{c.user_name}</span>
                  <span className="text-[10px] text-slate-500">{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-slate-300">{c.content}</p>
              </div>
            ))}
            <div ref={commentsEndRef} />
          </div>
        </div>
      </div>

      {/* Comment input */}
      <div className="p-3 border-t border-surface-border flex gap-2">
        <input
          className="flex-1 bg-surface-overlay text-white text-xs rounded-md px-2 py-1.5 border border-surface-border outline-none"
          placeholder="Add a comment..."
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submitComment() }}
        />
        <button
          onClick={submitComment}
          disabled={!newComment.trim()}
          className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 rounded-md"
        >
          Send
        </button>
      </div>
    </div>
  )
}
