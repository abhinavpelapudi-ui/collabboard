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
       CASE WHEN b.owner_id = $2 THEN 'owner'
            WHEN bm.user_id IS NOT NULL THEN bm.role
            WHEN pm.user_id IS NOT NULL THEN pm.role
            ELSE wm.role END AS role
     FROM boards b
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $2
     LEFT JOIN project_members pm ON pm.project_id = b.project_id AND pm.user_id = $2
     LEFT JOIN workspace_members wm ON wm.workspace_id = b.workspace_id AND wm.user_id = $2
     WHERE b.id = $1
       AND (b.owner_id = $2 OR bm.user_id = $2 OR pm.user_id = $2 OR wm.user_id = $2)`,
    [boardId, userId]
  )
  return (rows[0]?.role as BoardRole) ?? null
}

// ─── GET /api/boards — list boards for the current user ──────────────────────

boards.get('/', requireAuth, async (c) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (b.id) b.*,
         (SELECT COUNT(*) FROM objects WHERE board_id = b.id) AS object_count,
         CASE WHEN b.owner_id = $1 THEN 'owner'
              WHEN bm.user_id IS NOT NULL THEN bm.role
              WHEN pm.user_id IS NOT NULL THEN pm.role
              ELSE wm.role END AS role,
         (SELECT COALESCE(json_agg(c), '[]'::json) FROM (
           SELECT u.id AS user_id, u.name, u.email
           FROM board_members bm2
           JOIN users u ON u.id = bm2.user_id
           WHERE bm2.board_id = b.id
           ORDER BY CASE bm2.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, u.name
           LIMIT 5
         ) c) AS contributors
       FROM boards b
       LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $1
       LEFT JOIN project_members pm ON pm.project_id = b.project_id AND pm.user_id = $1
       LEFT JOIN workspace_members wm ON wm.workspace_id = b.workspace_id AND wm.user_id = $1
       WHERE b.owner_id = $1 OR bm.user_id = $1 OR pm.user_id = $1 OR wm.user_id = $1
       ORDER BY b.id, b.created_at DESC`,
      [c.get('userId')]
    )
    // Re-sort by created_at descending after DISTINCT ON
    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return c.json(rows)
  } catch (err) {
    console.error('Failed to fetch boards:', err)
    return c.json({ error: 'Failed to fetch boards' }, 500)
  }
})

// ─── POST /api/boards — create a new board ───────────────────────────────────

const FREE_BOARD_LIMIT = 2

