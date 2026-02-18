import { test, expect } from '../fixtures/authenticated.fixture'
import { createBoardViaAPI } from '../helpers/board.helper'

test.describe('Dashboard', () => {

  test('shows board list after sign in', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.locator('h1, h2').filter({ hasText: /board/i }).first()).toBeVisible()
  })

  test('creates a board and navigates to it', async ({ authenticatedPage }) => {
    await authenticatedPage.getByRole('button', { name: '+ New Board' }).click()
    await expect(authenticatedPage).toHaveURL(/\/board\/[a-f0-9-]{36}/, { timeout: 8000 })
  })

  test('board appears in list after creation via API', async ({ authenticatedPage, user, request }) => {
    await createBoardViaAPI(request, user.token, 'My E2E Board')
    await authenticatedPage.reload()
    await expect(authenticatedPage.getByText('My E2E Board')).toBeVisible()
  })

  test('navigates to a board when clicked', async ({ authenticatedPage, user, request }) => {
    await createBoardViaAPI(request, user.token, 'Click To Open Board')
    await authenticatedPage.reload()
    // Board cards use onClick + navigate(), not <a href>. Click the card itself.
    await authenticatedPage.locator('.group').filter({ hasText: 'Click To Open Board' }).first().click()
    await expect(authenticatedPage).toHaveURL(/\/board\/[a-f0-9-]{36}/, { timeout: 8000 })
  })

  test('deletes a board', async ({ authenticatedPage, user, request }) => {
    await createBoardViaAPI(request, user.token, 'Board to Delete')
    await authenticatedPage.reload()
    await expect(authenticatedPage.getByText('Board to Delete')).toBeVisible()

    authenticatedPage.on('dialog', (dialog: import('@playwright/test').Dialog) => dialog.accept())

    const card = authenticatedPage.locator('.group').filter({ hasText: 'Board to Delete' })
    await card.hover()
    await card.getByRole('button', { name: 'Delete' }).click()

    await expect(authenticatedPage.getByText('Board to Delete')).not.toBeVisible({ timeout: 5000 })
  })

  test('copy board link puts URL in clipboard', async ({ authenticatedPage, boardId }) => {
    await authenticatedPage.reload()
    const card = authenticatedPage.locator('.group').first()
    await card.hover()
    await card.getByRole('button', { name: /copy link/i }).click()
    const clipboard = await authenticatedPage.evaluate(() => navigator.clipboard.readText())
    expect(clipboard).toContain(boardId)
  })
})
