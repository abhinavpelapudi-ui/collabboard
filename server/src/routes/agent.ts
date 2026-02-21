import { Hono } from 'hono'
import { requireAuth, AuthVariables } from '../middleware/auth'
import { pool } from '../db'
import { BoardObject } from '@collabboard/shared'
import { z } from 'zod'

const agent = new Hono<{ Variables: AuthVariables }>()

const PYTHON_AGENT_URL = process.env.PYTHON_AGENT_URL || 'http://localhost:8000'

// ─── Per-user rate limit (1 request per 3 seconds) ───────────────────────────
const lastRequestTime = new Map<string, number>()

// ─── POST /command — Forward to Python agent, resolve temp IDs, persist ──────
agent.post('/command', requireAuth, async (c) => {
  const body = await c.req.json()
  const schema = z.object({
    boardId: z.string().uuid(),
    command: z.string().min(1).max(2000),
    model: z.string().max(50).optional(),
  })
  const { boardId, command, model } = schema.parse(body)
  const userId = c.get('userId')

  // Rate limit
  const lastReq = lastRequestTime.get(userId) || 0
  if (Date.now() - lastReq < 3000) {
    return c.json({ error: 'Too many requests. Wait a moment.' }, 429)
  }
  lastRequestTime.set(userId, Date.now())

  // Fetch current board state
  const { rows: objects } = await pool.query(
    `SELECT id, type, props, z_index FROM objects WHERE board_id = $1 ORDER BY z_index`,
    [boardId]
  )
  const boardState = objects.map(o => ({ id: o.id, type: o.type, ...(o as any).props }))

  // Forward to Python agent
  let agentResult: any
  try {
    const resp = await fetch(`${PYTHON_AGENT_URL}/agent/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command,
        board_id: boardId,
        board_state: boardState,
        user_id: userId,
        model: model || '',
      }),
    })
    if (!resp.ok) {
      const errText = await resp.text()
      return c.json({ error: `Agent error: ${errText}` }, 502)
    }
    agentResult = await resp.json()
  } catch (err) {
    console.error('Python agent unreachable:', err)
    return c.json({ error: 'AI agent is unavailable. Try again later.' }, 503)
  }

  // Resolve temp IDs and persist actions
  const now = new Date().toISOString()
  const tempIdMap = new Map<string, string>()
  const createdObjects: BoardObject[] = []
  const updatedObjects: { objectId: string; props: Partial<BoardObject> }[] = []
  const deletedObjectIds: string[] = []

  const actions: any[] = agentResult.actions || []

  for (const action of actions) {
    if (action.action === 'create') {
      const realId = crypto.randomUUID()
      if (action.temp_id) tempIdMap.set(action.temp_id, realId)

      const props = { ...action.props }

      // Resolve connector temp_id references
      if (action.object_type === 'connector') {
        if (props.from_temp_id) {
          props.from_id = tempIdMap.get(props.from_temp_id) || props.from_temp_id
          delete props.from_temp_id
        }
        if (props.to_temp_id) {
          props.to_id = tempIdMap.get(props.to_temp_id) || props.to_temp_id
          delete props.to_temp_id
        }
      }

      const obj: any = {
        id: realId,
        board_id: boardId,
        type: action.object_type,
        x: props.x ?? 0,
        y: props.y ?? 0,
        width: props.width ?? 200,
        height: props.height ?? 200,
        rotation: props.rotation ?? 0,
        z_index: boardState.length + createdObjects.length,
        created_by: userId,
        updated_at: now,
        ...props,
      }

      await pool.query(
        `INSERT INTO objects (id, board_id, type, props, z_index, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
        [realId, boardId, action.object_type, JSON.stringify(obj), obj.z_index, userId]
      )
      createdObjects.push(obj)

    } else if (action.action === 'update' && action.object_id) {
      const props = action.props || {}
      await pool.query(
        `UPDATE objects SET props = props || $1::jsonb, updated_at = now() WHERE id = $2 AND board_id = $3`,
        [JSON.stringify(props), action.object_id, boardId]
      )
      updatedObjects.push({ objectId: action.object_id, props })

    } else if (action.action === 'delete' && action.object_id) {
      await pool.query(
        `DELETE FROM objects WHERE id = $1 AND board_id = $2`,
        [action.object_id, boardId]
      )
      deletedObjectIds.push(action.object_id)
    }
  }

  return c.json({
    success: true,
    message: agentResult.message || 'Done',
    actionsPerformed: agentResult.actions_performed || [],
    createdObjects,
    updatedObjects,
    deletedObjectIds,
    fitToView: agentResult.fit_to_view || false,
    traceId: agentResult.trace_id || '',
  })
})

