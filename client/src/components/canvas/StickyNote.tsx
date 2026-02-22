import { memo } from 'react'
import { Group, Rect, Text } from 'react-konva'
import Konva from 'konva'
import type { Socket } from 'socket.io-client'
import { StickyObject } from '@collabboard/shared'
import { useBoardStore } from '../../stores/boardStore'
import { useUIStore } from '../../stores/uiStore'
import { openTextEditor } from './useTextEdit'
import { useStageRef } from './StageContext'

interface Props {
  object: StickyObject
  boardId: string
  socketRef: React.MutableRefObject<Socket | null>
  isSelected: boolean
}

function StickyNote({ object, boardId, socketRef, isSelected }: Props) {
  const updateObject = useBoardStore(s => s.updateObject)
  const removeObject = useBoardStore(s => s.removeObject)
  const pushUndo = useBoardStore(s => s.pushUndo)
  const setSelectedObjectId = useUIStore(s => s.setSelectedObjectId)
  const stageRef = useStageRef()

  function onDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    pushUndo()
    const props = { x: e.target.x(), y: e.target.y() }
    updateObject(object.id, props)
    socketRef.current?.emit('object:update', { boardId, objectId: object.id, props })
  }

  function onDblClick() {
    openTextEditor({
      stageRef,
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      fontSize: object.font_size,
      fill: object.color,
      currentText: object.text ?? '',
      onInput: (text) => {
        updateObject(object.id, { text })
        socketRef.current?.emit('object:update', { boardId, objectId: object.id, props: { text } })
      },
      onCommit: (newText) => {
        if (newText === (object.text ?? '')) return
        pushUndo()
        const props = { text: newText }
        updateObject(object.id, props)
        socketRef.current?.emit('object:update', { boardId, objectId: object.id, props })
      },
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
        fill={object.text ? '#1e293b' : '#94a3b8'}
        fontSize={object.font_size || Math.max(12, Math.min(18, object.width / 12))}
        padding={10}
        width={object.width}
        height={object.height - 10}
        wrap="word"
        ellipsis={true}
      />
    </Group>
  )
}

export default memo(StickyNote)
