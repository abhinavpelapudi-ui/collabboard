import { useState, useEffect, useRef } from 'react'
import type { Socket } from 'socket.io-client'
import { api } from '../../lib/api'
import { useBoardStore } from '../../stores/boardStore'
import { BoardMember, ObjectComment, ObjectAttachment } from '@collabboard/shared'
import { getUser } from '../../hooks/useAuth'

interface Props {
  boardId: string
  objectId: string
  socketRef: React.MutableRefObject<Socket | null>
  onClose: () => void
}

interface BoardDoc {
  id: string
  title: string
}

export default function ObjectDetailPanel({ boardId, objectId, socketRef, onClose }: Props) {
  const { objects, updateObject } = useBoardStore()
  const obj = objects.get(objectId)
  const currentUser = getUser()

  const [members, setMembers] = useState<BoardMember[]>([])
  const [comments, setComments] = useState<ObjectComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [showDocPicker, setShowDocPicker] = useState(false)
  const [boardDocs, setBoardDocs] = useState<BoardDoc[]>([])
  const commentsEndRef = useRef<HTMLDivElement>(null)

  const allTags = Array.from(
    new Set(Array.from(objects.values()).flatMap(o => o.tags ?? []))
  )

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  useEffect(() => {
    api.get(`/api/boards/${boardId}/members`).then(({ data }) => setMembers(data.members || data || []))
      .catch(() => {})
  }, [boardId])

  useEffect(() => {
    api.get(`/api/boards/${boardId}/objects/${objectId}/comments`).then(({ data }) => setComments(data.comments || []))
      .catch(() => {})
  }, [boardId, objectId])

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

  // Lazy-fetch board docs when picker opens
  useEffect(() => {
    if (!showDocPicker) return
    api.get(`/api/boards/${boardId}/docs`)
      .then(({ data }) => setBoardDocs((data.documents || []).map((d: any) => ({ id: d.id, title: d.title }))))
      .catch(() => {})
  }, [boardId, showDocPicker])

  if (!obj) return null

  const props: any = obj
  const attachments: ObjectAttachment[] = props.attachments || []

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

  function submitComment() {
    const content = newComment.trim()
    if (!content) return
    setNewComment('')
    socketRef.current?.emit('comment:create', { boardId, objectId, content })
  }

  function addUrlAttachment() {
    const url = urlInput.trim()
    if (!url) return
    try { new URL(url) } catch { return }
    const attachment: ObjectAttachment = {
      id: crypto.randomUUID(),
      type: 'url',
      url,
      title: extractDomainTitle(url),
      added_by: currentUser?.userId || '',
      added_at: new Date().toISOString(),
    }
    updateProp('attachments', [...attachments, attachment])
    setUrlInput('')
  }

  function addDocAttachment(doc: BoardDoc) {
    if (attachments.some(a => a.type === 'board_doc' && a.doc_id === doc.id)) return
    const attachment: ObjectAttachment = {
      id: crypto.randomUUID(),
      type: 'board_doc',
      doc_id: doc.id,
      title: doc.title,
      added_by: currentUser?.userId || '',
      added_at: new Date().toISOString(),
    }
    updateProp('attachments', [...attachments, attachment])
    setShowDocPicker(false)
  }

  function removeAttachment(attachmentId: string) {
    updateProp('attachments', attachments.filter(a => a.id !== attachmentId))
  }

  function extractDomainTitle(url: string): string {
    try { return new URL(url).hostname.replace('www.', '') } catch { return url }
  }

  const typeIcons: Record<string, string> = {
    sticky: 'Note', rect: 'Rect', circle: 'Circle',
    text: 'Text', frame: 'Frame', image: 'Image',
  }
  const priorityColors: Record<string, string> = {
    low: 'text-slate-500', medium: 'text-yellow-600', high: 'text-red-600',
  }
  const statusColors: Record<string, string> = {
    todo: 'text-slate-500', in_progress: 'text-blue-600', review: 'text-purple-600', done: 'text-green-600',
  }

  return (
    <div className="absolute right-0 top-12 bottom-0 w-80 bg-surface-raised border-l border-surface-border z-20 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">{typeIcons[obj.type] || obj.type}</span>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-sm">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ── Comments (first, most prominent) ─────────────────────────── */}
        <div>
          <label className="text-xs text-slate-500 block mb-2 font-semibold">
            Comments ({comments.length})
          </label>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {comments.length === 0 && (
              <p className="text-xs text-slate-400">No comments yet</p>
            )}
            {comments.map(c => (
              <div key={c.id} className="bg-surface-overlay rounded-lg px-3 py-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium text-indigo-600">{c.user_name}</span>
                  <span className="text-[10px] text-slate-400">{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-slate-600">{c.content}</p>
              </div>
            ))}
            <div ref={commentsEndRef} />
          </div>
        </div>

        {/* ── Attachments ──────────────────────────────────────────────── */}
        <div>
          <label className="text-xs text-slate-500 block mb-2 font-semibold">
            Attachments ({attachments.length})
          </label>

          {attachments.length === 0 && (
            <p className="text-xs text-slate-400 mb-2">No attachments</p>
          )}
          <div className="space-y-1 mb-2">
            {attachments.map(att => (
              <div key={att.id} className="flex items-center justify-between bg-surface-overlay rounded-lg px-2 py-1.5 group">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs flex-shrink-0">{att.type === 'url' ? '\uD83D\uDD17' : '\uD83D\uDCC4'}</span>
                  {att.type === 'url' ? (
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:underline truncate"
                      title={att.url}
                    >
                      {att.title}
                    </a>
                  ) : (
                    <span className="text-xs text-emerald-600 truncate" title={`Board doc: ${att.title}`}>
                      {att.title}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="text-slate-400 hover:text-red-600 text-xs opacity-0 group-hover:opacity-100 ml-1 flex-shrink-0"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Add URL */}
          <div className="flex gap-1 mb-1">
            <input
              className="flex-1 bg-surface-overlay text-slate-900 text-xs rounded-md px-2 py-1 border border-surface-border outline-none"
              placeholder="Paste a URL..."
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addUrlAttachment() }}
            />
            <button
              onClick={addUrlAttachment}
              disabled={!urlInput.trim()}
              className="text-xs bg-surface-overlay text-slate-600 px-2 rounded-md hover:bg-surface-hover disabled:opacity-50"
            >
              +
            </button>
          </div>

          {/* Link board document */}
          <div className="relative">
            <button
              onClick={() => setShowDocPicker(prev => !prev)}
              className="text-xs text-indigo-600 hover:text-indigo-500"
            >
              + Link a board document
            </button>

            {showDocPicker && (
              <div className="absolute left-0 top-6 z-10 w-full bg-surface-raised border border-surface-border rounded-lg shadow-lg max-h-32 overflow-y-auto">
                {boardDocs.length === 0 && (
                  <p className="text-xs text-slate-400 px-3 py-2">No documents found</p>
                )}
                {boardDocs
                  .filter(doc => !attachments.some(a => a.doc_id === doc.id))
                  .map(doc => (
                    <button
                      key={doc.id}
                      onClick={() => addDocAttachment(doc)}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-surface-overlay truncate"
                    >
                      {doc.title}
                    </button>
                  ))
                }
              </div>
            )}
          </div>
        </div>

        {/* ── Properties (collapsible) ─────────────────────────────────── */}
        <details open>
          <summary className="text-xs text-slate-500 cursor-pointer select-none font-semibold mb-2">
            Properties
          </summary>
          <div className="space-y-4">
            {/* Assignment */}
            <div>
              <label className="text-xs text-slate-500 block mb-1">Assigned to</label>
              <select
                value={props.assigned_to || ''}
                onChange={e => updateProp('assigned_to', e.target.value || undefined)}
                className="w-full bg-surface-overlay text-slate-700 text-xs rounded-md px-2 py-1.5 border border-surface-border outline-none"
              >
                <option value="">Unassigned</option>
                {members.map(m => (
                  <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div>
              <label className="text-xs text-slate-500 block mb-1">Tags</label>
              <div className="flex flex-wrap gap-1 mb-1">
                {(props.tags || []).map((tag: string) => (
                  <span key={tag} className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-slate-900">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  className="flex-1 bg-surface-overlay text-slate-900 text-xs rounded-md px-2 py-1 border border-surface-border outline-none"
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
                <button onClick={addTag} className="text-xs bg-surface-overlay text-slate-600 px-2 rounded-md hover:bg-surface-hover">+</button>
              </div>
            </div>

            {/* Due Date */}
            <div>
              <label className="text-xs text-slate-500 block mb-1">Due date</label>
              <input
                type="date"
                value={props.due_date || ''}
                onChange={e => updateProp('due_date', e.target.value || undefined)}
                className="w-full bg-surface-overlay text-slate-700 text-xs rounded-md px-2 py-1.5 border border-surface-border outline-none"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="text-xs text-slate-500 block mb-1">Priority</label>
              <select
                value={props.priority || ''}
                onChange={e => updateProp('priority', e.target.value || undefined)}
                className={`w-full bg-surface-overlay text-xs rounded-md px-2 py-1.5 border border-surface-border outline-none ${priorityColors[props.priority] || 'text-slate-700'}`}
              >
                <option value="">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="text-xs text-slate-500 block mb-1">Status</label>
              <select
                value={props.status || ''}
                onChange={e => updateProp('status', e.target.value || undefined)}
                className={`w-full bg-surface-overlay text-xs rounded-md px-2 py-1.5 border border-surface-border outline-none ${statusColors[props.status] || 'text-slate-700'}`}
              >
                <option value="">None</option>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>
        </details>
      </div>

      {/* Comment input (pinned at bottom) */}
      <div className="p-3 border-t border-surface-border flex gap-2">
        <input
          className="flex-1 bg-surface-overlay text-slate-900 text-xs rounded-md px-2 py-1.5 border border-surface-border outline-none"
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
