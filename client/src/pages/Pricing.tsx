import { useNavigate } from 'react-router-dom'
import { isLoggedIn } from '../hooks/useAuth'

const CONTACT_EMAIL = 'hello@collabboard.io'

interface PlanFeature {
  text: string
  included: boolean
}

interface PlanCard {
  name: string
  badge?: string
  boardLimit: string
  features: PlanFeature[]
  cta: string
  ctaHref?: string
  ctaRoute?: string
  highlight: boolean
}

const plans: PlanCard[] = [
  {
    name: 'Free',
    boardLimit: '2 boards',
    features: [
      { text: '2 boards', included: true },
      { text: 'Up to 3 members per board', included: true },
      { text: 'Real-time collaboration', included: true },
      { text: 'AI assistant', included: true },
      { text: 'Unlimited boards', included: false },
      { text: 'Priority support', included: false },
    ],
    cta: 'Sign up free',
    ctaRoute: '/sign-in',
    highlight: false,
  },
  {
    name: 'Business',
    badge: 'Most Popular',
    boardLimit: 'Unlimited boards',
    features: [
      { text: 'Unlimited boards', included: true },
      { text: 'Unlimited members per board', included: true },
      { text: 'Real-time collaboration', included: true },
      { text: 'AI assistant', included: true },
      { text: 'Priority support', included: true },
      { text: 'License key activation', included: true },
    ],
    cta: 'Contact us',
    ctaHref: `mailto:${CONTACT_EMAIL}?subject=CollabBoard Business Plan`,
    highlight: true,
  },
  {
    name: 'Enterprise',
    boardLimit: 'Custom',
    features: [
      { text: 'Everything in Business', included: true },
      { text: 'SSO / SAML', included: true },
      { text: 'Custom member limits', included: true },
      { text: 'Dedicated support', included: true },
      { text: 'SLA guarantee', included: true },
      { text: 'On-premise option', included: true },
    ],
    cta: 'Contact us',
    ctaHref: `mailto:${CONTACT_EMAIL}?subject=CollabBoard Enterprise`,
    highlight: false,
  },
]

export default function Pricing() {
  const navigate = useNavigate()
  const loggedIn = isLoggedIn()

  function handleCta(plan: PlanCard) {
    if (plan.ctaRoute) navigate(plan.ctaRoute)
    else if (plan.ctaHref) window.location.href = plan.ctaHref
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <button onClick={() => navigate(loggedIn ? '/dashboard' : '/sign-in')} className="text-xl font-bold text-white hover:text-indigo-300 transition-colors">
          CollabBoard
        </button>
        <div className="flex items-center gap-3">
          {loggedIn ? (
            <>
              <button onClick={() => navigate('/activate')} className="text-sm text-gray-400 hover:text-white">
                Activate license
              </button>
              <button onClick={() => navigate('/dashboard')} className="text-sm bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 rounded-lg transition-colors">
                Dashboard
              </button>
            </>
          ) : (
            <button onClick={() => navigate('/sign-in')} className="text-sm bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 rounded-lg transition-colors">
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* Hero */}
      <div className="text-center pt-16 pb-12 px-6">
        <h1 className="text-4xl font-bold mb-4">Simple, transparent pricing</h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto">
          Start for free. Upgrade when your team needs more.
        </p>
      </div>

      {/* Plans */}
      <div className="max-w-5xl mx-auto px-6 pb-20 grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map(plan => (
          <div
            key={plan.name}
            className={`relative rounded-2xl border p-8 flex flex-col ${
              plan.highlight
                ? 'border-indigo-500 bg-indigo-950/40'
                : 'border-gray-800 bg-gray-900'
            }`}
          >
            {plan.badge && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                {plan.badge}
              </span>
            )}

            <h2 className="text-xl font-bold mb-1">{plan.name}</h2>
            <p className="text-indigo-400 text-sm font-medium mb-6">{plan.boardLimit}</p>

            <ul className="space-y-3 mb-8 flex-1">
              {plan.features.map(f => (
                <li key={f.text} className="flex items-center gap-2 text-sm">
                  {f.included ? (
                    <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-gray-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className={f.included ? 'text-gray-200' : 'text-gray-500'}>{f.text}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleCta(plan)}
              className={`w-full py-2.5 rounded-xl font-medium transition-colors text-sm ${
                plan.highlight
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-white'
              }`}
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>

      {/* License key link */}
      <div className="text-center pb-16 text-sm text-gray-500">
        Already have a license key?{' '}
        <button onClick={() => navigate('/activate')} className="text-indigo-400 hover:text-indigo-300">
          Activate it →
        </button>
      </div>
    </div>
  )
}
