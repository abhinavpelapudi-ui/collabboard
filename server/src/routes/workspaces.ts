import { Hono } from 'hono'
import { pool } from '../db'
import { requireAuth, AuthVariables } from '../middleware/auth'
import { notifyUser } from '../sockets/socketServer'
import { z } from 'zod'

const workspaces = new Hono<{ Variables: AuthVariables }>()

// ─── Helper: verify workspace owner ──────────────────────────────────────────

async function getWorkspaceRole(workspaceId: string, userId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT
       CASE WHEN w.owner_id = $2 THEN 'owner' ELSE wm.role END AS role
     FROM workspaces w
     LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $2
     WHERE w.id = $1 AND (w.owner_id = $2 OR wm.user_id = $2)`,
    [workspaceId, userId]
  )
  return rows[0]?.role ?? null
}

// ─── GET /api/workspaces — list workspaces for current user ──────────────────

workspaces.get('/', requireAuth, async (c) => {
  const userId = c.get('userId')
  const { rows } = await pool.query(
    `SELECT w.*,
       CASE WHEN w.owner_id = $1 THEN 'owner' ELSE wm.role END AS role,
       (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id) AS member_count
     FROM workspaces w
     LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $1
     WHERE w.owner_id = $1 OR wm.user_id = $1
     ORDER BY w.created_at ASC`,
    [userId]
  )
  return c.json(rows)
})

// ─── POST /api/workspaces — create workspace ─────────────────────────────────

workspaces.post('/', requireAuth, async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json()
  const schema = z.object({ name: z.string().min(1).max(80) })
  const { name } = schema.parse(body)

  const { rows } = await pool.query(
    `INSERT INTO workspaces (name, owner_id) VALUES ($1, $2) RETURNING *`,
    [name, userId]
  )
  const workspace = rows[0]

  // Add creator as owner in workspace_members
  await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')
     ON CONFLICT DO NOTHING`,
    [workspace.id, userId]
  )

  return c.json({ ...workspace, role: 'owner', member_count: 1 }, 201)
})

// ─── PATCH /api/workspaces/:id — rename (owner only) ────────────────────────

workspaces.patch('/:id', requireAuth, async (c) => {
  const workspaceId = c.req.param('id')
  const userId = c.get('userId')
  const role = await getWorkspaceRole(workspaceId, userId)
  if (role !== 'owner') return c.json({ error: 'Only the owner can rename this workspace' }, 403)

  const body = await c.req.json()
  const schema = z.object({ name: z.string().min(1).max(80) })
  const { name } = schema.parse(body)

  const { rows } = await pool.query(
    `UPDATE workspaces SET name = $1 WHERE id = $2 RETURNING *`,
    [name, workspaceId]
  )
  return c.json(rows[0])
})

// ─── DELETE /api/workspaces/:id — delete (owner only) ────────────────────────
// boards.workspace_id is SET NULL on cascade; members are CASCADE deleted

workspaces.delete('/:id', requireAuth, async (c) => {
  const workspaceId = c.req.param('id')
  const userId = c.get('userId')
  const role = await getWorkspaceRole(workspaceId, userId)
  if (role !== 'owner') return c.json({ error: 'Only the owner can delete this workspace' }, 403)

  await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId])
  return new Response(null, { status: 204 })
})

// ─── GET /api/workspaces/:id/members ─────────────────────────────────────────

workspaces.get('/:id/members', requireAuth, async (c) => {
  const workspaceId = c.req.param('id')
  const userId = c.get('userId')
  const role = await getWorkspaceRole(workspaceId, userId)
  if (!role) return c.json({ error: 'Workspace not found' }, 404)

  const { rows } = await pool.query(
    `SELECT wm.user_id, wm.role, u.name, u.email
     FROM workspace_members wm
     JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = $1
     ORDER BY CASE wm.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, u.name`,
    [workspaceId]
  )
  return c.json(rows)
})

// ─── POST /api/workspaces/:id/members — invite by email (owner only) ─────────

workspaces.post('/:id/members', requireAuth, async (c) => {
  const workspaceId = c.req.param('id')
  const userId = c.get('userId')
  const role = await getWorkspaceRole(workspaceId, userId)
  if (role !== 'owner') return c.json({ error: 'Only the owner can invite members' }, 403)

  const body = await c.req.json()
  const schema = z.object({
    email: z.string().email(),
    role: z.enum(['editor', 'viewer']),
  })
  const { email, role: newRole } = schema.parse(body)

  const { rows: userRows } = await pool.query(
    `SELECT id, name, email FROM users WHERE email = $1`, [email]
  )
  if (!userRows[0]) return c.json({ error: 'No user found with that email' }, 404)
  const target = userRows[0]
  if (target.id === userId) return c.json({ error: 'You are already the owner' }, 400)

  await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = $3`,
    [workspaceId, target.id, newRole]
  )

  // Notify the invited user
  const { rows: wsRows } = await pool.query(
    `SELECT w.name, u.name AS inviter_name
     FROM workspaces w JOIN users u ON u.id = $2 WHERE w.id = $1`,
    [workspaceId, userId]
  )
  const wsName = wsRows[0]?.name ?? 'a workspace'
  const inviterName = wsRows[0]?.inviter_name ?? 'Someone'

  const { rows: notifRows } = await pool.query(
    `INSERT INTO notifications (user_id, type, data)
     VALUES ($1, 'workspace_shared', $2) RETURNING id, type, data, read_at, created_at`,
    [target.id, JSON.stringify({ workspaceId, workspaceName: wsName, sharedBy: inviterName, role: newRole })]
  )
  notifyUser(target.id, 'notification:new', notifRows[0])

  return c.json({ user_id: target.id, name: target.name, email: target.email, role: newRole }, 201)
})

// ─── PATCH /api/workspaces/:id/members/:userId — change role (owner only) ────

workspaces.patch('/:id/members/:userId', requireAuth, async (c) => {
  const workspaceId = c.req.param('id')
  const requesterId = c.get('userId')
  const targetUserId = c.req.param('userId')

  const role = await getWorkspaceRole(workspaceId, requesterId)
  if (role !== 'owner') return c.json({ error: 'Only the owner can change roles' }, 403)
  if (targetUserId === requesterId) return c.json({ error: 'Cannot change your own role' }, 400)

  const body = await c.req.json()
  const schema = z.object({ role: z.enum(['editor', 'viewer']) })
  const { role: newRole } = schema.parse(body)

  const { rowCount } = await pool.query(
    `UPDATE workspace_members SET role = $1 WHERE workspace_id = $2 AND user_id = $3`,
    [newRole, workspaceId, targetUserId]
  )
  if (!rowCount) return c.json({ error: 'Member not found' }, 404)
  return c.json({ user_id: targetUserId, role: newRole })
})

// ─── DELETE /api/workspaces/:id/members/:userId — remove member (owner only) ─

workspaces.delete('/:id/members/:userId', requireAuth, async (c) => {
  const workspaceId = c.req.param('id')
  const requesterId = c.get('userId')
  const targetUserId = c.req.param('userId')

  const role = await getWorkspaceRole(workspaceId, requesterId)
  if (role !== 'owner') return c.json({ error: 'Only the owner can remove members' }, 403)
  if (targetUserId === requesterId) return c.json({ error: 'Cannot remove yourself' }, 400)

  await pool.query(
    `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND role != 'owner'`,
    [workspaceId, targetUserId]
  )
  return new Response(null, { status: 204 })
})

export default workspaces
