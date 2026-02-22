import { create } from 'zustand'
import { BoardObject } from '@collabboard/shared'

interface BoardStore {
  objects: Map<string, BoardObject>
  commentCounts: Map<string, number>  // objectId → count
  undoStack: BoardObject[][]   // snapshots for undo
  clipboard: BoardObject[]     // copied objects

  setObjects: (objects: BoardObject[]) => void
  clearObjects: () => void
  addObject: (obj: BoardObject) => void
  updateObject: (objectId: string, props: Partial<BoardObject>) => void
  removeObject: (objectId: string) => void
  mergeCommentCounts: (counts: Record<string, number>) => void
  pushUndo: () => void
  undo: () => void
  copySelected: (selectedIds: string[]) => void
  pasteClipboard: (offsetX?: number, offsetY?: number) => string[]
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  objects: new Map(),
  commentCounts: new Map(),
  undoStack: [],
  clipboard: [],

  setObjects: (objects) => {
    const map = new Map<string, BoardObject>()
    objects.forEach(o => map.set(o.id, o))
    set({ objects: map })
  },

  clearObjects: () => set({ objects: new Map(), undoStack: [], commentCounts: new Map() }),

  addObject: (obj) => {
    set(state => {
      const next = new Map(state.objects)
      next.set(obj.id, obj)
      return { objects: next }
    })
  },

  updateObject: (objectId, props) => {
    set(state => {
      const existing = state.objects.get(objectId)
      if (!existing) return state
      const next = new Map(state.objects)
      next.set(objectId, { ...existing, ...props } as BoardObject)
      return { objects: next }
    })
  },

  removeObject: (objectId) => {
    set(state => {
      const next = new Map(state.objects)
      next.delete(objectId)
      const nextCounts = new Map(state.commentCounts)
      nextCounts.delete(objectId)
      return { objects: next, commentCounts: nextCounts }
    })
  },

  mergeCommentCounts: (counts) => {
    set(state => {
      const next = new Map(state.commentCounts)
      for (const [objectId, count] of Object.entries(counts)) {
        next.set(objectId, count)
      }
      return { commentCounts: next }
    })
  },

  pushUndo: () => {
    const snapshot = Array.from(get().objects.values())
    set(state => ({
      undoStack: [...state.undoStack.slice(-19), snapshot], // keep last 20
    }))
  },

  undo: () => {
    const { undoStack } = get()
    if (undoStack.length === 0) return
    const previous = undoStack[undoStack.length - 1]
    const map = new Map<string, BoardObject>()
    previous.forEach(o => map.set(o.id, o))
    set(state => ({
      objects: map,
      undoStack: state.undoStack.slice(0, -1),
    }))
  },

  copySelected: (selectedIds) => {
    const { objects } = get()
    const copied = selectedIds
      .map(id => objects.get(id))
      .filter((o): o is BoardObject => !!o && o.type !== 'connector')
    set({ clipboard: copied })
  },

  pasteClipboard: (offsetX = 20, offsetY = 20) => {
    const { clipboard, objects } = get()
    if (clipboard.length === 0) return []
    const newIds: string[] = []
    const next = new Map(objects)
    for (const obj of clipboard) {
      const newId = crypto.randomUUID()
      const copy = {
        ...obj,
        id: newId,
        x: obj.x + offsetX,
        y: obj.y + offsetY,
        updated_at: new Date().toISOString(),
      }
      next.set(newId, copy as BoardObject)
      newIds.push(newId)
    }
    set({ objects: next })
    return newIds
  },
}))