boards.post('/', requireAuth, async (c) => {
  const body = await c.req.json()
  const schema = z.object({
    title: z.string().min(1).max(100).default('Untitled Board'),
    workspaceId: z.string().uuid().optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
  })
  const { title, workspaceId, projectId } = schema.parse(body)

  try {
    await pool.query(
      `INSERT INTO users (id, name, email) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = $2`,
      [c.get('userId'), c.get('userName'), c.get('userEmail')]
    )

    // Enforce free-plan board limit (owned boards only)
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

    // If a workspace is specified, verify user has editor/owner access
    if (workspaceId) {
      const { rows: wsRows } = await pool.query(
        `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, c.get('userId')]
      )
      const wsRole = wsRows[0]?.role
      if (!wsRole || wsRole === 'viewer') {
        return c.json({ error: 'Not authorized to create boards in this workspace' }, 403)
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO boards (title, owner_id, workspace_id, project_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [title, c.get('userId'), workspaceId ?? null, projectId ?? null]
    )
    const board = rows[0]

    await pool.query(
      `INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'owner')
       ON CONFLICT (board_id, user_id) DO NOTHING`,
      [board.id, c.get('userId')]
    )

    return c.json({ ...board, role: 'owner' }, 201)
  } catch (err) {
    console.error('Failed to create board:', err)
    return c.json({ error: 'Failed to create board' }, 500)
  }
})

// ─── GET /api/boards/:id/chat — fetch recent chat history ────────────────────

boards.get('/:id/chat', requireAuth, async (c) => {
  const boardId = c.req.param('id')
  const role = await getUserRole(boardId, c.get('userId'))
  if (!role) return c.json({ error: 'Board not found' }, 404)

  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, user_name, content, message_type, created_at
       FROM chat_messages
       WHERE board_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [boardId]
    )
    return c.json(rows.reverse())
  } catch (err) {
    console.error('Failed to fetch chat:', err)
    return c.json({ error: 'Failed to fetch chat' }, 500)
  }
})

// ─── GET /api/boards/:id — get a single board ────────────────────────────────

boards.get('/:id', requireAuth, async (c) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*,
         CASE WHEN b.owner_id = $2 THEN 'owner'
              WHEN bm.user_id IS NOT NULL THEN bm.role
              WHEN pm.user_id IS NOT NULL THEN pm.role
              ELSE wm.role END AS role
       FROM boards b
       LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $2
       LEFT JOIN project_members pm ON pm.project_id = b.project_id AND pm.user_id = $2
       LEFT JOIN workspace_members wm ON wm.workspace_id = b.workspace_id AND wm.user_id = $2
       WHERE b.id = $1
         AND (b.owner_id = $2 OR bm.user_id = $2 OR pm.user_id = $2 OR wm.user_id = $2)`,
      [c.req.param('id'), c.get('userId')]
    )
    if (!rows[0]) return c.json({ error: 'Board not found' }, 404)
    return c.json(rows[0])
  } catch (err) {
    console.error('Failed to fetch board:', err)
    return c.json({ error: 'Failed to fetch board' }, 500)
  }
})

// ─── PATCH /api/boards/:id — rename or move to workspace (owner or editor) ───

boards.patch('/:id', requireAuth, async (c) => {
  const body = await c.req.json()
  const schema = z.object({
    title: z.string().min(1).max(100).optional(),
    workspaceId: z.string().uuid().nullable().optional(),
    projectId: z.string().uuid().nullable().optional(),
  })
  const parsed = schema.parse(body)

  try {
    const role = await getUserRole(c.req.param('id'), c.get('userId'))
    if (!role || role === 'viewer') return c.json({ error: 'Not authorized' }, 403)

    // Moving to a workspace or project requires owner role
    if (('workspaceId' in parsed || 'projectId' in parsed) && role !== 'owner') {
      return c.json({ error: 'Only the board owner can move boards' }, 403)
    }

    const updates: string[] = []
    const params: unknown[] = []
    let i = 1

    if (parsed.title !== undefined) { updates.push(`title = $${i++}`); params.push(parsed.title) }
    if ('workspaceId' in parsed) { updates.push(`workspace_id = $${i++}`); params.push(parsed.workspaceId) }
    if ('projectId' in parsed) { updates.push(`project_id = $${i++}`); params.push(parsed.projectId) }

    if (!updates.length) return c.json({ error: 'Nothing to update' }, 400)

    params.push(c.req.param('id'))
    const { rows } = await pool.query(
      `UPDATE boards SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    )
    if (!rows[0]) return c.json({ error: 'Board not found' }, 404)
    return c.json(rows[0])
  } catch (err) {
    console.error('Failed to update board:', err)
    return c.json({ error: 'Failed to update board' }, 500)
  }
})

// ─── DELETE /api/boards/:id — owner only ─────────────────────────────────────

boards.delete('/:id', requireAuth, async (c) => {
  try {
    const role = await getUserRole(c.req.param('id'), c.get('userId'))
    if (role !== 'owner') return c.json({ error: 'Not authorized' }, 403)

    await pool.query(`DELETE FROM boards WHERE id = $1`, [c.req.param('id')])
    return new Response(null, { status: 204 })
  } catch (err) {
    console.error('Failed to delete board:', err)
    return c.json({ error: 'Failed to delete board' }, 500)
  }
})

export default boards
