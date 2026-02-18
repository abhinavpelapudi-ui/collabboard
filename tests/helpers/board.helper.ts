import { APIRequestContext } from '@playwright/test'

const SERVER_URL = 'http://localhost:3001'

export async function createBoardViaAPI(
  request: APIRequestContext,
  token: string,
  title = 'Test Board'
): Promise<{ id: string; title: string; role?: string }> {
  const response = await request.post(`${SERVER_URL}/api/boards`, {
    data: { title },
    headers: { Authorization: `Bearer ${token}` },
  })
  return response.json()
}

export async function deleteBoardViaAPI(
  request: APIRequestContext,
  token: string,
  boardId: string
): Promise<void> {
  await request.delete(`${SERVER_URL}/api/boards/${boardId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function inviteMemberViaAPI(
  request: APIRequestContext,
  token: string,
  boardId: string,
  email: string,
  role: 'editor' | 'viewer'
): Promise<{ user_id: string; name: string; email: string; role: string }> {
  const response = await request.post(`${SERVER_URL}/api/boards/${boardId}/members`, {
    data: { email, role },
    headers: { Authorization: `Bearer ${token}` },
  })
  return response.json()
}

export async function getBoardMembersViaAPI(
  request: APIRequestContext,
  token: string,
  boardId: string
): Promise<Array<{ user_id: string; name: string; email: string; role: string }>> {
  const response = await request.get(`${SERVER_URL}/api/boards/${boardId}/members`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return response.json()
}
