import { Hono } from 'hono'
import { pool } from '../db'
import { requireAuth, AuthVariables } from '../middleware/auth'
import { notifyUser } from '../sockets/socketServer'
import { z } from 'zod'

const projects = new Hono<{ Variables: AuthVariables }>()

// ─── Helper: get user's role in a project ────────────────────────────────────

async function getProjectRole(projectId: string, userId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT
       CASE WHEN p.owner_id = $2 THEN 'owner' ELSE pm.role END AS role
     FROM projects p
     LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
     WHERE p.id = $1 AND (p.owner_id = $2 OR pm.user_id = $2)`,
    [projectId, userId]
  )
  return rows[0]?.role ?? null
}

// ─── GET /api/projects — list projects for current user ──────────────────────

projects.get('/', requireAuth, async (c) => {
  const userId = c.get('userId')
  const workspaceId = c.req.query('workspaceId')

  let query = `
    SELECT p.*,
      CASE WHEN p.owner_id = $1 THEN 'owner' ELSE pm.role END AS role,
      (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) AS member_count,
      (SELECT COUNT(*) FROM boards WHERE project_id = p.id) AS board_count
    FROM projects p
    LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
    WHERE p.owner_id = $1 OR pm.user_id = $1`

  const params: unknown[] = [userId]

  if (workspaceId) {
    params.push(workspaceId)
    query += ` AND p.workspace_id = $${params.length}`
  }

  query += ` ORDER BY p.created_at DESC`

  const { rows } = await pool.query(query, params)
  return c.json(rows)
})

// ─── POST /api/projects — create project ─────────────────────────────────────

projects.post('/', requireAuth, async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json()
  const schema = z.object({
    name: z.string().min(1).max(100),
    workspaceId: z.string().uuid(),
    description: z.string().max(2000).optional().default(''),
    industry: z.string().max(50).optional().default(''),
    color: z.string().max(20).optional().default('#6366f1'),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    metadata: z.record(z.unknown()).optional().default({}),
  })
  const { name, workspaceId, description, industry, color, startDate, endDate, metadata } = schema.parse(body)

  // Verify user has editor/owner access to the workspace
  const { rows: wsRows } = await pool.query(
    `SELECT CASE WHEN w.owner_id = $2 THEN 'owner' ELSE wm.role END AS role
     FROM workspaces w
     LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $2
     WHERE w.id = $1 AND (w.owner_id = $2 OR wm.user_id = $2)`,
    [workspaceId, userId]
  )
  const wsRole = wsRows[0]?.role
  if (!wsRole || wsRole === 'viewer') {
    return c.json({ error: 'Not authorized to create projects in this workspace' }, 403)
  }

  const { rows } = await pool.query(
    `INSERT INTO projects (name, workspace_id, description, industry, color, start_date, end_date, owner_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [name, workspaceId, description, industry, color, startDate || null, endDate || null, userId, JSON.stringify(metadata)]
  )
  const project = rows[0]

  // Add creator as owner in project_members
  await pool.query(
    `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')
     ON CONFLICT DO NOTHING`,
    [project.id, userId]
  )

  return c.json({ ...project, role: 'owner', member_count: 1, board_count: 0 }, 201)
})

// ─── GET /api/projects/:id — get single project with stats ──────────────────

projects.get('/:id', requireAuth, async (c) => {
  const projectId = c.req.param('id')
  const userId = c.get('userId')

  const { rows } = await pool.query(
    `SELECT p.*,
       CASE WHEN p.owner_id = $2 THEN 'owner' ELSE pm.role END AS role,
       (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) AS member_count,
       (SELECT COUNT(*) FROM boards WHERE project_id = p.id) AS board_count
     FROM projects p
     LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
     WHERE p.id = $1 AND (p.owner_id = $2 OR pm.user_id = $2)`,
    [projectId, userId]
  )
  if (!rows[0]) return c.json({ error: 'Project not found' }, 404)
  return c.json(rows[0])
})

// ─── GET /api/projects/:id/stats — aggregate task stats across boards ────────

