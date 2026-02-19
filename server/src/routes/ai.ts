import { Hono } from 'hono'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth, AuthVariables } from '../middleware/auth'
import { pool } from '../db'
import { z } from 'zod'
import { BoardObject } from '@collabboard/shared'

const ai = new Hono<{ Variables: AuthVariables }>()
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── In-memory cache (command → result, 10 min TTL) ─────────────────────────
const responseCache = new Map<string, { result: any; expiresAt: number }>()
function getCached(key: string) {
  const entry = responseCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { responseCache.delete(key); return null }
  return entry.result
}
function setCache(key: string, result: any) {
  responseCache.set(key, { result, expiresAt: Date.now() + 10 * 60 * 1000 })
}

// ─── Per-user rate limit (1 request per 3 seconds) ───────────────────────────
const lastRequestTime = new Map<string, number>()

// ─── Pre-built templates (zero API cost) ─────────────────────────────────────
type TemplateObject = { type: string; text?: string; color?: string; title?: string; fill?: string; stroke?: string; stroke_width?: number; x: number; y: number; width: number; height: number }
const TEMPLATES: Record<string, { message: string; objects: TemplateObject[] }> = {
  swot: {
    message: 'Created SWOT analysis with 4 quadrants',
    objects: [
      { type: 'sticky', text: 'Strengths', color: '#86efac', x: 50,  y: 50,  width: 220, height: 220 },
      { type: 'sticky', text: 'Weaknesses', color: '#fca5a5', x: 290, y: 50,  width: 220, height: 220 },
      { type: 'sticky', text: 'Opportunities', color: '#93c5fd', x: 50,  y: 290, width: 220, height: 220 },
      { type: 'sticky', text: 'Threats', color: '#fcd34d', x: 290, y: 290, width: 220, height: 220 },
    ],
  },
  kanban: {
    message: 'Created Kanban board with 3 columns',
    objects: [
      { type: 'rect', title: 'To Do',       fill: '#1e293b', stroke: '#475569', stroke_width: 2, x: 50,  y: 50, width: 200, height: 400 },
      { type: 'rect', title: 'In Progress', fill: '#1e293b', stroke: '#6366f1', stroke_width: 2, x: 270, y: 50, width: 200, height: 400 },
      { type: 'rect', title: 'Done',         fill: '#1e293b', stroke: '#22c55e', stroke_width: 2, x: 490, y: 50, width: 200, height: 400 },
    ],
  },
  userjourney: {
    message: 'Created user journey map with 5 stages',
    objects: [
      { type: 'sticky', text: '1. Awareness',   color: '#fcd34d', x: 50,  y: 100, width: 160, height: 160 },
      { type: 'sticky', text: '2. Consideration', color: '#93c5fd', x: 230, y: 100, width: 160, height: 160 },
      { type: 'sticky', text: '3. Purchase',    color: '#86efac', x: 410, y: 100, width: 160, height: 160 },
      { type: 'sticky', text: '4. Retention',   color: '#fca5a5', x: 590, y: 100, width: 160, height: 160 },
      { type: 'sticky', text: '5. Advocacy',    color: '#c4b5fd', x: 770, y: 100, width: 160, height: 160 },
    ],
  },
  brainstorm: {
    message: 'Created brainstorm board with idea clusters',
    objects: [
      { type: 'sticky', text: '💡 Main Idea', color: '#fcd34d', x: 300, y: 200, width: 180, height: 180 },
      { type: 'sticky', text: 'Idea 1', color: '#93c5fd', x: 80,  y: 80,  width: 150, height: 150 },
      { type: 'sticky', text: 'Idea 2', color: '#93c5fd', x: 520, y: 80,  width: 150, height: 150 },
      { type: 'sticky', text: 'Idea 3', color: '#86efac', x: 80,  y: 360, width: 150, height: 150 },
      { type: 'sticky', text: 'Idea 4', color: '#86efac', x: 520, y: 360, width: 150, height: 150 },
    ],
  },
}

