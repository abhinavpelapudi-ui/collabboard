import { Hono } from 'hono'
import { requireAuth, AuthVariables } from '../middleware/auth'
import { requireBoardAccess } from '../middleware/boardAuth'
import { pool } from '../db'
import { z } from 'zod'

const documents = new Hono<{ Variables: AuthVariables }>()

// GET /api/boards/:boardId/docs
documents.get('/boards/:boardId/docs', requireAuth, requireBoardAccess('viewer'), async (c) => {
  const boardId = c.req.param('boardId')

  const { rows } = await pool.query(
    `SELECT id, board_id, title, created_by, updated_at, created_at
     FROM board_documents WHERE board_id = $1
     ORDER BY updated_at DESC`,
    [boardId]
  )

  return c.json({ documents: rows })
})

// POST /api/boards/:boardId/docs
documents.post('/boards/:boardId/docs', requireAuth, requireBoardAccess('editor'), async (c) => {
  const boardId = c.req.param('boardId')
  const userId = c.get('userId')

  const body = await c.req.json().catch(() => ({}))
  const title = body?.title || 'Untitled'

  const { rows } = await pool.query(
    `INSERT INTO board_documents (board_id, title, content, created_by)
     VALUES ($1, $2, '{}', $3) RETURNING *`,
    [boardId, title, userId]
  )

  return c.json({ document: rows[0] }, 201)
})

// GET /api/boards/:boardId/docs/:docId
documents.get('/boards/:boardId/docs/:docId', requireAuth, requireBoardAccess('viewer'), async (c) => {
  const boardId = c.req.param('boardId')
  const docId = c.req.param('docId')

  const { rows } = await pool.query(
    `SELECT * FROM board_documents WHERE id = $1 AND board_id = $2`,
    [docId, boardId]
  )

  if (rows.length === 0) return c.json({ error: 'Document not found' }, 404)
  return c.json({ document: rows[0] })
})

// PATCH /api/boards/:boardId/docs/:docId
documents.patch('/boards/:boardId/docs/:docId', requireAuth, requireBoardAccess('editor'), async (c) => {
  const boardId = c.req.param('boardId')
  const docId = c.req.param('docId')

  const rawBody = await c.req.text()
  if (rawBody.length > 2_000_000) return c.json({ error: 'Content too large (max 2MB)' }, 413)
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  const schema = z.object({
    title: z.string().min(1).max(200).optional(),
    content: z.record(z.unknown()).optional(),
  })
  const { title, content } = schema.parse(body)

  const updates: string[] = []
  const values: any[] = []
  let idx = 1

  if (title !== undefined) {
    updates.push(`title = $${idx++}`)
    values.push(title)
  }
  if (content !== undefined) {
    updates.push(`content = $${idx++}`)
    values.push(JSON.stringify(content))
  }

  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400)

  updates.push(`updated_at = now()`)
  values.push(docId, boardId)

  const { rows } = await pool.query(
    `UPDATE board_documents SET ${updates.join(', ')} WHERE id = $${idx++} AND board_id = $${idx++} RETURNING *`,
    values
  )

  if (rows.length === 0) return c.json({ error: 'Document not found' }, 404)
  return c.json({ document: rows[0] })
})

// DELETE /api/boards/:boardId/docs/:docId
documents.delete('/boards/:boardId/docs/:docId', requireAuth, requireBoardAccess('owner'), async (c) => {
  const boardId = c.req.param('boardId')
  const docId = c.req.param('docId')

  await pool.query(
    `DELETE FROM board_documents WHERE id = $1 AND board_id = $2`,
    [docId, boardId]
  )

  return c.json({ success: true })
})

export default documents
