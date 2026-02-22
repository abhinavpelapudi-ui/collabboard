import { memo } from 'react'
import Konva from 'konva'
import { Group, Rect, Text } from 'react-konva'
import type { Socket } from 'socket.io-client'
import { RectObject } from '@collabboard/shared'
import { useBoardStore } from '../../stores/boardStore'
import { useUIStore } from '../../stores/uiStore'
import { openTextEditor } from './useTextEdit'
import { useStageRef } from './StageContext'

interface Props {
  object: RectObject
  boardId: string
  socketRef: React.MutableRefObject<Socket | null>
  isSelected: boolean
}

function RectShape({ object, boardId, socketRef, isSelected }: Props) {
  const updateObject = useBoardStore(s => s.updateObject)
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
      fontSize: 14,
      fill: object.fill,
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
      <Rect
        width={object.width}
        height={object.height}
        fill={object.fill}
        stroke={isSelected ? '#6366f1' : object.stroke}
        strokeWidth={isSelected ? 2 : object.stroke_width}
        shadowBlur={isSelected ? 10 : 0}
        shadowColor="rgba(99,102,241,0.4)"
      />
      {object.text ? (
        <Text
          text={object.text}
          width={object.width}
          height={object.height}
          fill="#ffffff"
          fontSize={14}
          align="center"
          verticalAlign="middle"
          padding={8}
          wrap="word"
        />
      ) : (
        <Text
          text="Double-click to add text"
          width={object.width}
          height={object.height}
          fill="rgba(255,255,255,0.25)"
          fontSize={12}
          align="center"
          verticalAlign="middle"
        />
      )}
    </Group>
  )
}

export default memo(RectShape)
