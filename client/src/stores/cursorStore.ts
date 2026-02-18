import { create } from 'zustand'
import { CursorPosition } from '@collabboard/shared'

interface CursorStore {
  cursors: Map<string, CursorPosition>
  updateCursor: (cursor: CursorPosition) => void
  removeCursor: (userId: string) => void
  clearCursors: () => void
}

export const useCursorStore = create<CursorStore>((set) => ({
  cursors: new Map(),

  updateCursor: (cursor) =>
    set(state => {
      const next = new Map(state.cursors)
      next.set(cursor.userId, cursor)
      return { cursors: next }
    }),

  removeCursor: (userId) =>
    set(state => {
      const next = new Map(state.cursors)
      next.delete(userId)
      return { cursors: next }
    }),

  clearCursors: () => set({ cursors: new Map() }),
}))
