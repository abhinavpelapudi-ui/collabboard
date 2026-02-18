import { Hono } from 'hono'
import { pool } from '../db'
import { requireAuth, AuthVariables } from '../middleware/auth'
import { z } from 'zod'
import { BoardRole } from '@collabboard/shared'

const boards = new Hono<{ Variables: AuthVariables }>()

// ─── Permission helper ────────────────────────────────────────────────────────

export async function getUserRole(boardId: string, userId: string): Promise<BoardRole | null> {
  const { rows } = await pool.query(
    `SELECT
       CASE WHEN b.owner_id = $2 THEN 'owner' ELSE bm.role END AS role
     FROM boards b
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $2
     WHERE b.id = $1 AND (b.owner_id = $2 OR bm.user_id = $2)`,
    [boardId, userId]
  )
  return (rows[0]?.role as BoardRole) ?? null
}

// ─── GET /api/boards — list boards for the current user ──────────────────────

boards.get('/', requireAuth, async (c) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*,
        (SELECT COUNT(*) FROM objects WHERE board_id = b.id) as object_count,
        CASE WHEN b.owner_id = $1 THEN 'owner' ELSE bm.role END AS role
       FROM boards b
       LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $1
       WHERE b.owner_id = $1 OR bm.user_id = $1
       ORDER BY b.created_at DESC`,
      [c.get('userId')]
    )
    return c.json(rows)
  } catch {
    return c.json({ error: 'Failed to fetch boards' }, 500)
  }
})

// ─── POST /api/boards — create a new board ───────────────────────────────────

const FREE_BOARD_LIMIT = 2

boards.post('/', requireAuth, async (c) => {
  const body = await c.req.json()
  const schema = z.object({ title: z.string().min(1).max(100).default('Untitled Board') })
  const { title } = schema.parse(body)

  try {
    await pool.query(
      `INSERT INTO users (id, name, email) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = $2`,
      [c.get('userId'), c.get('userName'), c.get('userEmail')]
    )

    // Enforce free-plan board limit
    const { rows: limitRows } = await pool.query(
      `SELECT u.plan,
              (SELECT COUNT(*) FROM boards WHERE owner_id = $1) AS board_count
       FROM users u WHERE u.id = $1`,
      [c.get('userId')]
    )
    const boardCount = Number(limitRows[0]?.board_count ?? 0)
    const plan = limitRows[0]?.plan ?? 'free'
    if (plan === 'free' && boardCount >= FREE_BOARD_LIMIT) {
      return c.json({ error: 'Free plan limit reached. Upgrade to create more boards.', upgradeRequired: true }, 403)
    }

    const { rows } = await pool.query(
      `INSERT INTO boards (title, owner_id) VALUES ($1, $2) RETURNING *`,
      [title, c.get('userId')]
    )
    const board = rows[0]

    // Insert creator as owner in board_members
    await pool.query(
      `INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'owner')
       ON CONFLICT (board_id, user_id) DO NOTHING`,
      [board.id, c.get('userId')]
    )

    return c.json({ ...board, role: 'owner' }, 201)
  } catch {
    return c.json({ error: 'Failed to create board' }, 500)
  }
})

// ─── GET /api/boards/:id — get a single board ────────────────────────────────

boards.get('/:id', requireAuth, async (c) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*,
         CASE WHEN b.owner_id = $2 THEN 'owner' ELSE bm.role END AS role
       FROM boards b
       LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $2
       WHERE b.id = $1 AND (b.owner_id = $2 OR bm.user_id = $2)`,
      [c.req.param('id'), c.get('userId')]
    )
    if (!rows[0]) return c.json({ error: 'Board not found' }, 404)
    return c.json(rows[0])
  } catch {
    return c.json({ error: 'Failed to fetch board' }, 500)
  }
})

// ─── PATCH /api/boards/:id — rename (owner or editor) ───────────────────────

boards.patch('/:id', requireAuth, async (c) => {
  const body = await c.req.json()
  const schema = z.object({ title: z.string().min(1).max(100) })
  const { title } = schema.parse(body)

  try {
    const role = await getUserRole(c.req.param('id'), c.get('userId'))
    if (!role || role === 'viewer') return c.json({ error: 'Not authorized' }, 403)

    const { rows } = await pool.query(
      `UPDATE boards SET title = $1 WHERE id = $2 RETURNING *`,
      [title, c.req.param('id')]
    )
    if (!rows[0]) return c.json({ error: 'Board not found' }, 404)
    return c.json(rows[0])
  } catch {
    return c.json({ error: 'Failed to rename board' }, 500)
  }
})

// ─── DELETE /api/boards/:id — owner only ─────────────────────────────────────

boards.delete('/:id', requireAuth, async (c) => {
  try {
    const role = await getUserRole(c.req.param('id'), c.get('userId'))
    if (role !== 'owner') return c.json({ error: 'Not authorized' }, 403)

    await pool.query(`DELETE FROM boards WHERE id = $1`, [c.req.param('id')])
    return new Response(null, { status: 204 })
  } catch {
    return c.json({ error: 'Failed to delete board' }, 500)
  }
})

export default boards