projects.get('/:id/stats', requireAuth, async (c) => {
  const projectId = c.req.param('id')
  const userId = c.get('userId')

  const role = await getProjectRole(projectId, userId)
  if (!role) return c.json({ error: 'Project not found' }, 404)

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_objects,
       COUNT(*) FILTER (WHERE o.props->>'status' = 'done')::int AS done_count,
       COUNT(*) FILTER (WHERE o.props->>'status' = 'in_progress')::int AS in_progress_count,
       COUNT(*) FILTER (WHERE o.props->>'status' = 'todo')::int AS todo_count,
       COUNT(*) FILTER (WHERE o.props->>'status' = 'review')::int AS review_count,
       COUNT(*) FILTER (WHERE o.props->>'assigned_to' IS NOT NULL AND o.props->>'assigned_to' != '')::int AS assigned_count
     FROM objects o
     JOIN boards b ON b.id = o.board_id
     WHERE b.project_id = $1`,
    [projectId]
  )

  // Get unique assignees
  const { rows: assigneeRows } = await pool.query(
    `SELECT DISTINCT o.props->>'assigned_to' AS assignee
     FROM objects o
     JOIN boards b ON b.id = o.board_id
     WHERE b.project_id = $1
       AND o.props->>'assigned_to' IS NOT NULL
       AND o.props->>'assigned_to' != ''`,
    [projectId]
  )

  // Get tasks with due dates for timeline
  const { rows: taskRows } = await pool.query(
    `SELECT o.id, o.board_id, b.title AS board_title, o.type,
       o.props->>'text' AS text, o.props->>'title' AS title,
       o.props->>'status' AS status, o.props->>'assigned_to' AS assigned_to,
       o.props->>'due_date' AS due_date, o.props->>'priority' AS priority
     FROM objects o
     JOIN boards b ON b.id = o.board_id
     WHERE b.project_id = $1
       AND (o.props->>'assigned_to' IS NOT NULL OR o.props->>'due_date' IS NOT NULL OR o.props->>'status' IS NOT NULL)
     ORDER BY o.props->>'due_date' NULLS LAST, o.updated_at DESC
     LIMIT 200`,
    [projectId]
  )

  return c.json({
    ...rows[0],
    assignees: assigneeRows.map(r => r.assignee),
    tasks: taskRows,
  })
})

// ─── PATCH /api/projects/:id — update project ──────────────────────────────

projects.patch('/:id', requireAuth, async (c) => {
  const projectId = c.req.param('id')
  const userId = c.get('userId')
  const role = await getProjectRole(projectId, userId)
  if (!role || role === 'viewer') return c.json({ error: 'Not authorized' }, 403)

  const body = await c.req.json()
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(2000).optional(),
    status: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
    industry: z.string().max(50).optional(),
    color: z.string().max(20).optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  const parsed = schema.parse(body)

  const updates: string[] = []
  const params: unknown[] = []
  let i = 1

  if (parsed.name !== undefined) { updates.push(`name = $${i++}`); params.push(parsed.name) }
  if (parsed.description !== undefined) { updates.push(`description = $${i++}`); params.push(parsed.description) }
  if (parsed.status !== undefined) { updates.push(`status = $${i++}`); params.push(parsed.status) }
  if (parsed.industry !== undefined) { updates.push(`industry = $${i++}`); params.push(parsed.industry) }
  if (parsed.color !== undefined) { updates.push(`color = $${i++}`); params.push(parsed.color) }
  if ('startDate' in parsed) { updates.push(`start_date = $${i++}`); params.push(parsed.startDate || null) }
  if ('endDate' in parsed) { updates.push(`end_date = $${i++}`); params.push(parsed.endDate || null) }
  if (parsed.metadata !== undefined) { updates.push(`metadata = $${i++}`); params.push(JSON.stringify(parsed.metadata)) }

  if (!updates.length) return c.json({ error: 'Nothing to update' }, 400)

  params.push(projectId)
  const { rows } = await pool.query(
    `UPDATE projects SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
    params
  )
  if (!rows[0]) return c.json({ error: 'Project not found' }, 404)
  return c.json(rows[0])
})

