import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { getToken, savePlan } from '../hooks/useAuth'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

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
      const token = getToken()
      const { data } = await axios.post(
        `${SERVER_URL}/api/auth/activate-license`,
        { key: key.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-8">
        <button onClick={() => navigate('/dashboard')} className="text-gray-500 hover:text-white text-sm mb-6 block">
          ← Back to dashboard
        </button>

        <h1 className="text-2xl font-bold text-white mb-1">Activate License</h1>
        <p className="text-gray-400 text-sm mb-8">
          Enter your license key to unlock unlimited boards and premium features.
        </p>

        {success ? (
          <div className="space-y-4">
            <div className="bg-green-900/30 border border-green-700 text-green-300 rounded-xl px-4 py-3 text-sm">
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
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl border border-gray-700 focus:border-indigo-500 outline-none font-mono text-sm"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={key}
              onChange={e => setKey(e.target.value)}
              disabled={loading}
              required
            />

            {error && (
              <p className="text-red-400 text-sm">{error}</p>
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

        <p className="text-center text-xs text-gray-600 mt-6">
          Need a license?{' '}
          <button onClick={() => navigate('/pricing')} className="text-indigo-400 hover:text-indigo-300">
            See pricing
          </button>
        </p>
      </div>
    </div>
  )
}
