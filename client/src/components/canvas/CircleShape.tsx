import { memo } from 'react'
import { Group, Ellipse, Text } from 'react-konva'
import Konva from 'konva'
import type { Socket } from 'socket.io-client'
import { CircleObject } from '@collabboard/shared'
import { useBoardStore } from '../../stores/boardStore'
import { useUIStore } from '../../stores/uiStore'
import { openTextEditor } from './useTextEdit'
import { useStageRef } from './StageContext'

interface Props {
  object: CircleObject
  boardId: string
  socketRef: React.MutableRefObject<Socket | null>
  isSelected: boolean
}

function CircleShape({ object, boardId, socketRef, isSelected }: Props) {
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
    // Use inscribed square for the textarea (roughly 70% of diameter)
    const inset = object.width * 0.15
    openTextEditor({
      stageRef,
      x: object.x + inset,
      y: object.y + inset,
      width: object.width - inset * 2,
      height: object.height - inset * 2,
      fontSize: 14,
      fill: 'transparent',
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

  const rx = object.width / 2
  const ry = object.height / 2

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
      <Ellipse
        x={rx}
        y={ry}
        radiusX={rx}
        radiusY={ry}
        fill={object.fill}
        stroke={isSelected ? '#6366f1' : object.stroke}
        strokeWidth={isSelected ? 2 : object.stroke_width}
        shadowBlur={isSelected ? 10 : 0}
        shadowColor="rgba(99,102,241,0.4)"
      />
      {object.text ? (
        <Text
          x={0}
          y={0}
          width={object.width}
          height={object.height}
          text={object.text}
          fill="#ffffff"
          fontSize={14}
          align="center"
          verticalAlign="middle"
          padding={8}
          wrap="word"
        />
      ) : (
        <Text
          x={0}
          y={0}
          width={object.width}
          height={object.height}
          text="Double-click to add text"
          fill="rgba(255,255,255,0.25)"
          fontSize={12}
          align="center"
          verticalAlign="middle"
        />
      )}
    </Group>
  )
}

export default memo(CircleShape)
