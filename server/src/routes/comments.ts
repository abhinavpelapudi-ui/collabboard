import { Hono } from 'hono'
import { requireAuth, AuthVariables } from '../middleware/auth'
import { requireBoardAccess } from '../middleware/boardAuth'
import { pool } from '../db'
import { z } from 'zod'

const comments = new Hono<{ Variables: AuthVariables }>()

// GET /api/boards/:boardId/objects/:objectId/comments
comments.get('/boards/:boardId/objects/:objectId/comments', requireAuth, requireBoardAccess('viewer'), async (c) => {
  const boardId = c.req.param('boardId')
  const objectId = c.req.param('objectId')

  const { rows } = await pool.query(
    `SELECT id, object_id, board_id, user_id, user_name, content, created_at
     FROM object_comments WHERE board_id = $1 AND object_id = $2
     ORDER BY created_at ASC`,
    [boardId, objectId]
  )

  return c.json({ comments: rows })
})

// POST /api/boards/:boardId/objects/:objectId/comments
comments.post('/boards/:boardId/objects/:objectId/comments', requireAuth, requireBoardAccess('editor'), async (c) => {
  const boardId = c.req.param('boardId')
  const objectId = c.req.param('objectId')
  const userId = c.get('userId')

  const body = await c.req.json()
  const { content } = z.object({ content: z.string().min(1).max(2000) }).parse(body)

  // Get user name
  const { rows: userRows } = await pool.query(`SELECT name FROM users WHERE id = $1`, [userId])
  const userName = userRows[0]?.name || 'Unknown'

  const { rows } = await pool.query(
    `INSERT INTO object_comments (object_id, board_id, user_id, user_name, content)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [objectId, boardId, userId, userName, content]
  )

  return c.json({ comment: rows[0] }, 201)
})

// GET /api/boards/:boardId/comments/counts — batch comment counts for all objects
comments.get('/boards/:boardId/comments/counts', requireAuth, requireBoardAccess('viewer'), async (c) => {
  const boardId = c.req.param('boardId')

  const { rows } = await pool.query(
    `SELECT object_id, COUNT(*)::int AS count
     FROM object_comments WHERE board_id = $1
     GROUP BY object_id`,
    [boardId]
  )

  const counts: Record<string, number> = {}
  for (const row of rows) {
    counts[row.object_id] = row.count
  }

  return c.json({ counts })
})

export default comments
