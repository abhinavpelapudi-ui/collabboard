import { create } from 'zustand'

export type Tool = 'select' | 'pan' | 'sticky' | 'rect' | 'circle' | 'frame' | 'text' | 'connect'

interface UIStore {
  activeTool: Tool
  selectedObjectId: string | null
  activeColor: string
  showAIPanel: boolean
  fitRequest: number  // increment to trigger canvas fit-to-objects

  setActiveTool: (tool: Tool) => void
  setSelectedObjectId: (id: string | null) => void
  setActiveColor: (color: string) => void
  toggleAIPanel: () => void
  triggerFit: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeTool: 'select',
  selectedObjectId: null,
  activeColor: '#FEF08A',
  showAIPanel: false,
  fitRequest: 0,

  setActiveTool: (activeTool) => set({ activeTool, selectedObjectId: null }),
  setSelectedObjectId: (selectedObjectId) => set({ selectedObjectId }),
  setActiveColor: (activeColor) => set({ activeColor }),
  toggleAIPanel: () => set(s => ({ showAIPanel: !s.showAIPanel })),
  triggerFit: () => set(s => ({ fitRequest: s.fitRequest + 1 })),
}))
