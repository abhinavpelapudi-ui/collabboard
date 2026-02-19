import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { saveAuth } from '../hooks/useAuth'

export default function OAuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const token = searchParams.get('token')
    const userId = searchParams.get('userId')
    const name = searchParams.get('name')
    const email = searchParams.get('email')

    if (token && userId && name && email) {
      saveAuth(token, { userId, name, email })
      navigate('/dashboard', { replace: true })
    } else {
      navigate('/sign-in?error=oauth_failed', { replace: true })
    }
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400 text-sm">Signing you in…</p>
      </div>
    </div>
  )
}
