import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveAuth } from '../hooks/useAuth'

export default function OAuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const token = params.get('token')
    const userId = params.get('userId')
    const name = params.get('name')
    const email = params.get('email')

    if (token && userId && name && email) {
      window.history.replaceState({}, '', '/oauth-callback')
      saveAuth(token, { userId, name, email })
      navigate('/dashboard', { replace: true })
    } else {
      navigate('/sign-in?error=oauth_failed', { replace: true })
    }
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500 text-sm">Signing you in…</p>
      </div>
    </div>
  )
}