// ─── DELETE /api/projects/:id — owner only ───────────────────────────────────

projects.delete('/:id', requireAuth, async (c) => {
  const projectId = c.req.param('id')
  const userId = c.get('userId')
  const role = await getProjectRole(projectId, userId)
  if (role !== 'owner') return c.json({ error: 'Only the owner can delete this project' }, 403)

  await pool.query(`DELETE FROM projects WHERE id = $1`, [projectId])
  return new Response(null, { status: 204 })
})

// ─── GET /api/projects/:id/members ───────────────────────────────────────────

projects.get('/:id/members', requireAuth, async (c) => {
  const projectId = c.req.param('id')
  const userId = c.get('userId')
  const role = await getProjectRole(projectId, userId)
  if (!role) return c.json({ error: 'Project not found' }, 404)

  const { rows } = await pool.query(
    `SELECT pm.user_id, pm.role, u.name, u.email
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1
     ORDER BY CASE pm.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, u.name`,
    [projectId]
  )
  return c.json(rows)
})

// ─── POST /api/projects/:id/members — invite by email (owner only) ──────────

projects.post('/:id/members', requireAuth, async (c) => {
  const projectId = c.req.param('id')
  const userId = c.get('userId')
  const role = await getProjectRole(projectId, userId)
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
    `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3`,
    [projectId, target.id, newRole]
  )

  // Notify the invited user
  const { rows: pRows } = await pool.query(
    `SELECT p.name, u.name AS inviter_name
     FROM projects p JOIN users u ON u.id = $2 WHERE p.id = $1`,
    [projectId, userId]
  )
  const projectName = pRows[0]?.name ?? 'a project'
  const inviterName = pRows[0]?.inviter_name ?? 'Someone'

  const { rows: notifRows } = await pool.query(
    `INSERT INTO notifications (user_id, type, data)
     VALUES ($1, 'project_shared', $2) RETURNING id, type, data, read_at, created_at`,
    [target.id, JSON.stringify({ projectId, projectName, sharedBy: inviterName, role: newRole })]
  )
  notifyUser(target.id, 'notification:new', notifRows[0])

  return c.json({ user_id: target.id, name: target.name, email: target.email, role: newRole }, 201)
})

// ─── PATCH /api/projects/:id/members/:userId — change role (owner only) ─────

projects.patch('/:id/members/:userId', requireAuth, async (c) => {
  const projectId = c.req.param('id')
  const requesterId = c.get('userId')
  const targetUserId = c.req.param('userId')

  const role = await getProjectRole(projectId, requesterId)
  if (role !== 'owner') return c.json({ error: 'Only the owner can change roles' }, 403)
  if (targetUserId === requesterId) return c.json({ error: 'Cannot change your own role' }, 400)

  const body = await c.req.json()
  const schema = z.object({ role: z.enum(['editor', 'viewer']) })
  const { role: newRole } = schema.parse(body)

  const { rowCount } = await pool.query(
    `UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3`,
    [newRole, projectId, targetUserId]
  )
  if (!rowCount) return c.json({ error: 'Member not found' }, 404)
  return c.json({ user_id: targetUserId, role: newRole })
})

// ─── DELETE /api/projects/:id/members/:userId — remove member (owner only) ──

projects.delete('/:id/members/:userId', requireAuth, async (c) => {
  const projectId = c.req.param('id')
  const requesterId = c.get('userId')
  const targetUserId = c.req.param('userId')

  const role = await getProjectRole(projectId, requesterId)
  if (role !== 'owner') return c.json({ error: 'Only the owner can remove members' }, 403)
  if (targetUserId === requesterId) return c.json({ error: 'Cannot remove yourself' }, 400)

  await pool.query(
    `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2 AND role != 'owner'`,
    [projectId, targetUserId]
  )
  return new Response(null, { status: 204 })
})

export default projects
