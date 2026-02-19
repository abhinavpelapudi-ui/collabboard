import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.EMAIL_FROM || 'CollabBoard <noreply@collabboard.app>'
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'

export async function sendWelcomeEmail(to: string, name: string) {
  if (!process.env.RESEND_API_KEY) return
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Welcome to CollabBoard!',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;">
        <h2 style="color:#6366f1;">Welcome, ${name}! 🎉</h2>
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
  if (!process.env.RESEND_API_KEY) return
  const link = `${CLIENT_URL}/confirm-email?token=${token}`
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Confirm your CollabBoard email',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;">
        <h2 style="color:#6366f1;">Confirm your email</h2>
        <p>Hi ${name}, please confirm your email address to unlock all features.</p>
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
  if (!process.env.RESEND_API_KEY) return
  await resend.emails.send({
    from: FROM,
    to,
    subject: `${code} — your CollabBoard sign-in code`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;">
        <h2 style="color:#6366f1;">Your sign-in code</h2>
        <p style="font-size:40px;font-weight:700;letter-spacing:8px;color:#111827;">${code}</p>
        <p>Enter this code on the CollabBoard sign-in page. It expires in 10 minutes.</p>
        <p style="color:#6b7280;font-size:13px;">If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  })
}
