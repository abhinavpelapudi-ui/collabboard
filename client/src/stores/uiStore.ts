import { create } from 'zustand'

export type Tool = 'select' | 'sticky' | 'rect' | 'circle' | 'frame' | 'text' | 'connect'

interface UIStore {
  activeTool: Tool
  selectedIds: string[]          // multi-select set
  selectedObjectId: string | null // single-select (= selectedIds[0] when length===1)
  activeColor: string
  showAIPanel: boolean
  fitRequest: number
  isConnected: boolean

  setActiveTool: (tool: Tool) => void
  setSelectedObjectId: (id: string | null) => void
  setSelectedIds: (ids: string[]) => void
  toggleSelectedId: (id: string) => void
  clearSelection: () => void
  setActiveColor: (color: string) => void
  toggleAIPanel: () => void
  triggerFit: () => void
  setConnected: (v: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeTool: 'select',
  selectedIds: [],
  selectedObjectId: null,
  activeColor: '#FEF08A',
  showAIPanel: false,
  fitRequest: 0,
  isConnected: true,

  setActiveTool: (activeTool) => set({ activeTool, selectedIds: [], selectedObjectId: null }),
  setSelectedObjectId: (id) => set({ selectedObjectId: id, selectedIds: id ? [id] : [] }),
  setSelectedIds: (ids) => set({ selectedIds: ids, selectedObjectId: ids.length === 1 ? ids[0] : null }),
  toggleSelectedId: (id) => set(state => {
    const has = state.selectedIds.includes(id)
    const next = has ? state.selectedIds.filter(x => x !== id) : [...state.selectedIds, id]
    return { selectedIds: next, selectedObjectId: next.length === 1 ? next[0] : null }
  }),
  clearSelection: () => set({ selectedIds: [], selectedObjectId: null }),
  setActiveColor: (activeColor) => set({ activeColor }),
  toggleAIPanel: () => set(s => ({ showAIPanel: !s.showAIPanel })),
  triggerFit: () => set(s => ({ fitRequest: s.fitRequest + 1 })),
  setConnected: (v) => set({ isConnected: v }),
}))
