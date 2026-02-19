import { useEffect } from 'react'
import { useUIStore, Tool } from '../../stores/uiStore'
import { STICKY_COLORS } from '@collabboard/shared'

const tools: { key: Tool; label: string; shortcut: string; icon: string }[] = [
  { key: 'select',  label: 'Select',  shortcut: 'V', icon: '↖' },
  { key: 'pan',     label: 'Pan',     shortcut: 'H', icon: '✋' },
  { key: 'sticky',  label: 'Sticky',  shortcut: 'S', icon: '📝' },
  { key: 'text',    label: 'Text',    shortcut: 'T', icon: 'T' },
  { key: 'rect',    label: 'Rect',    shortcut: 'R', icon: '⬜' },
  { key: 'circle',  label: 'Circle',  shortcut: 'C', icon: '⬤' },
  { key: 'frame',   label: 'Frame',   shortcut: 'F', icon: '▢' },
  { key: 'connect', label: 'Connect', shortcut: 'X', icon: '↗' },
]

export default function Toolbar() {
  const { activeTool, setActiveTool, activeColor, setActiveColor, showAIPanel, toggleAIPanel } = useUIStore()

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const focused = document.activeElement
      if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) return
      if (e.key === 'v' || e.key === 'V') setActiveTool('select')
      if (e.key === 'h' || e.key === 'H') setActiveTool('pan')
      if (e.key === 's' || e.key === 'S') setActiveTool('sticky')
      if (e.key === 'r' || e.key === 'R') setActiveTool('rect')
      if (e.key === 'c' || e.key === 'C') setActiveTool('circle')
      if (e.key === 't' || e.key === 'T') setActiveTool('text')
      if (e.key === 'f' || e.key === 'F') setActiveTool('frame')
      if (e.key === 'x' || e.key === 'X') setActiveTool('connect')
      if (e.key === 'Escape') setActiveTool('select')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setActiveTool])

  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-20 flex items-center gap-1 bg-gray-900 border border-gray-700 rounded-2xl px-3 py-2 shadow-xl">
      {/* Tools */}
      {tools.map(tool => (
        <button
          key={tool.key}
          onClick={() => setActiveTool(tool.key)}
          title={`${tool.label} (${tool.shortcut})`}
          className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all ${
            activeTool === tool.key
              ? 'bg-indigo-600 text-white shadow-lg'
              : 'text-gray-300 hover:bg-gray-800'
          }`}
        >
          {tool.icon}
        </button>
      ))}

      {/* Divider */}
      <div className="w-px h-8 bg-gray-700 mx-1" />

      {/* Color picker */}
      <div className="flex items-center gap-1">
        {STICKY_COLORS.map(color => (
          <button
            key={color}
            onClick={() => setActiveColor(color)}
            className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
              activeColor === color ? 'border-indigo-400 scale-110' : 'border-transparent'
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-gray-700 mx-1" />

      {/* AI Toggle */}
      <button
        onClick={toggleAIPanel}
        title="AI Agent (A)"
        className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all ${
          showAIPanel ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-300 hover:bg-gray-800'
        }`}
      >
        ✦
      </button>
    </div>
  )
}
