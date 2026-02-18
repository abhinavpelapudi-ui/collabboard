import { Hono } from 'hono'
import { pool } from '../db'
import { requireAuth, AuthVariables } from '../middleware/auth'
import { getUserRole } from './boards'
import { notifyRoleChanged } from '../sockets/socketServer'
import { z } from 'zod'

const members = new Hono<{ Variables: AuthVariables }>()

// ─── GET /api/boards/:id/members — list members ───────────────────────────────

members.get('/', requireAuth, async (c) => {
  const boardId = c.req.param('id')!
  const userId = c.get('userId')

  const role = await getUserRole(boardId, userId)
  if (!role) return c.json({ error: 'Board not found' }, 404)

  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT bm.user_id, bm.role, u.name, u.email
       FROM board_members bm
       JOIN users u ON u.id = bm.user_id
       WHERE bm.board_id = $1
       UNION
       SELECT b.owner_id, 'owner', u.name, u.email
       FROM boards b JOIN users u ON u.id = b.owner_id
       WHERE b.id = $1
         AND b.owner_id NOT IN (SELECT user_id FROM board_members WHERE board_id = $1)
     ) AS m
     ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, name`,
    [boardId]
  )
  return c.json(rows)
})

// ─── POST /api/boards/:id/members — invite by email (owner only) ──────────────

members.post('/', requireAuth, async (c) => {
  const boardId = c.req.param('id')!
  const userId = c.get('userId')

  const role = await getUserRole(boardId, userId)
  if (role !== 'owner') return c.json({ error: 'Only the owner can invite members' }, 403)

  const body = await c.req.json()
  const schema = z.object({
    email: z.string().email(),
    role: z.enum(['editor', 'viewer']),
  })
  const { email, role: newRole } = schema.parse(body)

  // Look up user by email
  const { rows: userRows } = await pool.query(
    `SELECT id, name, email FROM users WHERE email = $1`,
    [email]
  )
  if (!userRows[0]) return c.json({ error: 'No user found with that email' }, 404)

  const targetUser = userRows[0]
  if (targetUser.id === userId) return c.json({ error: 'You are already the owner' }, 400)

  // Check free plan member limit (3 non-owner members max)
  const { rows: planRows } = await pool.query(
    `SELECT u.plan, (SELECT COUNT(*) FROM board_members WHERE board_id = $1) AS member_count
     FROM boards b JOIN users u ON u.id = b.owner_id
     WHERE b.id = $1`,
    [boardId]
  )
  const { plan, member_count } = planRows[0] ?? {}
  const isExisting = (await pool.query(
    `SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2`,
    [boardId, targetUser.id]
  )).rowCount! > 0

  if (!isExisting && plan === 'free' && Number(member_count) >= 3) {
    return c.json({ error: 'Free plan allows up to 3 shared members', memberLimitReached: true }, 403)
  }

  // Insert or update role
  await pool.query(
    `INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (board_id, user_id) DO UPDATE SET role = $3`,
    [boardId, targetUser.id, newRole]
  )

  return c.json({ user_id: targetUser.id, name: targetUser.name, email: targetUser.email, role: newRole }, 201)
})

// ─── PATCH /api/boards/:id/members/:userId — change role (owner only) ────────

members.patch('/:userId', requireAuth, async (c) => {
  const boardId = c.req.param('id')!
  const requesterId = c.get('userId')
  const targetUserId = c.req.param('userId')

  const role = await getUserRole(boardId, requesterId)
  if (role !== 'owner') return c.json({ error: 'Only the owner can change roles' }, 403)
  if (targetUserId === requesterId) return c.json({ error: 'Cannot change your own role' }, 400)

  const body = await c.req.json()
  const schema = z.object({ role: z.enum(['editor', 'viewer']) })
  const { role: newRole } = schema.parse(body)

  const { rowCount } = await pool.query(
    `UPDATE board_members SET role = $1 WHERE board_id = $2 AND user_id = $3`,
    [newRole, boardId, targetUserId]
  )
  if (!rowCount) return c.json({ error: 'Member not found' }, 404)

  notifyRoleChanged(targetUserId, boardId, newRole)

  return c.json({ user_id: targetUserId, role: newRole })
})

// ─── DELETE /api/boards/:id/members/:userId — remove member (owner only) ─────

members.delete('/:userId', requireAuth, async (c) => {
  const boardId = c.req.param('id')!
  const requesterId = c.get('userId')
  const targetUserId = c.req.param('userId')

  const role = await getUserRole(boardId, requesterId)
  if (role !== 'owner') return c.json({ error: 'Only the owner can remove members' }, 403)
  if (targetUserId === requesterId) return c.json({ error: 'Cannot remove yourself' }, 400)

  await pool.query(
    `DELETE FROM board_members WHERE board_id = $1 AND user_id = $2 AND role != 'owner'`,
    [boardId, targetUserId]
  )
  return new Response(null, { status: 204 })
})

export default members
