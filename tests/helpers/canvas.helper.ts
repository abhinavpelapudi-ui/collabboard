import { Page, expect } from '@playwright/test'

export async function getCanvasCenter(page: Page): Promise<{ x: number; y: number }> {
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas not found')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

export async function clickToolbarButton(page: Page, toolName: 'select' | 'sticky' | 'rect' | 'pan'): Promise<void> {
  const titleMap = {
    select: 'Select (V)',
    pan:    'Pan (H)',
    sticky: 'Sticky (S)',
    rect:   'Rect (R)',
  }
  await page.getByTitle(titleMap[toolName]).click()
}

export async function placeStickyNote(page: Page, screenX: number, screenY: number): Promise<void> {
  await clickToolbarButton(page, 'sticky')
  await page.mouse.click(screenX, screenY)
}

export async function placeRect(page: Page, screenX: number, screenY: number): Promise<void> {
  await clickToolbarButton(page, 'rect')
  await page.mouse.click(screenX, screenY)
}

export async function editStickyNoteText(page: Page, centerX: number, centerY: number, text: string): Promise<void> {
  await page.mouse.dblclick(centerX, centerY)
  const textarea = page.locator('textarea').last()
  await expect(textarea).toBeVisible({ timeout: 3000 })
  await textarea.fill(text)
  await textarea.press('Escape')
}

export async function dragObject(page: Page, fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  const steps = 10
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      fromX + ((toX - fromX) * i) / steps,
      fromY + ((toY - fromY) * i) / steps,
    )
  }
  await page.mouse.up()
}

export async function waitForCanvasPaint(page: Page, ms = 500): Promise<void> {
  await page.waitForSelector('canvas', { state: 'visible', timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(Math.min(ms, 300))
}

export function modKey(): string {
  return process.platform === 'darwin' ? 'Meta' : 'Control'
}
