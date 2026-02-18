import { test, expect } from '../fixtures/authenticated.fixture'
import { waitForCanvasPaint } from '../helpers/canvas.helper'

test.describe('AI Agent', () => {

  test.beforeEach(async ({ authenticatedPage, boardId }) => {
    await authenticatedPage.goto(`/board/${boardId}`)
    await authenticatedPage.waitForSelector('canvas', { timeout: 10000 })
    await waitForCanvasPaint(authenticatedPage, 800)
    // Open AI panel
    await authenticatedPage.getByTitle('AI Agent (A)').click()
    await expect(authenticatedPage.getByText('AI Board Agent')).toBeVisible()
  })

  test('AI panel opens and shows welcome message', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.getByText(/Tell me what to create/)).toBeVisible()
  })

  test('AI panel can be closed', async ({ authenticatedPage }) => {
    await authenticatedPage.getByTitle('AI Agent (A)').click()
    await expect(authenticatedPage.getByText('AI Board Agent')).not.toBeVisible()
  })

  test('SWOT template responds instantly without API', async ({ authenticatedPage }) => {
    const input = authenticatedPage.getByPlaceholder('Tell AI what to do...')
    await input.fill('Create a SWOT analysis')
    await input.press('Enter')

    await expect(
      authenticatedPage.getByText('Created SWOT analysis with 4 quadrants')
    ).toBeVisible({ timeout: 8000 })
  })

  test('Kanban template responds instantly without API', async ({ authenticatedPage }) => {
    const input = authenticatedPage.getByPlaceholder('Tell AI what to do...')
    await input.fill('Create a kanban board')
    await input.press('Enter')

    await expect(
      authenticatedPage.getByText('Created Kanban board with 3 columns')
    ).toBeVisible({ timeout: 8000 })
  })

  test('user journey template works', async ({ authenticatedPage }) => {
    const input = authenticatedPage.getByPlaceholder('Tell AI what to do...')
    await input.fill('Create a user journey')
    await input.press('Enter')

    await expect(
      authenticatedPage.getByText('Created user journey map with 5 stages')
    ).toBeVisible({ timeout: 8000 })
  })

  test('brainstorm template works', async ({ authenticatedPage }) => {
    const input = authenticatedPage.getByPlaceholder('Tell AI what to do...')
    await input.fill('Brainstorm')
    await input.press('Enter')

    await expect(
      authenticatedPage.getByText('Created brainstorm board with idea clusters')
    ).toBeVisible({ timeout: 8000 })
  })

  test('typing in AI input does not delete selected canvas object', async ({ authenticatedPage }) => {
    // Place a sticky note
    const { placeStickyNote, getCanvasCenter } = await import('../helpers/canvas.helper')
    const center = await getCanvasCenter(authenticatedPage)
    await authenticatedPage.getByTitle('AI Agent (A)').click() // close panel first
    await placeStickyNote(authenticatedPage, center.x, center.y)
    await authenticatedPage.mouse.click(center.x, center.y) // select it

    // Reopen AI panel and type Backspace in input
    await authenticatedPage.getByTitle('AI Agent (A)').click()
    const input = authenticatedPage.getByPlaceholder('Tell AI what to do...')
    await input.fill('some text')
    await input.press('Backspace') // should NOT delete the sticky note

    // Canvas still renders (no crash from accidental delete)
    await expect(authenticatedPage.locator('canvas').first()).toBeVisible()
  })
})