// ─── POST /feedback — Store user feedback on AI responses ────────────────────
agent.post('/feedback', requireAuth, async (c) => {
  const body = await c.req.json()
  const schema = z.object({
    boardId: z.string().uuid(),
    traceId: z.string().min(1),
    rating: z.enum(['up', 'down']),
    comment: z.string().max(1000).optional().default(''),
    command: z.string().max(2000).optional().default(''),
    response: z.string().max(5000).optional().default(''),
    model: z.string().max(100).optional().default(''),
  })

  const { boardId, traceId, rating, comment, command, response, model } = schema.parse(body)
  const userId = c.get('userId')

  await pool.query(
    `INSERT INTO ai_feedback (board_id, user_id, trace_id, rating, comment, command, response, model)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [boardId, userId, traceId, rating, comment, command, response, model]
  )

  return c.json({ success: true })
})

// ─── POST /upload — Forward file to Python agent, store document metadata ────
agent.post('/upload', requireAuth, async (c) => {
  const userId = c.get('userId')
  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  const boardId = formData.get('boardId') as string | null

  if (!file || !boardId) {
    return c.json({ error: 'Missing file or boardId' }, 400)
  }

  // Forward to Python agent
  const agentFormData = new FormData()
  agentFormData.append('file', file)
  agentFormData.append('board_id', boardId)

  let result: any
  try {
    const resp = await fetch(`${PYTHON_AGENT_URL}/agent/upload`, {
      method: 'POST',
      body: agentFormData,
    })
    if (!resp.ok) {
      const errText = await resp.text()
      return c.json({ error: `Upload failed: ${errText}` }, 502)
    }
    result = await resp.json()
  } catch (err) {
    console.error('Python agent unreachable for upload:', err)
    return c.json({ error: 'AI agent is unavailable for file processing.' }, 503)
  }

  // Store document metadata in PostgreSQL
  try {
    await pool.query(
      `INSERT INTO documents (id, board_id, file_name, file_type, content, metadata, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        result.document_id,
        boardId,
        result.file_name,
        result.file_type,
        result.preview,
        JSON.stringify(result.metadata),
        userId,
      ]
    )
  } catch (err) {
    console.error('Failed to store document metadata:', err)
    // Non-fatal — the document is still in ChromaDB
  }

  return c.json(result)
})

// ─── POST /dashboard — Dashboard AI navigator: find & navigate to boards ────
agent.post('/dashboard', requireAuth, async (c) => {
  const body = await c.req.json()
  const schema = z.object({
    command: z.string().min(1).max(2000),
    model: z.string().max(50).optional(),
  })
  const { command, model } = schema.parse(body)
  const userId = c.get('userId')

  // Rate limit
  const lastReq = lastRequestTime.get(userId) || 0
  if (Date.now() - lastReq < 3000) {
    return c.json({ error: 'Too many requests. Wait a moment.' }, 429)
  }
  lastRequestTime.set(userId, Date.now())

  // Fetch all boards accessible to this user with object summaries
  const { rows: boardSummaries } = await pool.query(
    `SELECT DISTINCT ON (b.id) b.id, b.title,
       w.name AS workspace_name,
       (SELECT COUNT(*)::int FROM objects o WHERE o.board_id = b.id) AS object_count,
       (SELECT string_agg(DISTINCT o.type, ', ') FROM objects o WHERE o.board_id = b.id) AS object_types,
       (SELECT string_agg(sub.txt, ' | ')
        FROM (
          SELECT COALESCE(o.props->>'text', o.props->>'title', '') AS txt
          FROM objects o
          WHERE o.board_id = b.id
            AND (o.props->>'text' IS NOT NULL OR o.props->>'title' IS NOT NULL)
          LIMIT 10
        ) sub
       ) AS content_preview
     FROM boards b
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $1
     LEFT JOIN workspace_members wm ON wm.workspace_id = b.workspace_id AND wm.user_id = $1
     LEFT JOIN workspaces w ON w.id = b.workspace_id
     WHERE b.owner_id = $1 OR bm.user_id = $1 OR wm.user_id = $1
     ORDER BY b.id, b.created_at DESC`,
    [userId]
  )

  // Forward to Python agent
  let agentResult: any
  try {
    const resp = await fetch(`${PYTHON_AGENT_URL}/agent/dashboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command,
        boards: boardSummaries,
        user_id: userId,
        model: model || '',
      }),
    })
    if (!resp.ok) {
      const errText = await resp.text()
      return c.json({ error: `Agent error: ${errText}` }, 502)
    }
    agentResult = await resp.json()
  } catch (err) {
    console.error('Python agent unreachable for dashboard:', err)
    return c.json({ error: 'AI agent is unavailable. Try again later.' }, 503)
  }

  return c.json({
    message: agentResult.message || 'I could not find a matching board.',
    boardId: agentResult.board_id || null,
    boardTitle: agentResult.board_title || null,
  })
})

// ─── GET /costs — Proxy cost data from Python agent (admin only) ─────────────
agent.get('/costs', requireAuth, async (c) => {
  try {
    const resp = await fetch(`${PYTHON_AGENT_URL}/agent/costs`)
    if (!resp.ok) return c.json({ error: 'Failed to fetch costs' }, 502)
    const data = await resp.json()
    return c.json(data)
  } catch (err) {
    return c.json({ error: 'AI agent is unavailable.' }, 503)
  }
})

// ─── GET /models — Available LLM models from Python agent ────────────────────
agent.get('/models', async (c) => {
  try {
    const resp = await fetch(`${PYTHON_AGENT_URL}/agent/models`)
    if (!resp.ok) return c.json({ error: 'Failed to fetch models' }, 502)
    const data = await resp.json()
    return c.json(data)
  } catch (err) {
    return c.json({ error: 'AI agent is unavailable.' }, 503)
  }
})

export default agent
