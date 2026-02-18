import { Group, Rect, Text } from 'react-konva'
import Konva from 'konva'
import type { Socket } from 'socket.io-client'
import { StickyObject } from '@collabboard/shared'
import { useBoardStore } from '../../stores/boardStore'
import { useUIStore } from '../../stores/uiStore'

interface Props {
  object: StickyObject
  boardId: string
  socketRef: React.MutableRefObject<Socket | null>
  isSelected: boolean
}

export default function StickyNote({ object, boardId, socketRef, isSelected }: Props) {
  const { updateObject, removeObject, pushUndo } = useBoardStore()
  const { setSelectedObjectId } = useUIStore()

  function onDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    const props = { x: e.target.x(), y: e.target.y() }
    updateObject(object.id, props)
    socketRef.current?.emit('object:update', { boardId, objectId: object.id, props })
  }

  function onDblClick() {
    const konvaStage = Konva.stages[0]
    if (!konvaStage) return

    const stageContainer = konvaStage.container()
    if (!stageContainer) return

    const stageRect = stageContainer.getBoundingClientRect()
    const scale = konvaStage.scaleX()
    const stagePos = konvaStage.position()

    const left = stageRect.left + stagePos.x + object.x * scale
    const top = stageRect.top + stagePos.y + object.y * scale

    const textarea = document.createElement('textarea')
    Object.assign(textarea.style, {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${object.width * scale}px`,
      height: `${object.height * scale}px`,
      fontSize: `${object.font_size * scale}px`,
      border: '2px solid #6366f1',
      padding: '8px',
      margin: '0',
      overflow: 'hidden',
      background: object.color,
      outline: 'none',
      resize: 'none',
      fontFamily: 'inherit',
      zIndex: '1000',
      borderRadius: '4px',
      color: '#1a1a1a',
    })
    textarea.value = object.text
    document.body.appendChild(textarea)
    textarea.focus()

    function finish() {
      const newText = textarea.value
      document.body.removeChild(textarea)
      if (newText === object.text) return
      pushUndo()
      const props = { text: newText }
      updateObject(object.id, props)
      socketRef.current?.emit('object:update', { boardId, objectId: object.id, props })
    }

    textarea.addEventListener('blur', finish)
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') finish()
    })
  }

  function onKeyDown(e: Konva.KonvaEventObject<KeyboardEvent>) {
    if (e.evt.key === 'Delete' || e.evt.key === 'Backspace') {
      pushUndo()
      removeObject(object.id)
      socketRef.current?.emit('object:delete', { boardId, objectId: object.id })
      setSelectedObjectId(null)
    }
  }

  return (
    <Group
      id={object.id}
      x={object.x}
      y={object.y}
      width={object.width}
      height={object.height}
      rotation={object.rotation}
      draggable
      onClick={() => setSelectedObjectId(object.id)}
      onDragEnd={onDragEnd}
      onDblClick={onDblClick}
      onKeyDown={onKeyDown}
    >
      <Rect
        width={object.width}
        height={object.height}
        fill={object.color}
        cornerRadius={4}
        shadowColor="rgba(0,0,0,0.2)"
        shadowBlur={isSelected ? 10 : 4}
        shadowOffsetY={2}
        stroke={isSelected ? '#6366f1' : 'transparent'}
        strokeWidth={isSelected ? 2 : 0}
      />
      <Text
        text={object.text || 'Double-click to edit'}
        fill={object.text ? '#1a1a1a' : '#9ca3af'}
        fontSize={object.font_size}
        padding={10}
        width={object.width}
        wrap="word"
      />
    </Group>
  )
}
