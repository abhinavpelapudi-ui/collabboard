import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthUser, clearAuth } from '../../hooks/useAuth'

interface Props {
  user: AuthUser
}

function initials(name: string) {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const planColors: Record<string, string> = {
  free: 'text-slate-600 bg-slate-100',
  pro: 'text-indigo-700 bg-indigo-100',
  business: 'text-amber-700 bg-amber-100',
  enterprise: 'text-purple-700 bg-purple-100',
}

export default function UserMenu({ user }: Props) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function signOut() {
    clearAuth()
    navigate('/sign-in')
  }

  const plan = user.plan ?? 'free'
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1)
  const avatarUrl = (user as any).avatarUrl as string | undefined

  return (
    <div className="relative" ref={ref}>
      {/* Avatar button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
        aria-label="User menu"
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={user.name}
            className="w-8 h-8 rounded-full object-cover ring-2 ring-surface-border hover:ring-indigo-500 transition-all"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center text-white text-xs font-bold ring-2 ring-surface-border hover:ring-indigo-500 transition-all">
            {initials(user.name || user.email)}
          </div>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-surface-raised border border-surface-border rounded-xl shadow-xl z-50 overflow-hidden">
          {/* User info */}
          <div className="px-4 py-3 border-b border-surface-border">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img src={avatarUrl} alt={user.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {initials(user.name || user.email)}
                </div>
              )}
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
            <span className={`mt-2 inline-block text-xs px-2 py-0.5 rounded-full font-medium ${planColors[plan]}`}>
              {planLabel} plan
            </span>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button
              onClick={() => { setOpen(false); navigate('/pricing') }}
              className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-surface-overlay hover:text-slate-900 transition-colors"
            >
              Pricing & plans
            </button>
            <button
              onClick={() => { setOpen(false); navigate('/activate') }}
              className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-surface-overlay hover:text-slate-900 transition-colors"
            >
              Activate license key
            </button>
          </div>

          <div className="border-t border-surface-border py-1">
            <button
              onClick={signOut}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-surface-overlay hover:text-red-600 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
