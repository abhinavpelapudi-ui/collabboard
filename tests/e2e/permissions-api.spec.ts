/**
 * Permissions API Tests
 * Tests server-side enforcement of owner / editor / viewer roles.
 * These use only the `request` fixture — no browser required.
 */
import { test, expect } from '@playwright/test'
import { registerUser } from '../helpers/auth.helper'
import {
  createBoardViaAPI,
  inviteMemberViaAPI,
  getBoardMembersViaAPI,
} from '../helpers/board.helper'

const SERVER = 'http://localhost:3001'

function auth(token: string) {
  return { Authorization: `Bearer ${token}` }
}

test.describe('Permissions — API', () => {

  // ─── Board creation ──────────────────────────────────────────────────────

  test('created board returns owner role', async ({ request }) => {
    const owner = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token, 'Owner Role Board')
    expect(board.role).toBe('owner')
  })

  test('GET /api/boards includes role field for each board', async ({ request }) => {
    const owner = await registerUser(request)
    await createBoardViaAPI(request, owner.token, 'Role List Board')

    const res = await request.get(`${SERVER}/api/boards`, { headers: auth(owner.token) })
    expect(res.ok()).toBeTruthy()
    const boards = await res.json()
    expect(boards.length).toBeGreaterThan(0)
    // Every board should have a role field
    for (const b of boards) {
      expect(['owner', 'editor', 'viewer']).toContain(b.role)
    }
  })

  test('GET /api/boards/:id returns the user role', async ({ request }) => {
    const owner = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    const res = await request.get(`${SERVER}/api/boards/${board.id}`, { headers: auth(owner.token) })
    const data = await res.json()
    expect(data.role).toBe('owner')
  })

  test('unauthenticated request returns 401', async ({ request }) => {
    const owner = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    const res = await request.get(`${SERVER}/api/boards/${board.id}`)
    expect(res.status()).toBe(401)
  })

  // ─── Access control ───────────────────────────────────────────────────────

  test('user without access cannot GET board (404)', async ({ request }) => {
    const owner = await registerUser(request)
    const stranger = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    const res = await request.get(`${SERVER}/api/boards/${board.id}`, { headers: auth(stranger.token) })
    expect(res.status()).toBe(404)
  })

  test('invited viewer can GET the board and sees viewer role', async ({ request }) => {
    const owner = await registerUser(request)
    const viewer = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, viewer.email, 'viewer')

    const res = await request.get(`${SERVER}/api/boards/${board.id}`, { headers: auth(viewer.token) })
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.role).toBe('viewer')
  })

  test('invited editor can GET the board and sees editor role', async ({ request }) => {
    const owner = await registerUser(request)
    const editor = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, editor.email, 'editor')

    const res = await request.get(`${SERVER}/api/boards/${board.id}`, { headers: auth(editor.token) })
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.role).toBe('editor')
  })

  test('invited board appears in shared user\'s board list', async ({ request }) => {
    const owner = await registerUser(request)
    const editor = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token, 'Shared Board')

    await inviteMemberViaAPI(request, owner.token, board.id, editor.email, 'editor')

    const res = await request.get(`${SERVER}/api/boards`, { headers: auth(editor.token) })
    const boards = await res.json()
    const found = boards.find((b: any) => b.id === board.id)
    expect(found).toBeTruthy()
    expect(found.role).toBe('editor')
  })

  // ─── Invite members ───────────────────────────────────────────────────────

  test('owner can invite editor', async ({ request }) => {
    const owner = await registerUser(request)
    const editor = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    const res = await request.post(`${SERVER}/api/boards/${board.id}/members`, {
      data: { email: editor.email, role: 'editor' },
      headers: auth(owner.token),
    })
    expect(res.status()).toBe(201)
    const data = await res.json()
    expect(data.role).toBe('editor')
    expect(data.email).toBe(editor.email)
  })

  test('owner can invite viewer', async ({ request }) => {
    const owner = await registerUser(request)
    const viewer = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    const res = await request.post(`${SERVER}/api/boards/${board.id}/members`, {
      data: { email: viewer.email, role: 'viewer' },
      headers: auth(owner.token),
    })
    expect(res.status()).toBe(201)
    const data = await res.json()
    expect(data.role).toBe('viewer')
  })

  test('editor cannot invite other members (403)', async ({ request }) => {
    const owner = await registerUser(request)
    const editor = await registerUser(request)
    const stranger = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, editor.email, 'editor')

    const res = await request.post(`${SERVER}/api/boards/${board.id}/members`, {
      data: { email: stranger.email, role: 'editor' },
      headers: auth(editor.token),
    })
    expect(res.status()).toBe(403)
  })

  test('inviting unknown email returns 404', async ({ request }) => {
    const owner = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    const res = await request.post(`${SERVER}/api/boards/${board.id}/members`, {
      data: { email: 'nobody_ever@example.com', role: 'editor' },
      headers: auth(owner.token),
    })
    expect(res.status()).toBe(404)
  })

  test('inviting an already-invited user updates their role (upsert)', async ({ request }) => {
    const owner = await registerUser(request)
    const user = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, user.email, 'editor')
    const res2 = await request.post(`${SERVER}/api/boards/${board.id}/members`, {
      data: { email: user.email, role: 'viewer' },
      headers: auth(owner.token),
    })
    expect(res2.status()).toBe(201)
    const data = await res2.json()
    expect(data.role).toBe('viewer')
  })

  // ─── List members ─────────────────────────────────────────────────────────

  test('GET members includes the owner', async ({ request }) => {
    const owner = await registerUser(request, { name: 'Molly Owner' })
    const board = await createBoardViaAPI(request, owner.token)

    const members = await getBoardMembersViaAPI(request, owner.token, board.id)
    const ownerEntry = members.find(m => m.role === 'owner')
    expect(ownerEntry).toBeTruthy()
    expect(ownerEntry!.email).toBe(owner.email)
  })

  test('GET members lists all invited users', async ({ request }) => {
    const owner = await registerUser(request)
    const editor = await registerUser(request)
    const viewer = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, editor.email, 'editor')
    await inviteMemberViaAPI(request, owner.token, board.id, viewer.email, 'viewer')

    const members = await getBoardMembersViaAPI(request, owner.token, board.id)
    expect(members.length).toBe(3) // owner + editor + viewer

    const roles = members.map(m => m.role).sort()
    expect(roles).toEqual(['editor', 'owner', 'viewer'])
  })

  test('viewer can list members', async ({ request }) => {
    const owner = await registerUser(request)
    const viewer = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, viewer.email, 'viewer')

    const res = await request.get(`${SERVER}/api/boards/${board.id}/members`, {
      headers: auth(viewer.token),
    })
    expect(res.ok()).toBeTruthy()
  })

  test('non-member cannot list members (404)', async ({ request }) => {
    const owner = await registerUser(request)
    const stranger = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    const res = await request.get(`${SERVER}/api/boards/${board.id}/members`, {
      headers: auth(stranger.token),
    })
    expect(res.status()).toBe(404)
  })

  // ─── Change role ──────────────────────────────────────────────────────────

  test('owner can change member role (editor → viewer)', async ({ request }) => {
    const owner = await registerUser(request)
    const member = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, member.email, 'editor')

    const res = await request.patch(`${SERVER}/api/boards/${board.id}/members/${member.userId}`, {
      data: { role: 'viewer' },
      headers: auth(owner.token),
    })
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.role).toBe('viewer')
  })

  test('editor cannot change other member roles (403)', async ({ request }) => {
    const owner = await registerUser(request)
    const editor = await registerUser(request)
    const viewer = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, editor.email, 'editor')
    await inviteMemberViaAPI(request, owner.token, board.id, viewer.email, 'viewer')

    const res = await request.patch(`${SERVER}/api/boards/${board.id}/members/${viewer.userId}`, {
      data: { role: 'editor' },
      headers: auth(editor.token),
    })
    expect(res.status()).toBe(403)
  })

  // ─── Remove member ────────────────────────────────────────────────────────

  test('owner can remove a member', async ({ request }) => {
    const owner = await registerUser(request)
    const editor = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, editor.email, 'editor')

    const res = await request.delete(`${SERVER}/api/boards/${board.id}/members/${editor.userId}`, {
      headers: auth(owner.token),
    })
    expect(res.status()).toBe(204)

    // Removed user should no longer see the board
    const boardRes = await request.get(`${SERVER}/api/boards/${board.id}`, {
      headers: auth(editor.token),
    })
    expect(boardRes.status()).toBe(404)
  })

  test('editor cannot remove members (403)', async ({ request }) => {
    const owner = await registerUser(request)
    const editor = await registerUser(request)
    const viewer = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, editor.email, 'editor')
    await inviteMemberViaAPI(request, owner.token, board.id, viewer.email, 'viewer')

    const res = await request.delete(`${SERVER}/api/boards/${board.id}/members/${viewer.userId}`, {
      headers: auth(editor.token),
    })
    expect(res.status()).toBe(403)
  })

  // ─── Rename board ─────────────────────────────────────────────────────────

  test('owner can rename board', async ({ request }) => {
    const owner = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token, 'Original Title')

    const res = await request.patch(`${SERVER}/api/boards/${board.id}`, {
      data: { title: 'Renamed Title' },
      headers: auth(owner.token),
    })
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.title).toBe('Renamed Title')
  })

  test('editor can rename board', async ({ request }) => {
    const owner = await registerUser(request)
    const editor = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token, 'Editor Rename Test')

    await inviteMemberViaAPI(request, owner.token, board.id, editor.email, 'editor')

    const res = await request.patch(`${SERVER}/api/boards/${board.id}`, {
      data: { title: 'Renamed By Editor' },
      headers: auth(editor.token),
    })
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.title).toBe('Renamed By Editor')
  })

  test('viewer cannot rename board (403)', async ({ request }) => {
    const owner = await registerUser(request)
    const viewer = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, viewer.email, 'viewer')

    const res = await request.patch(`${SERVER}/api/boards/${board.id}`, {
      data: { title: 'Should Fail' },
      headers: auth(viewer.token),
    })
    expect(res.status()).toBe(403)
  })

  // ─── Delete board ─────────────────────────────────────────────────────────

  test('editor cannot delete board (403)', async ({ request }) => {
    const owner = await registerUser(request)
    const editor = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, editor.email, 'editor')

    const res = await request.delete(`${SERVER}/api/boards/${board.id}`, {
      headers: auth(editor.token),
    })
    expect(res.status()).toBe(403)
  })

  test('viewer cannot delete board (403)', async ({ request }) => {
    const owner = await registerUser(request)
    const viewer = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    await inviteMemberViaAPI(request, owner.token, board.id, viewer.email, 'viewer')

    const res = await request.delete(`${SERVER}/api/boards/${board.id}`, {
      headers: auth(viewer.token),
    })
    expect(res.status()).toBe(403)
  })

  test('owner can delete board', async ({ request }) => {
    const owner = await registerUser(request)
    const board = await createBoardViaAPI(request, owner.token)

    const res = await request.delete(`${SERVER}/api/boards/${board.id}`, {
      headers: auth(owner.token),
    })
    expect(res.status()).toBe(204)
  })
})
