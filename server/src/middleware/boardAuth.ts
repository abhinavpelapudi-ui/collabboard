import { createMiddleware } from 'hono/factory'
import { pool } from '../db'
import type { AuthVariables } from './auth'

const ROLE_HIERARCHY: Record<string, number> = { viewer: 0, editor: 1, owner: 2 }

export function requireBoardAccess(minRole: 'viewer' | 'editor' | 'owner' = 'viewer') {
  return createMiddleware<{ Variables: AuthVariables & { boardRole: string } }>(async (c, next) => {
    const boardId = c.req.param('boardId') || c.req.param('id')
    const userId = c.get('userId')
    if (!boardId) return c.json({ error: 'boardId required' }, 400)

    const { rows } = await pool.query(
      `SELECT role FROM (
         SELECT bm.role FROM board_members bm WHERE bm.board_id = $1 AND bm.user_id = $2
         UNION ALL
         SELECT 'owner' AS role FROM boards WHERE id = $1 AND owner_id = $2
         UNION ALL
         SELECT pm.role FROM project_members pm JOIN boards b ON b.project_id = pm.project_id WHERE b.id = $1 AND pm.user_id = $2
         UNION ALL
         SELECT wm.role FROM workspace_members wm JOIN boards b ON b.workspace_id = wm.workspace_id WHERE b.id = $1 AND wm.user_id = $2
       ) roles LIMIT 1`,
      [boardId, userId]
    )

    const role = rows[0]?.role
    if (!role || (ROLE_HIERARCHY[role] ?? -1) < (ROLE_HIERARCHY[minRole] ?? 99)) {
      return c.json({ error: 'Access denied' }, 403)
    }

    c.set('boardRole' as any, role)
    return next()
  })
}