function matchTemplate(command: string): { message: string; objects: TemplateObject[] } | null {
  const cmd = command.toLowerCase()
  if (/swot/.test(cmd)) return TEMPLATES.swot
  if (/kanban|sprint board/.test(cmd)) return TEMPLATES.kanban
  if (/user journey|customer journey/.test(cmd)) return TEMPLATES.userjourney
  if (/brainstorm/.test(cmd)) return TEMPLATES.brainstorm
  return null
}

const tools: Anthropic.Tool[] = [
  {
    name: 'getBoardState',
    description: 'Get the current state of all objects on the board',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'createStickyNote',
    description: 'Create a sticky note on the board',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'Text content' },
        x: { type: 'number' },
        y: { type: 'number' },
        color: { type: 'string', description: 'Background color hex e.g. #FEF08A' },
      },
      required: ['text', 'x', 'y'],
    },
  },
  {
    name: 'createShape',
    description: 'Create a rectangle or circle shape',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', enum: ['rect', 'circle'] },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        fill: { type: 'string' },
      },
      required: ['type', 'x', 'y', 'width', 'height'],
    },
  },
  {
    name: 'createFrame',
    description: 'Create a labeled frame/container',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
      },
      required: ['title', 'x', 'y', 'width', 'height'],
    },
  },
  {
    name: 'moveObject',
    description: 'Move an object to a new position',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
      },
      required: ['objectId', 'x', 'y'],
    },
  },
  {
    name: 'updateText',
    description: 'Update text content of a sticky note or text object',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['objectId', 'text'],
    },
  },
  {
    name: 'changeColor',
    description: 'Change the color of an object',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string' },
        color: { type: 'string' },
      },
      required: ['objectId', 'color'],
    },
  },
  {
    name: 'deleteObject',
    description: 'Delete an object from the board',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string' },
      },
      required: ['objectId'],
    },
  },
  {
    name: 'createConnector',
    description: 'Create a connector arrow between two existing objects',
    input_schema: {
      type: 'object' as const,
      properties: {
        fromId: { type: 'string', description: 'Source object id' },
        toId: { type: 'string', description: 'Target object id' },
        style: { type: 'string', enum: ['solid', 'dashed'], description: 'Line style' },
        color: { type: 'string', description: 'Connector color hex' },
      },
      required: ['fromId', 'toId'],
    },
  },
  {
    name: 'resizeObject',
    description: 'Resize an object to new dimensions',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string' },
        width: { type: 'number', description: 'New width in pixels' },
        height: { type: 'number', description: 'New height in pixels' },
      },
      required: ['objectId', 'width', 'height'],
    },
  },
]

