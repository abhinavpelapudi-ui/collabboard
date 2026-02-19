import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { saveAuth } from '../hooks/useAuth'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

export default function SignIn() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const oauthError = searchParams.get('error')

  const [otpStep, setOtpStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(oauthError ? 'OAuth sign-in failed. Please try another method.' : '')
  const [info, setInfo] = useState('')

  async function handleOTP(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    try {
      if (otpStep === 'email') {
        await axios.post(`${SERVER_URL}/api/auth/otp/send`, { email: email.trim() })
        setOtpStep('code')
        setInfo(`A 6-digit code was sent to ${email.trim()}`)
      } else {
        const { data } = await axios.post(`${SERVER_URL}/api/auth/otp/verify`, {
          email: email.trim(),
          code: otpCode.trim(),
        })
        saveAuth(data.token, { userId: data.userId, name: data.name, email: data.email })
        navigate('/dashboard')
      }
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
        <p className="text-gray-400 text-sm mb-6">Sign in or create an account</p>

        {/* ── Social login buttons ── */}
        <div className="space-y-2 mb-5">
          <a
            href={`${SERVER_URL}/api/auth/google`}
            className="flex items-center justify-center gap-3 w-full bg-white hover:bg-gray-100 text-gray-900 py-2.5 rounded-xl font-medium text-sm transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </a>
          <a
            href={`${SERVER_URL}/api/auth/github`}
            className="flex items-center justify-center gap-3 w-full bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl font-medium text-sm border border-gray-700 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            Continue with GitHub
          </a>
        </div>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-gray-600 text-xs">or sign in with email code</span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        {/* ── OTP form ── */}
        <form onSubmit={handleOTP} className="space-y-3">
          <input
            type="email"
            className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl border border-gray-700 focus:border-indigo-500 outline-none"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={loading || otpStep === 'code'}
            required
          />

          {otpStep === 'code' && (
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              maxLength={6}
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl border border-indigo-500 outline-none text-center tracking-widest text-xl font-mono"
              placeholder="000000"
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
              disabled={loading}
              required
            />
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {info && <p className="text-green-400 text-sm">{info}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 rounded-xl font-medium transition-colors"
          >
            {loading ? 'Please wait…'
              : otpStep === 'email' ? 'Send code →'
              : 'Verify & sign in →'}
          </button>

          {otpStep === 'code' && (
            <button
              type="button"
              className="w-full text-gray-500 text-sm hover:text-gray-300 transition-colors"
              onClick={() => { setOtpStep('email'); setOtpCode(''); setInfo(''); setError('') }}
            >
              ← Use a different email
            </button>
          )}
        </form>

        <p className="text-center text-xs text-gray-600 mt-5">
          <button onClick={() => navigate('/pricing')} className="hover:text-gray-400 transition-colors">
            See pricing →
          </button>
        </p>
      </div>
    </div>
  )
}
