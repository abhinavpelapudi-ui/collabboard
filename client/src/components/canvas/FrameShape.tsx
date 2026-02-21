import { memo } from 'react'
import { Group, Rect, Text } from 'react-konva'
import Konva from 'konva'
import type { Socket } from 'socket.io-client'
import { FrameObject } from '@collabboard/shared'
import { useBoardStore } from '../../stores/boardStore'
import { useUIStore } from '../../stores/uiStore'
import { openTextEditor } from './useTextEdit'

interface Props {
  object: FrameObject
  boardId: string
  socketRef: React.MutableRefObject<Socket | null>
  isSelected: boolean
}

const LABEL_HEIGHT = 28

function FrameShape({ object, boardId, socketRef, isSelected }: Props) {
  const updateObject = useBoardStore(s => s.updateObject)
  const pushUndo = useBoardStore(s => s.pushUndo)
  const setSelectedObjectId = useUIStore(s => s.setSelectedObjectId)

  function onDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    const props = { x: e.target.x(), y: e.target.y() }
    updateObject(object.id, props)
    socketRef.current?.emit('object:update', { boardId, objectId: object.id, props })
  }

  function onDblClick() {
    openTextEditor({
      x: object.x,
      y: object.y - LABEL_HEIGHT,
      width: object.width,
      height: LABEL_HEIGHT,
      fontSize: 12,
      fill: '#64748b',
      currentText: object.title,
      onInput: (title) => {
        updateObject(object.id, { title } as any)
        socketRef.current?.emit('object:update', { boardId, objectId: object.id, props: { title } as any })
      },
      onCommit: (newTitle) => {
        if (!newTitle.trim() || newTitle === object.title) return
        pushUndo()
        const props = { title: newTitle.trim() }
        updateObject(object.id, props as any)
        socketRef.current?.emit('object:update', { boardId, objectId: object.id, props: props as any })
      },
    })
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
    >
      {/* Label background */}
      <Rect
        y={-LABEL_HEIGHT}
        width={object.width}
        height={LABEL_HEIGHT}
        fill={isSelected ? '#6366f1' : '#64748b'}
        cornerRadius={[4, 4, 0, 0]}
      />
      {/* Title text */}
      <Text
        y={-LABEL_HEIGHT}
        width={object.width}
        height={LABEL_HEIGHT}
        text={object.title}
        fill="#ffffff"
        fontSize={12}
        fontStyle="bold"
        padding={6}
        ellipsis
      />
      {/* Frame body */}
      <Rect
        width={object.width}
        height={object.height}
        fill="rgba(0,0,0,0.02)"
        stroke={isSelected ? '#6366f1' : '#cbd5e1'}
        strokeWidth={isSelected ? 2 : 1}
        dash={[8, 4]}
      />
    </Group>
  )
}

export default memo(FrameShape)
