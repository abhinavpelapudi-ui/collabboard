import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { saveAuth } from '../hooks/useAuth'
import { SERVER_URL } from '../lib/api'

export default function SignIn() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const oauthError = searchParams.get('error')

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [otpStep, setOtpStep] = useState<'form' | 'code'>('form')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(oauthError ? 'OAuth sign-in failed. Please try another method.' : '')
  const [info, setInfo] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    try {
      if (otpStep === 'form') {
        await axios.post(`${SERVER_URL}/api/auth/otp/send`, { email: email.trim() })
        setOtpStep('code')
        setInfo(`A 6-digit code was sent to ${email.trim()}`)
      } else {
        const { data } = await axios.post(`${SERVER_URL}/api/auth/otp/verify`, {
          email: email.trim(),
          code: otpCode.trim(),
          ...(mode === 'signup' && name.trim() ? { name: name.trim() } : {}),
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

  function switchMode(next: 'signin' | 'signup') {
    setMode(next)
    setOtpStep('form')
    setName('')
    setEmail('')
    setOtpCode('')
    setError('')
    setInfo('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-purple-600/10 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo + tagline */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4 shadow-glow">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">CollabBoard</h1>
          <p className="text-sm text-slate-500 mt-1">Collaborate visually, powered by AI</p>
        </div>

        <div className="bg-surface-raised border border-surface-border rounded-2xl p-8 shadow-card backdrop-blur-sm">
          {/* Sign in / Sign up toggle */}
          <div className="flex bg-surface rounded-xl p-1 mb-6">
            <button
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'signin' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => switchMode('signin')}
            >
              Sign in
            </button>
            <button
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'signup' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => switchMode('signup')}
            >
              Sign up
            </button>
          </div>

          {/* Social login buttons */}
          <div className="space-y-2.5 mb-5">
            <a
              href={`${SERVER_URL}/api/auth/google`}
              className="flex items-center justify-center gap-3 w-full bg-white hover:bg-gray-50 text-gray-800 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm hover:shadow-md"
            >
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              {mode === 'signup' ? 'Sign up' : 'Sign in'} with Google
            </a>
            <a
              href={`${SERVER_URL}/api/auth/github`}
              className="flex items-center justify-center gap-3 w-full bg-surface-overlay hover:bg-surface-hover text-slate-700 py-2.5 rounded-xl font-medium text-sm border border-surface-border transition-all hover:border-slate-400"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              {mode === 'signup' ? 'Sign up' : 'Sign in'} with GitHub
            </a>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-surface-border" />
            <span className="text-slate-500 text-xs">or use email code</span>
            <div className="flex-1 h-px bg-surface-border" />
          </div>

          {/* OTP form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && otpStep === 'form' && (
              <input
                autoFocus
                className="w-full bg-surface text-slate-700 px-4 py-3 rounded-xl border border-surface-border focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none transition-all placeholder:text-slate-400"
                placeholder="Your name"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={loading}
                required
              />
            )}

            <input
              autoFocus={mode === 'signin' && otpStep === 'form'}
              type="email"
              className="w-full bg-surface text-slate-700 px-4 py-3 rounded-xl border border-surface-border focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none transition-all placeholder:text-slate-400"
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
                className="w-full bg-surface text-slate-900 px-4 py-3 rounded-xl border border-indigo-500 ring-1 ring-indigo-500/30 outline-none text-center tracking-widest text-xl font-mono transition-all"
                placeholder="000000"
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                disabled={loading}
                required
              />
            )}

            {error && <p className="text-red-600 text-sm">{error}</p>}
            {info && <p className="text-emerald-600 text-sm">{info}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition-all shadow-md hover:shadow-glow"
            >
              {loading ? 'Please wait...'
                : otpStep === 'form' ? 'Send code'
                : 'Verify & sign in'}
            </button>

            {otpStep === 'code' && (
              <button
                type="button"
                className="w-full text-slate-500 text-sm hover:text-slate-700 transition-colors"
                onClick={() => { setOtpStep('form'); setOtpCode(''); setInfo(''); setError('') }}
              >
                Use a different email
              </button>
            )}
          </form>

          <p className="text-center text-xs text-slate-400 mt-5">
            <button onClick={() => navigate('/pricing')} className="hover:text-slate-600 transition-colors">
              View plans & pricing
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
