import { Page, APIRequestContext } from '@playwright/test'

const SERVER_URL = 'http://localhost:3001'
const TOKEN_KEY = 'collabboard_token'
const USER_KEY = 'collabboard_user'

export function uniqueEmail(prefix = 'test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`
}

export interface TestUser {
  email: string
  password: string
  name: string
  token: string
  userId: string
}

export async function registerUser(
  request: APIRequestContext,
  overrides: Partial<{ email: string; name: string; password: string }> = {}
): Promise<TestUser> {
  const email    = overrides.email    ?? uniqueEmail()
  const name     = overrides.name     ?? 'Test User'
  const password = overrides.password ?? 'password123'

  const response = await request.post(`${SERVER_URL}/api/auth/register`, {
    data: { name, email, password },
  })

  if (!response.ok()) {
    throw new Error(`Register failed: ${response.status()} ${await response.text()}`)
  }

  const data = await response.json()
  return { email, password, name, token: data.token, userId: data.userId }
}

export async function loginUser(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<TestUser> {
  const response = await request.post(`${SERVER_URL}/api/auth/login`, {
    data: { email, password },
  })
  const data = await response.json()
  return { email, password, name: data.name, token: data.token, userId: data.userId }
}

export async function injectAuthIntoPage(page: Page, user: TestUser): Promise<void> {
  await page.evaluate(
    ([tokenKey, userKey, token, userJson]) => {
      localStorage.setItem(tokenKey, token)
      localStorage.setItem(userKey, userJson)
    },
    [
      TOKEN_KEY,
      USER_KEY,
      user.token,
      JSON.stringify({ userId: user.userId, name: user.name, email: user.email }),
    ]
  )
}

export async function signUpAndGoToDashboard(page: Page, request: APIRequestContext): Promise<TestUser> {
  const user = await registerUser(request)
  await page.goto('/sign-in')
  await injectAuthIntoPage(page, user)
  await page.goto('/dashboard')
  await page.waitForURL('**/dashboard')
  return user
}
