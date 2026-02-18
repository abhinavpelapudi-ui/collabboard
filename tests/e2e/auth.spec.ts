import { test, expect } from '@playwright/test'
import { uniqueEmail, registerUser } from '../helpers/auth.helper'

test.describe('Authentication', () => {

  test('redirects unauthenticated user from /dashboard to /sign-in', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/sign-in/)
  })

  test('sign up with a new account', async ({ page }) => {
    const email = uniqueEmail('signup')
    await page.goto('/sign-in')

    await page.getByRole('button', { name: 'Sign up' }).click()
    await page.getByPlaceholder('Your name').fill('Test User')
    await page.getByPlaceholder('Email').fill(email)
    await page.getByPlaceholder('Password').fill('password123')
    await page.getByRole('button', { name: /Create Account/ }).click()

    await expect(page).toHaveURL(/dashboard/, { timeout: 8000 })
  })

  test('sign in with existing account', async ({ page, request }) => {
    const email = uniqueEmail('signin')
    await request.post('http://localhost:3001/api/auth/register', {
      data: { name: 'Signin Test', email, password: 'password123' },
    })

    await page.goto('/sign-in')
    await page.getByPlaceholder('Email').fill(email)
    await page.getByPlaceholder('Password').fill('password123')
    await page.getByRole('button', { name: /Sign In/ }).click()

    await expect(page).toHaveURL(/dashboard/, { timeout: 8000 })
  })

  test('shows error for wrong password', async ({ page, request }) => {
    const email = uniqueEmail('wrongpass')
    await request.post('http://localhost:3001/api/auth/register', {
      data: { name: 'Wrong Pass', email, password: 'correct123' },
    })

    await page.goto('/sign-in')
    await page.getByPlaceholder('Email').fill(email)
    await page.getByPlaceholder('Password').fill('wrongpassword')
    await page.getByRole('button', { name: /Sign In/ }).click()

    await expect(page.getByText('Incorrect password')).toBeVisible()
  })

  test('shows error for unregistered email', async ({ page }) => {
    await page.goto('/sign-in')
    await page.getByPlaceholder('Email').fill('nobody@example.com')
    await page.getByPlaceholder('Password').fill('password123')
    await page.getByRole('button', { name: /Sign In/ }).click()

    await expect(page.getByText('No account found')).toBeVisible()
  })

  test('sign out clears session', async ({ page, request }) => {
    const user = await registerUser(request)
    const { injectAuthIntoPage } = await import('../helpers/auth.helper')

    await page.goto('/sign-in')
    await injectAuthIntoPage(page, user)
    await page.goto('/dashboard')
    await page.waitForURL('**/dashboard')

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/sign-in/)

    const token = await page.evaluate(() => localStorage.getItem('collabboard_token'))
    expect(token).toBeNull()
  })
})
