/**
 * Permissions UI Tests
 * Tests that the client correctly reflects roles:
 *   - Owner: full toolbar, "Manage access" button, rename/delete on dashboard
 *   - Editor: full toolbar, no "Manage access", can rename on dashboard
 *   - Viewer: "View only" badge, no toolbar, no AI panel, read-only dashboard card
 */
import { test, expect } from '@playwright/test'
import { registerUser, injectAuthIntoPage } from '../helpers/auth.helper'
import { createBoardViaAPI, inviteMemberViaAPI } from '../helpers/board.helper'
import { waitForCanvasPaint } from '../helpers/canvas.helper'

test.describe('Permissions — UI', () => {

  // ─── Dashboard role badges ────────────────────────────────────────────────

  test('dashboard shows Owner badge on own board', async ({ page, request }) => {
    const owner = await registerUser(request, { name: 'DashOwner' })
    await createBoardViaAPI(request, owner.token, 'Badge Board')

    await page.goto('/sign-in')
    await injectAuthIntoPage(page, owner)
    await page.goto('/dashboard')
    await page.waitForURL('**/dashboard')

    await expect(page.locator('.group').first()).toContainText('Owner')
  })

  test('dashboard shows Editor badge on shared board', async ({ page, request }) => {
    const owner = await registerUser(request)
    const editor = await registerUser(request, { name: 'DashEditor' })
    const board = await createBoardViaAPI(request, owner.token, 'Shared for Editor')

    await inviteMemberViaAPI(request, owner.token, board.id, editor.email, 'editor')

    await page.goto('/sign-in')
    await injectAuthIntoPage(page, editor)
    await page.goto('/dashboard')
    await page.waitForURL('**/dashboard')

    const card = page.locator('.group').filter({ hasText: 'Shared for Editor' })
    await expect(card.getByText('Editor', { exact: true })).toBeVisible({ timeout: 6000 })
  })

  test('dashboard shows Viewer badge on shared board', async ({ page, request }) => {
    const owner = await registerUser(request)
    const viewer = await registerUser(request, { name: 'DashViewer' })
    const board = await createBoardViaAPI(request, owner.token, 'View-only Board')

    await inviteMemberViaAPI(request, owner.token, board.id, viewer.email, 'viewer')

    await page.goto('/sign-in')
    await injectAuthIntoPage(page, viewer)
    await page.goto('/dashboard')
    await page.waitForURL('**/dashboard')

    const card = page.locator('.group').filter({ hasText: 'View-only Board' })
    await expect(card.getByText('Viewer', { exact: true })).toBeVisible({ timeout: 6000 })
  })

  test('dashboard hides Delete button for editors', async ({ page, request }) => {
    const owner = await registerUser(request)
    const editor = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token, 'Editor Cannot Delete')

    await inviteMemberViaAPI(request, owner.token, board.id, editor.email, 'editor')

    await page.goto('/sign-in')
    await injectAuthIntoPage(page, editor)
    await page.goto('/dashboard')

    const card = page.locator('.group').filter({ hasText: 'Editor Cannot Delete' })
    await card.hover()
    await expect(card.getByRole('button', { name: 'Delete' })).not.toBeVisible()
  })

  test('dashboard hides Delete and Rename for viewers', async ({ page, request }) => {
    const owner = await registerUser(request)
    const viewer = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token, 'Viewer No Actions')

    await inviteMemberViaAPI(request, owner.token, board.id, viewer.email, 'viewer')

    await page.goto('/sign-in')
    await injectAuthIntoPage(page, viewer)
    await page.goto('/dashboard')

    const card = page.locator('.group').filter({ hasText: 'Viewer No Actions' })
    await card.hover()
    await expect(card.getByRole('button', { name: 'Delete' })).not.toBeVisible()
    await expect(card.getByRole('button', { name: 'Rename' })).not.toBeVisible()
  })

  // ─── Board page — owner ───────────────────────────────────────────────────

  test('owner sees Manage access button on board page', async ({ page, request }) => {
    const owner = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await page.goto('/sign-in')
    await injectAuthIntoPage(page, owner)
    await page.goto(`/board/${board.id}`)
    await page.waitForSelector('canvas', { timeout: 10000 })
    await waitForCanvasPaint(page, 500)

    await expect(page.getByRole('button', { name: 'Manage access' })).toBeVisible()
  })

  test('owner sees full toolbar on board page', async ({ page, request }) => {
    const owner = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await page.goto('/sign-in')
    await injectAuthIntoPage(page, owner)
    await page.goto(`/board/${board.id}`)
    await page.waitForSelector('canvas', { timeout: 10000 })
    await waitForCanvasPaint(page, 500)

    await expect(page.getByTitle('Sticky (S)')).toBeVisible()
    await expect(page.getByTitle('Rect (R)')).toBeVisible()
  })

  // ─── Board page — editor ──────────────────────────────────────────────────

  test('editor sees full toolbar but no Manage access button', async ({ page, request }) => {
    const owner = await registerUser(request)
    const editor = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, editor.email, 'editor')

    await page.goto('/sign-in')
    await injectAuthIntoPage(page, editor)
    await page.goto(`/board/${board.id}`)
    await page.waitForSelector('canvas', { timeout: 10000 })
    await waitForCanvasPaint(page, 500)

    await expect(page.getByTitle('Sticky (S)')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Manage access' })).not.toBeVisible()
  })

  // ─── Board page — viewer ──────────────────────────────────────────────────

  test('viewer sees View only badge', async ({ page, request }) => {
    const owner = await registerUser(request)
    const viewer = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, viewer.email, 'viewer')

    await page.goto('/sign-in')
    await injectAuthIntoPage(page, viewer)
    await page.goto(`/board/${board.id}`)
    await page.waitForSelector('canvas', { timeout: 10000 })
    await waitForCanvasPaint(page, 500)

    await expect(page.getByText('View only')).toBeVisible()
  })

  test('viewer sees no toolbar', async ({ page, request }) => {
    const owner = await registerUser(request)
    const viewer = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, viewer.email, 'viewer')

    await page.goto('/sign-in')
    await injectAuthIntoPage(page, viewer)
    await page.goto(`/board/${board.id}`)
    await page.waitForSelector('canvas', { timeout: 10000 })
    await waitForCanvasPaint(page, 500)

    await expect(page.getByTitle('Sticky (S)')).not.toBeVisible()
    await expect(page.getByTitle('Rect (R)')).not.toBeVisible()
  })

  test('viewer sees no AI panel toggle', async ({ page, request }) => {
    const owner = await registerUser(request)
    const viewer = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, viewer.email, 'viewer')

    await page.goto('/sign-in')
    await injectAuthIntoPage(page, viewer)
    await page.goto(`/board/${board.id}`)
    await page.waitForSelector('canvas', { timeout: 10000 })
    await waitForCanvasPaint(page, 500)

    // AI button is part of Toolbar which is hidden for viewers
    await expect(page.getByTitle('AI Agent (A)')).not.toBeVisible()
  })

  test('viewer sees no Manage access button', async ({ page, request }) => {
    const owner = await registerUser(request)
    const viewer = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, viewer.email, 'viewer')

    await page.goto('/sign-in')
    await injectAuthIntoPage(page, viewer)
    await page.goto(`/board/${board.id}`)
    await page.waitForSelector('canvas', { timeout: 10000 })
    await waitForCanvasPaint(page, 500)

    await expect(page.getByRole('button', { name: 'Manage access' })).not.toBeVisible()
  })

  // ─── Share modal ──────────────────────────────────────────────────────────

  test('owner can open Share modal and see member list', async ({ page, request }) => {
    const owner = await registerUser(request, { name: 'Modal Owner' })
    const editor = await registerUser(request, { name: 'Modal Editor' })
    const board = await createBoardViaAPI(request, owner.token, 'Modal Board')

    await inviteMemberViaAPI(request, owner.token, board.id, editor.email, 'editor')

    await page.goto('/sign-in')
    await injectAuthIntoPage(page, owner)
    await page.goto(`/board/${board.id}`)
    await page.waitForSelector('canvas', { timeout: 10000 })
    await waitForCanvasPaint(page, 500)

    await page.getByRole('button', { name: 'Manage access' }).click()

    // Modal opens
    await expect(page.getByText('Share Board')).toBeVisible()

    // Shows owner and editor
    await expect(page.getByText('Modal Owner')).toBeVisible()
    await expect(page.getByText('Modal Editor')).toBeVisible()
  })

  test('owner can invite a new user via Share modal', async ({ page, request }) => {
    const owner = await registerUser(request)
    const newUser = await registerUser(request, { name: 'Fresh Invitee' })
    const board = await createBoardViaAPI(request, owner.token)

    await page.goto('/sign-in')
    await injectAuthIntoPage(page, owner)
    await page.goto(`/board/${board.id}`)
    await page.waitForSelector('canvas', { timeout: 10000 })
    await waitForCanvasPaint(page, 500)

    await page.getByRole('button', { name: 'Manage access' }).click()
    await expect(page.getByText('Share Board')).toBeVisible()

    await page.getByPlaceholder('Email address').fill(newUser.email)
    await page.getByRole('button', { name: 'Invite' }).click()

    // New member appears in the list
    await expect(page.getByText('Fresh Invitee')).toBeVisible({ timeout: 5000 })
  })

  test('Share modal shows error for unknown email', async ({ page, request }) => {
    const owner = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await page.goto('/sign-in')
    await injectAuthIntoPage(page, owner)
    await page.goto(`/board/${board.id}`)
    await page.waitForSelector('canvas', { timeout: 10000 })
    await waitForCanvasPaint(page, 500)

    await page.getByRole('button', { name: 'Manage access' }).click()
    await page.getByPlaceholder('Email address').fill('doesnotexist@example.com')
    await page.getByRole('button', { name: 'Invite' }).click()

    await expect(page.getByText('No user found with that email')).toBeVisible({ timeout: 5000 })
  })

  test('owner can remove a member via Share modal', async ({ page, request }) => {
    const owner = await registerUser(request)
    const editor = await registerUser(request, { name: 'To Be Removed' })
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, editor.email, 'editor')

    await page.goto('/sign-in')
    await injectAuthIntoPage(page, owner)
    await page.goto(`/board/${board.id}`)
    await page.waitForSelector('canvas', { timeout: 10000 })
    await waitForCanvasPaint(page, 500)

    await page.getByRole('button', { name: 'Manage access' }).click()
    await expect(page.getByText('To Be Removed')).toBeVisible()

    // Click the remove button (✕) next to "To Be Removed"
    const memberRow = page.locator('li').filter({ hasText: 'To Be Removed' })
    await memberRow.getByTitle('Remove member').click()

    await expect(page.getByText('To Be Removed')).not.toBeVisible({ timeout: 5000 })
  })

  test('Share modal closes on backdrop click', async ({ page, request }) => {
    const owner = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await page.goto('/sign-in')
    await injectAuthIntoPage(page, owner)
    await page.goto(`/board/${board.id}`)
    await page.waitForSelector('canvas', { timeout: 10000 })
    await waitForCanvasPaint(page, 500)

    await page.getByRole('button', { name: 'Manage access' }).click()
    await expect(page.getByText('Share Board')).toBeVisible()

    // Click backdrop (the fixed overlay div behind the modal)
    await page.mouse.click(10, 10)
    await expect(page.getByText('Share Board')).not.toBeVisible({ timeout: 3000 })
  })
})
