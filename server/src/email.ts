import { Resend } from 'resend'
import { config } from './config'
import { escapeHtml } from './utils/html'

function getResend() {
  if (!config.RESEND_API_KEY) return null
  return new Resend(config.RESEND_API_KEY)
}

// onboarding@resend.dev works without a verified domain and sends to any email address
const FROM = config.EMAIL_FROM
const CLIENT_URL = config.CLIENT_URL

export async function sendWelcomeEmail(to: string, name: string) {
  const resend = getResend()
  if (!resend) return
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Welcome to CollabBoard!',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;">
        <h2 style="color:#6366f1;">Welcome, ${escapeHtml(name)}!</h2>
        <p>Your CollabBoard account is ready. Start collaborating on unlimited ideas with your team.</p>
        <a href="${CLIENT_URL}/dashboard"
           style="display:inline-block;background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
          Open Dashboard →
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:24px;">
          On the free plan you get 2 boards. <a href="${CLIENT_URL}/pricing">Upgrade anytime</a>.
        </p>
      </div>
    `,
  })
}

export async function sendEmailConfirmation(to: string, name: string, token: string) {
  const resend = getResend()
  if (!resend) return
  const link = `${CLIENT_URL}/confirm-email?token=${token}`
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Confirm your CollabBoard email',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;">
        <h2 style="color:#6366f1;">Confirm your email</h2>
        <p>Hi ${escapeHtml(name)}, please confirm your email address to unlock all features.</p>
        <a href="${link}"
           style="display:inline-block;background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
          Confirm Email →
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:24px;">Link expires in 24 hours.</p>
      </div>
    `,
  })
}

export async function sendOTPEmail(to: string, code: string) {
  const resend = getResend()
  if (!resend) throw new Error('RESEND_API_KEY not configured')

  console.log(`[email] Sending OTP to: ${to}  from: ${FROM}`)

  const result = await resend.emails.send({
    from: FROM,
    to,
    subject: `${escapeHtml(code)} — your CollabBoard sign-in code`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;">
        <h2 style="color:#6366f1;">Your sign-in code</h2>
        <p style="font-size:40px;font-weight:700;letter-spacing:8px;color:#111827;">${escapeHtml(code)}</p>
        <p>Enter this code on the CollabBoard sign-in page. It expires in 10 minutes.</p>
        <p style="color:#6b7280;font-size:13px;">If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  })

  console.log(`[email] Resend response:`, JSON.stringify(result))

  if (result.error) {
    throw new Error(`Resend error: ${result.error.message ?? JSON.stringify(result.error)}`)
  }
}
