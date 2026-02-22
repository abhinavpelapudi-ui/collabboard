import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { savePlan } from '../hooks/useAuth'
import { api } from '../lib/api'

const PLAN_LABELS: Record<string, string> = {
  pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise',
}

export default function ActivateLicense() {
  const navigate = useNavigate()
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const { data } = await api.post(
        '/api/auth/activate-license',
        { key: key.trim() }
      )
      savePlan(data.plan)
      setSuccess(`License activated! Your plan is now ${PLAN_LABELS[data.plan] ?? data.plan}.`)
      setKey('')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to activate license key.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-surface-raised border border-surface-border rounded-2xl p-8">
        <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-slate-900 text-sm mb-6 block">
          ← Back to dashboard
        </button>

        <h1 className="text-2xl font-bold text-slate-900 mb-1">Activate License</h1>
        <p className="text-slate-500 text-sm mb-8">
          Enter your license key to unlock unlimited boards and premium features.
        </p>

        {success ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
              {success}
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-medium transition-colors"
            >
              Go to Dashboard →
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              autoFocus
              className="w-full bg-surface-overlay text-slate-900 px-4 py-3 rounded-xl border border-surface-border focus:border-indigo-500 outline-none font-mono text-sm"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={key}
              onChange={e => setKey(e.target.value)}
              disabled={loading}
              required
            />

            {error && (
              <p className="text-red-600 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !key.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 rounded-xl font-medium transition-colors"
            >
              {loading ? 'Activating...' : 'Activate License →'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-slate-400 mt-6">
          Need a license?{' '}
          <button onClick={() => navigate('/pricing')} className="text-indigo-600 hover:text-indigo-500">
            See pricing
          </button>
        </p>
      </div>
    </div>
  )
}
