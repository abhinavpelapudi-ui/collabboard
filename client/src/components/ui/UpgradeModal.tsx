import { useNavigate } from 'react-router-dom'

interface UpgradeModalProps {
  onClose: () => void
}

export default function UpgradeModal({ onClose }: UpgradeModalProps) {
  const navigate = useNavigate()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-raised border border-surface-border rounded-2xl p-8 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="w-12 h-12 bg-indigo-600/20 border border-indigo-500/30 rounded-xl flex items-center justify-center mb-5">
          <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>

        <h2 className="text-lg font-bold text-slate-900 mb-2">Board limit reached</h2>
        <p className="text-slate-500 text-sm mb-6">
          You've used all <span className="text-slate-900 font-medium">2 boards</span> included in the free plan.
          Upgrade to create unlimited boards.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => { onClose(); navigate('/pricing') }}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-medium text-sm transition-colors"
          >
            See plans
          </button>
          <button
            onClick={() => { onClose(); navigate('/activate') }}
            className="w-full bg-surface-overlay hover:bg-surface-hover text-slate-900 py-2.5 rounded-xl font-medium text-sm transition-colors"
          >
            Activate license key
          </button>
          <button
            onClick={onClose}
            className="w-full text-slate-400 hover:text-slate-600 text-sm py-1.5 transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
