// ─── Board Objects ───────────────────────────────────────────────────────────

export type ObjectType = 'sticky' | 'rect' | 'circle' | 'text' | 'frame' | 'connector'

export interface BaseObject {
  id: string
  board_id: string
  type: ObjectType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  z_index: number
  created_by: string
  updated_at: string
}

export interface StickyObject extends BaseObject {
  type: 'sticky'
  text: string
  color: string
  font_size: number
}

export interface RectObject extends BaseObject {
  type: 'rect'
  fill: string
  stroke: string
  stroke_width: number
  text?: string
}

export interface CircleObject extends BaseObject {
  type: 'circle'
  fill: string
  stroke: string
  stroke_width: number
  text?: string
}

export interface TextObject extends BaseObject {
  type: 'text'
  text: string
  font_size: number
  color: string
}

export interface FrameObject extends BaseObject {
  type: 'frame'
  title: string
  fill: string
}

export interface ConnectorObject extends BaseObject {
  type: 'connector'
  from_id: string
  to_id: string
  style: 'solid' | 'dashed'
  color: string
}

export type BoardObject =
  | StickyObject
  | RectObject
  | CircleObject
  | TextObject
  | FrameObject
  | ConnectorObject

// ─── Board ───────────────────────────────────────────────────────────────────

export type BoardRole = 'owner' | 'editor' | 'viewer'

export interface BoardMember {
  user_id: string
  name: string
  email: string
  role: BoardRole
}

export interface Board {
  id: string
  title: string
  owner_id: string
  workspace_id?: string | null
  created_at: string
  role?: BoardRole  // current user's role on this board
}

// ─── Workspace ───────────────────────────────────────────────────────────────

export type WorkspaceRole = 'owner' | 'editor' | 'viewer'

export interface WorkspaceMember {
  user_id: string
  name: string
  email: string
  role: WorkspaceRole
}

export interface Workspace {
  id: string
  name: string
  owner_id: string
  created_at: string
  role: WorkspaceRole
  member_count?: number
}

// ─── User ────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  name: string
  email: string
  avatar_url?: string
}

// ─── Socket Events ───────────────────────────────────────────────────────────

export interface CursorPosition {
  userId: string
  userName: string
  userColor: string
  x: number
  y: number
}

export interface PresenceUser {
  userId: string
  userName: string
  userColor: string
  avatarUrl?: string
}

// Client → Server
export interface ClientToServerEvents {
  'board:join': (payload: { boardId: string }) => void
  'board:leave': (payload: { boardId: string }) => void
  'cursor:move': (payload: { boardId: string; x: number; y: number }) => void
  'object:create': (payload: { boardId: string; object: BoardObject }) => void
  'object:update': (payload: { boardId: string; objectId: string; props: Partial<BoardObject> }) => void
  'object:delete': (payload: { boardId: string; objectId: string }) => void
}

// Server → Client
export interface ServerToClientEvents {
  'board:state': (payload: { objects: BoardObject[] }) => void
  'cursor:move': (payload: CursorPosition) => void
  'cursor:leave': (payload: { userId: string }) => void
  'object:create': (payload: { object: BoardObject }) => void
  'object:update': (payload: { objectId: string; props: Partial<BoardObject> }) => void
  'object:delete': (payload: { objectId: string }) => void
  'presence:update': (payload: { users: PresenceUser[] }) => void
  'role:changed': (payload: { boardId: string; role: BoardRole }) => void
  'error': (payload: { message: string }) => void
}

// ─── AI ──────────────────────────────────────────────────────────────────────

export interface AICommandRequest {
  boardId: string
  command: string
  boardState: BoardObject[]
}

export interface AICommandResponse {
  success: boolean
  message: string
  actionsPerformed: string[]
}

// ─── Colors ──────────────────────────────────────────────────────────────────

export const STICKY_COLORS = ['#FEF08A', '#FCA5A5', '#93C5FD', '#86EFAC', '#E9D5FF', '#FFFFFF'] as const
export const USER_COLORS = ['#F87171', '#FB923C', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA', '#F472B6'] as const
