import { useRef, useState } from 'react'
import { Workspace } from '@collabboard/shared'
import { api } from '../../lib/api'
import { useModalKeyboard } from '../../hooks/useModalKeyboard'

interface Props {
  boardId: string
  currentWorkspaceId: string | null | undefined
  workspaces: Workspace[]
  onClose: () => void
  onMoved: (newWorkspaceId: string | null) => void
}

export default function MoveToWorkspaceModal({ boardId, currentWorkspaceId, workspaces, onClose, onMoved }: Props) {
  useModalKeyboard(onClose)
  const [selected, setSelected] = useState<string | null>(currentWorkspaceId ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const overlayRef = useRef<HTMLDivElement>(null)

  // Only show workspaces where user is owner or editor
  const editable = workspaces.filter(w => w.role === 'owner' || w.role === 'editor')

  async function handleMove() {
    if (selected === (currentWorkspaceId ?? null)) { onClose(); return }
    setSaving(true)
    setError('')
    try {
      await api.patch(
        `/api/boards/${boardId}`,
        { workspaceId: selected }
      )
      onMoved(selected)
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to move board')
      setSaving(false)
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-surface-raised border border-surface-border rounded-2xl w-full max-w-sm shadow-2xl p-6">
        <h2 className="text-slate-900 font-semibold mb-4">Move to workspace</h2>

        <div className="space-y-2 mb-5">
          {/* Personal option */}
          <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors hover:bg-surface-overlay border-surface-border has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-500/10">
            <input
              type="radio"
              name="workspace"
              value=""
              checked={selected === null}
              onChange={() => setSelected(null)}
              className="accent-indigo-500"
            />
            <span className="text-sm text-slate-700">Personal (no workspace)</span>
          </label>

          {editable.map(ws => (
            <label key={ws.id} className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors hover:bg-surface-overlay border-surface-border has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-500/10">
              <input
                type="radio"
                name="workspace"
                value={ws.id}
                checked={selected === ws.id}
                onChange={() => setSelected(ws.id)}
                className="accent-indigo-500"
              />
              <span className="text-sm text-slate-700 truncate">{ws.name}</span>
            </label>
          ))}

          {editable.length === 0 && (
            <p className="text-slate-400 text-sm text-center py-2">No workspaces available. Create one first.</p>
          )}
        </div>

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={handleMove}
            disabled={saving}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-medium transition-colors"
          >
            {saving ? 'Moving…' : 'Move'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-surface-overlay hover:bg-surface-hover text-slate-600 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
