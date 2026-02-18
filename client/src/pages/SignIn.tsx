import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { saveAuth } from '../hooks/useAuth'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

export default function SignIn() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'register') {
        const { data } = await axios.post(`${SERVER_URL}/api/auth/register`, {
          name: name.trim(),
          email: email.trim(),
          password,
        })
        saveAuth(data.token, { userId: data.userId, name: data.name, email: data.email })
      } else {
        const { data } = await axios.post(`${SERVER_URL}/api/auth/login`, {
          email: email.trim(),
          password,
        })
        saveAuth(data.token, { userId: data.userId, name: data.name, email: data.email })
      }
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong. Is the server running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-8">
        <h1 className="text-2xl font-bold text-white mb-1">CollabBoard</h1>
        <p className="text-gray-400 text-sm mb-6">
          {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <input
              autoFocus
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl border border-gray-700 focus:border-indigo-500 outline-none"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={loading}
              required
            />
          )}
          <input
            autoFocus={mode === 'login'}
            type="email"
            className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl border border-gray-700 focus:border-indigo-500 outline-none"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={loading}
            required
          />
          <input
            type="password"
            className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl border border-gray-700 focus:border-indigo-500 outline-none"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={loading}
            required
            minLength={6}
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 rounded-xl font-medium transition-colors"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-5">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            className="text-indigo-400 hover:text-indigo-300 font-medium"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>

        <p className="text-center text-xs text-gray-600 mt-3">
          <button onClick={() => navigate('/pricing')} className="hover:text-gray-400 transition-colors">
            See pricing →
          </button>
        </p>
      </div>
    </div>
  )
}
