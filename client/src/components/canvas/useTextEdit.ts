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
  stageRef?: React.RefObject<Konva.Stage | null>
}

/**
 * Spawns a positioned <textarea> over the Konva stage for inline text editing.
 * Works for sticky notes, rect shapes, circle shapes, and frame titles.
 */
export function openTextEditor(opts: Options) {
  const konvaStage = opts.stageRef?.current
  if (!konvaStage) return

  const container = konvaStage.container()
  const stageRect = container.getBoundingClientRect()
  const scale = konvaStage.scaleX()
  const stagePos = konvaStage.position()

  // Account for Layer offsetX/offsetY (used to shift content for negative coords)
  const layer = konvaStage.getLayers()[0]
  const layerOffsetX = layer ? -layer.offsetX() : 0
  const layerOffsetY = layer ? -layer.offsetY() : 0

  const left = stageRect.left + stagePos.x + (opts.x + layerOffsetX) * scale
  const top = stageRect.top + stagePos.y + (opts.y + layerOffsetY) * scale

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
    color: opts.fill === 'transparent' || opts.fill.startsWith('rgba') ? '#1e293b' : '#1e293b',
    textAlign: 'center',
  })
  textarea.value = opts.currentText
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  let finished = false

  function finish() {
    if (finished) return
    finished = true
    textarea.removeEventListener('input', handleInput)
    textarea.removeEventListener('blur', handleBlur)
    textarea.removeEventListener('keydown', handleKeyDown)
    if (document.body.contains(textarea)) {
      document.body.removeChild(textarea)
    }
    opts.onCommit(textarea.value)
  }

  function handleInput() { if (opts.onInput) opts.onInput(textarea.value) }
  function handleBlur() { finish() }
  function handleKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') finish() }

  textarea.addEventListener('input', handleInput)
  textarea.addEventListener('blur', handleBlur)
  textarea.addEventListener('keydown', handleKeyDown)
}
