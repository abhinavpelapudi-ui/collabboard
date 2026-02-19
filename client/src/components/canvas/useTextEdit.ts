import Konva from 'konva'

interface Options {
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  fill: string         // background color for textarea
  currentText: string
  onCommit: (text: string) => void
  onInput?: (text: string) => void  // called on every keystroke for real-time sync
}

/**
 * Spawns a positioned <textarea> over the Konva stage for inline text editing.
 * Works for sticky notes, rect shapes, circle shapes, and frame titles.
 */
export function openTextEditor(opts: Options) {
  const konvaStage = Konva.stages[0]
  if (!konvaStage) return

  const container = konvaStage.container()
  const stageRect = container.getBoundingClientRect()
  const scale = konvaStage.scaleX()
  const stagePos = konvaStage.position()

  const left = stageRect.left + stagePos.x + opts.x * scale
  const top = stageRect.top + stagePos.y + opts.y * scale

  const textarea = document.createElement('textarea')
  Object.assign(textarea.style, {
    position: 'fixed',
    left: `${left}px`,
    top: `${top}px`,
    width: `${opts.width * scale}px`,
    height: `${opts.height * scale}px`,
    fontSize: `${opts.fontSize * scale}px`,
    border: '2px solid #6366f1',
    padding: '8px',
    margin: '0',
    overflow: 'hidden',
    background: opts.fill,
    outline: 'none',
    resize: 'none',
    fontFamily: 'inherit',
    zIndex: '1000',
    borderRadius: '4px',
    color: opts.fill === 'transparent' || opts.fill.startsWith('rgba') ? '#ffffff' : '#1a1a1a',
    textAlign: 'center',
  })
  textarea.value = opts.currentText
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  function finish() {
    if (!document.body.contains(textarea)) return
    document.body.removeChild(textarea)
    opts.onCommit(textarea.value)
  }

  if (opts.onInput) {
    textarea.addEventListener('input', () => opts.onInput!(textarea.value))
  }
  textarea.addEventListener('blur', finish)
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') finish()
  })
}
