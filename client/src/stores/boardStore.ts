import { create } from 'zustand'
import { BoardObject } from '@collabboard/shared'

interface BoardStore {
  objects: Map<string, BoardObject>
  undoStack: BoardObject[][]   // snapshots for undo

  setObjects: (objects: BoardObject[]) => void
  clearObjects: () => void
  addObject: (obj: BoardObject) => void
  updateObject: (objectId: string, props: Partial<BoardObject>) => void
  removeObject: (objectId: string) => void
  pushUndo: () => void
  undo: () => void
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  objects: new Map(),
  undoStack: [],

  setObjects: (objects) => {
    const map = new Map<string, BoardObject>()
    objects.forEach(o => map.set(o.id, o))
    set({ objects: map })
  },

  clearObjects: () => set({ objects: new Map(), undoStack: [] }),

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
      return { objects: next }
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
}))
