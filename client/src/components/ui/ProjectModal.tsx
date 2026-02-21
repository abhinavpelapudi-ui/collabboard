import { useState } from 'react'
import axios from 'axios'
import { getToken } from '../../hooks/useAuth'
import { Project } from '@collabboard/shared'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}` }
}

const INDUSTRIES = [
  '', 'Construction', 'Healthcare', 'Marketing', 'Engineering',
  'Education', 'Finance', 'Retail', 'Manufacturing', 'Technology',
  'Legal', 'Real Estate', 'Consulting', 'Design', 'Other',
]

const COLORS = [
  '#6366f1', '#ef4444', '#f59e0b', '#22c55e', '#06b6d4',
  '#a855f7', '#ec4899', '#f97316', '#14b8a6', '#8b5cf6',
]

interface Props {
  workspaceId: string
  project?: Project | null
  onClose: () => void
  onCreated?: (project: Project) => void
  onUpdated?: (project: Project) => void
}

export default function ProjectModal({ workspaceId, project, onClose, onCreated, onUpdated }: Props) {
  const isEdit = !!project
  const [name, setName] = useState(project?.name || '')
  const [description, setDescription] = useState(project?.description || '')
  const [industry, setIndustry] = useState(project?.industry || '')
  const [color, setColor] = useState(project?.color || '#6366f1')
  const [startDate, setStartDate] = useState(project?.start_date?.slice(0, 10) || '')
  const [endDate, setEndDate] = useState(project?.end_date?.slice(0, 10) || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')

    try {
      if (isEdit && project) {
        const { data } = await axios.patch(
          `${SERVER_URL}/api/projects/${project.id}`,
          { name: name.trim(), description, industry, color, startDate: startDate || null, endDate: endDate || null },
          { headers: authHeaders() }
        )
        onUpdated?.(data)
      } else {
        const { data } = await axios.post(
          `${SERVER_URL}/api/projects`,
          { name: name.trim(), workspaceId, description, industry, color, startDate: startDate || null, endDate: endDate || null },
          { headers: authHeaders() }
        )
        onCreated?.(data)
      }
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-raised border border-surface-border rounded-2xl w-full max-w-lg p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white mb-4">{isEdit ? 'Edit Project' : 'New Project'}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Project Name</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Surgery Department Optimization"
              className="w-full bg-surface-overlay text-white text-sm px-3 py-2.5 rounded-lg border border-surface-border outline-none focus:border-indigo-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this project about?"
              rows={3}
              className="w-full bg-surface-overlay text-white text-sm px-3 py-2.5 rounded-lg border border-surface-border outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Industry + Color */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-slate-500 mb-1 block">Industry</label>
              <select
                value={industry}
                onChange={e => setIndustry(e.target.value)}
                className="w-full bg-surface-overlay text-white text-sm px-3 py-2.5 rounded-lg border border-surface-border outline-none"
              >
                <option value="">Select industry...</option>
                {INDUSTRIES.filter(Boolean).map(ind => (
                  <option key={ind} value={ind.toLowerCase()}>{ind}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Color</label>
              <div className="flex gap-1.5 flex-wrap mt-1">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${
                      color === c ? 'border-white scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-slate-500 mb-1 block">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-surface-overlay text-white text-sm px-3 py-2.5 rounded-lg border border-surface-border outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-500 mb-1 block">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full bg-surface-overlay text-white text-sm px-3 py-2.5 rounded-lg border border-surface-border outline-none"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-sm px-4 py-2 rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg font-medium"
            >
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