ai.post('/command', requireAuth, async (c) => {
  const body = await c.req.json()
  const schema = z.object({
    boardId: z.string().uuid(),
    command: z.string().min(1).max(500),
  })
  const { boardId, command } = schema.parse(body)
  const userId = c.get('userId')

  // ── Rate limit: 1 request per 3 seconds per user ──────────────────────────
  const lastReq = lastRequestTime.get(userId) || 0
  if (Date.now() - lastReq < 3000) {
    return c.json({ error: 'Too many requests. Wait a moment.' }, 429)
  }
  lastRequestTime.set(userId, Date.now())

  // ── Template match: zero API cost ─────────────────────────────────────────
  const template = matchTemplate(command)
  if (template) {
    const now = new Date().toISOString()
    const createdObjects: BoardObject[] = template.objects.map(o => ({
      id: crypto.randomUUID(), board_id: boardId,
      type: o.type, x: o.x, y: o.y, width: o.width, height: o.height,
      rotation: 0, z_index: 0,
      created_by: userId, updated_at: now,
      ...(o.text !== undefined && { text: o.text }),
      ...(o.color !== undefined && { color: o.color, font_size: 14 }),
      ...(o.fill !== undefined && { fill: o.fill }),
      ...(o.stroke !== undefined && { stroke: o.stroke, stroke_width: o.stroke_width ?? 2 }),
    } as any))

    for (const obj of createdObjects) {
      await pool.query(
        `INSERT INTO objects (id, board_id, type, props, z_index, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
        [obj.id, boardId, obj.type, JSON.stringify(obj), 0, userId]
      )
    }
    return c.json({ success: true, message: template.message, actionsPerformed: [], createdObjects, updatedObjects: [], deletedObjectIds: [] })
  }

  // ── Response cache: same command within 10 min ────────────────────────────
  const cacheKey = `${command.toLowerCase().trim()}`
  const cached = getCached(cacheKey)
  if (cached) {
    // Re-create objects with fresh IDs so they don't collide
    const now = new Date().toISOString()
    const freshObjects = cached.createdObjects.map((o: BoardObject) => ({ ...o, id: crypto.randomUUID(), board_id: boardId, updated_at: now }))
    for (const obj of freshObjects) {
      await pool.query(
        `INSERT INTO objects (id, board_id, type, props, z_index, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
        [obj.id, boardId, obj.type, JSON.stringify(obj), 0, userId]
      )
    }
    return c.json({ ...cached, createdObjects: freshObjects, message: cached.message + ' (cached)' })
  }

  const { rows: objects } = await pool.query(
    `SELECT id, type, props, z_index FROM objects WHERE board_id = $1 ORDER BY z_index`,
    [boardId]
  )
  const boardState = objects.map(o => ({ id: o.id, type: o.type, ...(o as any).props }))

  const actions: string[] = []
  const createdObjects: BoardObject[] = []
  const updatedObjects: { objectId: string; props: Partial<BoardObject> }[] = []
  const deletedObjectIds: string[] = []

  async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    const now = new Date().toISOString()
    const newId = () => crypto.randomUUID()

    switch (name) {
      case 'getBoardState':
        return JSON.stringify(boardState)

      case 'createStickyNote': {
        const obj: any = {
          id: newId(), board_id: boardId, type: 'sticky',
          x: input.x, y: input.y, width: 200, height: 200,
          rotation: 0, z_index: boardState.length,
          created_by: userId, updated_at: now,
          text: input.text, color: (input.color as string) || '#FEF08A', font_size: 14,
        }
        await pool.query(
          `INSERT INTO objects (id, board_id, type, props, z_index, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
          [obj.id, boardId, 'sticky', JSON.stringify(obj), obj.z_index, userId]
        )
        createdObjects.push(obj)
        actions.push(`Created sticky note: "${input.text}"`)
        return `Created sticky note with id ${obj.id}`
      }

      case 'createShape': {
        const obj: any = {
          id: newId(), board_id: boardId, type: input.type,
          x: input.x, y: input.y, width: input.width, height: input.height,
          rotation: 0, z_index: boardState.length,
          created_by: userId, updated_at: now,
          fill: (input.fill as string) || '#93C5FD', stroke: '#1e40af', stroke_width: 2,
        }
        await pool.query(
          `INSERT INTO objects (id, board_id, type, props, z_index, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
          [obj.id, boardId, input.type, JSON.stringify(obj), obj.z_index, userId]
        )
        createdObjects.push(obj)
        actions.push(`Created ${input.type}`)
        return `Created shape with id ${obj.id}`
      }

      case 'createFrame': {
        const obj: any = {
          id: newId(), board_id: boardId, type: 'frame',
          x: input.x, y: input.y, width: input.width, height: input.height,
          rotation: 0, z_index: 0,
          created_by: userId, updated_at: now,
          title: input.title, fill: 'rgba(255,255,255,0.05)',
        }
        await pool.query(
          `INSERT INTO objects (id, board_id, type, props, z_index, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
          [obj.id, boardId, 'frame', JSON.stringify(obj), 0, userId]
        )
        createdObjects.push(obj)
        actions.push(`Created frame: "${input.title}"`)
        return `Created frame with id ${obj.id}`
      }

      case 'moveObject': {
        const props = { x: input.x as number, y: input.y as number }
        await pool.query(
          `UPDATE objects SET props = props || $1::jsonb, updated_at = now() WHERE id = $2 AND board_id = $3`,
          [JSON.stringify(props), input.objectId, boardId]
        )
        updatedObjects.push({ objectId: input.objectId as string, props })
        actions.push(`Moved object ${input.objectId}`)
        return `Moved object ${input.objectId}`
      }

      case 'updateText': {
        const props = { text: input.text }
        await pool.query(
          `UPDATE objects SET props = props || $1::jsonb, updated_at = now() WHERE id = $2 AND board_id = $3`,
          [JSON.stringify(props), input.objectId, boardId]
        )
        updatedObjects.push({ objectId: input.objectId as string, props: props as any })
        actions.push(`Updated text on ${input.objectId}`)
        return `Updated text on ${input.objectId}`
      }

      case 'changeColor': {
        const props = { color: input.color, fill: input.color }
        await pool.query(
          `UPDATE objects SET props = props || $1::jsonb, updated_at = now() WHERE id = $2 AND board_id = $3`,
          [JSON.stringify(props), input.objectId, boardId]
        )
        updatedObjects.push({ objectId: input.objectId as string, props: props as any })
        actions.push(`Changed color of ${input.objectId}`)
        return `Changed color of ${input.objectId}`
      }

      case 'deleteObject': {
        await pool.query(`DELETE FROM objects WHERE id = $1 AND board_id = $2`, [input.objectId, boardId])
        deletedObjectIds.push(input.objectId as string)
        actions.push(`Deleted ${input.objectId}`)
        return `Deleted ${input.objectId}`
      }

      case 'createConnector': {
        const obj: any = {
          id: newId(), board_id: boardId, type: 'connector',
          x: 0, y: 0, width: 0, height: 0,
          rotation: 0, z_index: boardState.length,
          created_by: userId, updated_at: now,
          from_id: input.fromId, to_id: input.toId,
          style: (input.style as string) || 'solid',
          color: (input.color as string) || '#6366f1',
        }
        await pool.query(
          `INSERT INTO objects (id, board_id, type, props, z_index, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
          [obj.id, boardId, 'connector', JSON.stringify(obj), obj.z_index, userId]
        )
        createdObjects.push(obj)
        actions.push(`Created connector from ${input.fromId} to ${input.toId}`)
        return `Created connector with id ${obj.id}`
      }

      case 'resizeObject': {
        const props = { width: input.width as number, height: input.height as number }
        await pool.query(
          `UPDATE objects SET props = props || $1::jsonb, updated_at = now() WHERE id = $2 AND board_id = $3`,
          [JSON.stringify(props), input.objectId, boardId]
        )
        updatedObjects.push({ objectId: input.objectId as string, props })
        actions.push(`Resized object ${input.objectId} to ${input.width}×${input.height}`)
        return `Resized object ${input.objectId}`
      }

      default:
        return 'Unknown tool'
    }
  }

  // Auto-select model based on command complexity
  // Sonnet for: long commands, analysis/compare/organize keywords, many objects to reason about
  const complexKeywords = /analyz|compar|organiz|prioriti|summariz|review|improve|suggest|restructur|why|because|reason/i
  const isComplex = command.length > 100 || complexKeywords.test(command) || boardState.length > 20
  const model = isComplex ? 'claude-sonnet-4-5-20250929' : 'claude-haiku-4-5-20251001'
  const maxTokens = isComplex ? 2048 : 1024

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `You are an AI assistant for a collaborative whiteboard. The board has ${boardState.length} objects. Execute this command: ${command}`,
    },
  ]

  let response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    tools,
    messages,
  })

  let iterations = 0
  while (response.stop_reason === 'tool_use' && iterations < 10) {
    iterations++
    const toolUses = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]
    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const toolUse of toolUses) {
      const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>)
      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result })
    }

    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: toolResults })

    response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      tools,
      messages,
    })
  }

  const finalText = response.content.find(b => b.type === 'text')
  const message = finalText?.type === 'text' ? finalText.text : 'Done'

  const result = { success: true, message, actionsPerformed: actions, createdObjects, updatedObjects, deletedObjectIds }

  // Cache result if objects were created (useful for repeat commands)
  if (createdObjects.length > 0) setCache(cacheKey, result)

  return c.json(result)
})

export default ai
