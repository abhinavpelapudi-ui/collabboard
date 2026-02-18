// Simple dev auth — stores JWT in localStorage, no OAuth needed
// Replace with Clerk when deploying to production

const TOKEN_KEY = 'collabboard_token'
const USER_KEY = 'collabboard_user'

export interface AuthUser {
  userId: string
  name: string
  email: string
  plan?: string
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function saveAuth(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function savePlan(plan: string) {
  const user = getUser()
  if (user) localStorage.setItem(USER_KEY, JSON.stringify({ ...user, plan }))
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function isLoggedIn(): boolean {
  return !!getToken() && !!getUser()
}
