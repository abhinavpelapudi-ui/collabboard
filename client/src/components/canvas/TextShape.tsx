import { memo } from 'react'
import { Text, Group, Rect } from 'react-konva'
import Konva from 'konva'
import type { Socket } from 'socket.io-client'
import { TextObject } from '@collabboard/shared'
import { useBoardStore } from '../../stores/boardStore'
import { useUIStore } from '../../stores/uiStore'

interface Props {
  object: TextObject
  boardId: string
  socketRef: React.MutableRefObject<Socket | null>
  isSelected: boolean
}

function TextShape({ object, boardId, socketRef, isSelected }: Props) {
  const updateObject = useBoardStore(s => s.updateObject)
  const pushUndo = useBoardStore(s => s.pushUndo)
  const setSelectedObjectId = useUIStore(s => s.setSelectedObjectId)
  const activeTool = useUIStore(s => s.activeTool)
  const toggleSelectedId = useUIStore(s => s.toggleSelectedId)

  function handleClick(e: Konva.KonvaEventObject<MouseEvent>) {
    if (activeTool !== 'select') return
    e.cancelBubble = true
    if (e.evt.shiftKey) {
      toggleSelectedId(object.id)
    } else {
      setSelectedObjectId(object.id)
    }
  }

  function handleDblClick() {
    const stage = Konva.stages[0]
    if (!stage) return
    const stageRect = stage.container().getBoundingClientRect()
    const scale = stage.scaleX()
    const stagePos = stage.position()
    const left = stageRect.left + stagePos.x + object.x * scale
    const top = stageRect.top + stagePos.y + object.y * scale

    const textarea = document.createElement('textarea')
    Object.assign(textarea.style, {
      position: 'fixed', left: `${left}px`, top: `${top}px`,
      width: `${Math.max(120, object.width) * scale}px`,
      minHeight: `${(object.font_size + 16) * scale}px`,
      fontSize: `${(object.font_size || 16) * scale}px`,
      border: '2px solid #6366f1', padding: '4px 8px', margin: '0',
      background: 'transparent', outline: 'none', resize: 'none',
      fontFamily: 'Inter, sans-serif', zIndex: '1000', borderRadius: '4px',
      color: object.color || '#ffffff', overflow: 'hidden',
    })
    textarea.value = object.text
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()

    function finish() {
      if (!document.body.contains(textarea)) return
      document.body.removeChild(textarea)
      const newText = textarea.value
      if (newText !== object.text) {
        pushUndo()
        const props = { text: newText }
        updateObject(object.id, props)
        socketRef.current?.emit('object:update', { boardId, objectId: object.id, props })
      }
    }
    textarea.addEventListener('input', () => {
      socketRef.current?.emit('object:update', { boardId, objectId: object.id, props: { text: textarea.value } })
    })
    textarea.addEventListener('blur', finish)
    textarea.addEventListener('keydown', (e) => { if (e.key === 'Escape') finish() })
  }

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    pushUndo()
    const props = { x: e.target.x(), y: e.target.y() }
    updateObject(object.id, props)
    socketRef.current?.emit('object:update', { boardId, objectId: object.id, props })
  }

  return (
    <Group
      id={object.id}
      x={object.x}
      y={object.y}
      rotation={object.rotation}
      draggable={activeTool === 'select'}
      onClick={handleClick}
      onDblClick={handleDblClick}
      onDragEnd={handleDragEnd}
    >
      {isSelected && (
        <Rect
          x={-4} y={-4}
          width={Math.max(120, object.width) + 8}
          height={(object.font_size || 16) * 2.5 + 8}
          fill="rgba(99,102,241,0.08)" stroke="#6366f1"
          strokeWidth={1.5} cornerRadius={4} listening={false}
        />
      )}
      <Text
        text={object.text || 'Double-click to edit'}
        width={Math.max(120, object.width)}
        fontSize={object.font_size || 16}
        fill={object.text ? (object.color || '#ffffff') : '#6b7280'}
        fontFamily="Inter, sans-serif"
        wrap="word" align="left"
      />
    </Group>
  )
}

export default memo(TextShape)
