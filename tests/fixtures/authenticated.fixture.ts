import { test as base } from '@playwright/test'
import { registerUser, injectAuthIntoPage, TestUser } from '../helpers/auth.helper'
import { createBoardViaAPI } from '../helpers/board.helper'

type Fixtures = {
  user: TestUser
  boardId: string
  authenticatedPage: ReturnType<typeof base['page']>
}

export const test = base.extend<Fixtures>({
  user: async ({ request }, use) => {
    const user = await registerUser(request)
    await use(user)
  },

  authenticatedPage: async ({ page, user }, use) => {
    await page.goto('/sign-in')
    await injectAuthIntoPage(page, user)
    await page.goto('/dashboard')
    await page.waitForURL('**/dashboard')
    await use(page)
  },

  boardId: async ({ request, user }, use) => {
    const board = await createBoardViaAPI(request, user.token)
    await use(board.id)
  },
})

export { expect } from '@playwright/test'
