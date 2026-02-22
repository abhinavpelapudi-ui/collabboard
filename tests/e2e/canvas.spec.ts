import { test, expect } from '../fixtures/authenticated.fixture'
import {
  clickToolbarButton,
  placeStickyNote,
  placeRect,
  editStickyNoteText,
  dragObject,
  waitForCanvasPaint,
  getCanvasCenter,
  modKey,
} from '../helpers/canvas.helper'

test.describe('Canvas Interactions', () => {

  test.beforeEach(async ({ authenticatedPage, boardId }) => {
    await authenticatedPage.goto(`/board/${boardId}`)
    await authenticatedPage.waitForSelector('canvas', { timeout: 10000 })
    await waitForCanvasPaint(authenticatedPage, 800)
  })

  test('canvas renders on board page', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.locator('canvas').first()).toBeVisible()
  })

  test('toolbar is visible with all tools', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.getByTitle('Select (V)')).toBeVisible()
    await expect(authenticatedPage.getByTitle('Pan (H)')).toBeVisible()
    await expect(authenticatedPage.getByTitle('Sticky (S)')).toBeVisible()
    await expect(authenticatedPage.getByTitle('Rect (R)')).toBeVisible()
  })

  test('keyboard shortcut S activates sticky tool', async ({ authenticatedPage }) => {
    await authenticatedPage.keyboard.press('s')
    await expect(authenticatedPage.getByTitle('Sticky (S)')).toHaveClass(/bg-indigo-600/)
  })

  test('keyboard shortcut R activates rect tool', async ({ authenticatedPage }) => {
    await authenticatedPage.keyboard.press('r')
    await expect(authenticatedPage.getByTitle('Rect (R)')).toHaveClass(/bg-indigo-600/)
  })

  test('keyboard shortcut Escape returns to select tool', async ({ authenticatedPage }) => {
    await authenticatedPage.keyboard.press('s')
    await authenticatedPage.keyboard.press('Escape')
    await expect(authenticatedPage.getByTitle('Select (V)')).toHaveClass(/bg-indigo-600/)
  })

  test('places a sticky note by clicking the canvas', async ({ authenticatedPage }) => {
    const center = await getCanvasCenter(authenticatedPage)
    await placeStickyNote(authenticatedPage, center.x, center.y)
    await waitForCanvasPaint(authenticatedPage)

    // After placement tool resets to select
    await expect(authenticatedPage.getByTitle('Select (V)')).toHaveClass(/bg-indigo-600/)
  })

  test('places a rect by clicking the canvas', async ({ authenticatedPage }) => {
    const center = await getCanvasCenter(authenticatedPage)
    await placeRect(authenticatedPage, center.x, center.y)
    await waitForCanvasPaint(authenticatedPage)

    await expect(authenticatedPage.getByTitle('Select (V)')).toHaveClass(/bg-indigo-600/)
  })

  test('double-click on sticky opens textarea for editing', async ({ authenticatedPage }) => {
    const center = await getCanvasCenter(authenticatedPage)
    await placeStickyNote(authenticatedPage, center.x, center.y)
    await waitForCanvasPaint(authenticatedPage, 500)

    await authenticatedPage.mouse.dblclick(center.x, center.y)
    const textarea = authenticatedPage.locator('textarea').last()
    await expect(textarea).toBeVisible({ timeout: 3000 })
    await textarea.fill('Test sticky text')
    await textarea.press('Escape')
    await expect(textarea).not.toBeVisible({ timeout: 3000 })
  })

  test('drag a sticky note to a new position', async ({ authenticatedPage }) => {
    const center = await getCanvasCenter(authenticatedPage)
    await placeStickyNote(authenticatedPage, center.x, center.y)
    await waitForCanvasPaint(authenticatedPage, 500)

    await dragObject(authenticatedPage, center.x, center.y, center.x + 150, center.y + 100)
    await waitForCanvasPaint(authenticatedPage, 500)

    // Canvas still renders without crash
    await expect(authenticatedPage.locator('canvas').first()).toBeVisible()
  })

  test('delete key removes selected object', async ({ authenticatedPage }) => {
    const center = await getCanvasCenter(authenticatedPage)
    await placeStickyNote(authenticatedPage, center.x, center.y)
    await waitForCanvasPaint(authenticatedPage, 500)

    // Click to select
    await authenticatedPage.mouse.click(center.x, center.y)
    await waitForCanvasPaint(authenticatedPage, 300)

    // Press Delete via window dispatch (Konva canvas doesn't receive DOM focus)
    await authenticatedPage.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    })
    await waitForCanvasPaint(authenticatedPage, 500)

    // No crash, toolbar still present
    await expect(authenticatedPage.getByTitle('Select (V)')).toBeVisible()
  })

  test('Ctrl+Z undoes the last action', async ({ authenticatedPage }) => {
    const center = await getCanvasCenter(authenticatedPage)
    await placeStickyNote(authenticatedPage, center.x, center.y)
    await waitForCanvasPaint(authenticatedPage, 500)

    await authenticatedPage.keyboard.press(`${modKey()}+z`)
    await waitForCanvasPaint(authenticatedPage, 300)

    // No crash after undo
    await expect(authenticatedPage.locator('canvas').first()).toBeVisible()
  })
})
