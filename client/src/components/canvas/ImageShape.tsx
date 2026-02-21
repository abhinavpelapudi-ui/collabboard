import { memo, useEffect, useRef, useState } from 'react'
import { Group, Image, Rect } from 'react-konva'
import Konva from 'konva'
import type { Socket } from 'socket.io-client'
import { ImageObject } from '@collabboard/shared'
import { useBoardStore } from '../../stores/boardStore'
import { useUIStore } from '../../stores/uiStore'

interface Props {
  object: ImageObject
  boardId: string
  socketRef: React.MutableRefObject<Socket | null>
  isSelected: boolean
}

function ImageShape({ object, boardId, socketRef, isSelected }: Props) {
  const updateObject = useBoardStore(s => s.updateObject)
  const removeObject = useBoardStore(s => s.removeObject)
  const pushUndo = useBoardStore(s => s.pushUndo)
  const setSelectedObjectId = useUIStore(s => s.setSelectedObjectId)
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    const img = new window.Image()
    img.onload = () => setImage(img)
    img.onerror = () => setImage(null)
    img.src = object.src
  }, [object.src])

  function onDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    const props = { x: e.target.x(), y: e.target.y() }
    updateObject(object.id, props)
    socketRef.current?.emit('object:update', { boardId, objectId: object.id, props })
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
      onKeyDown={onKeyDown}
    >
      {/* Background placeholder while loading */}
      <Rect
        width={object.width}
        height={object.height}
        fill="#1e293b"
        cornerRadius={4}
        stroke={isSelected ? '#6366f1' : '#334155'}
        strokeWidth={isSelected ? 2 : 1}
      />
      {image && (
        <Image
          image={image}
          width={object.width}
          height={object.height}
          cornerRadius={4}
        />
      )}
    </Group>
  )
}

export default memo(ImageShape)
