import { memo } from 'react'
import { Arrow } from 'react-konva'
import type { Socket } from 'socket.io-client'
import { ConnectorObject } from '@collabboard/shared'
import { useBoardStore } from '../../stores/boardStore'

interface Props {
  object: ConnectorObject
  boardId: string
  socketRef: React.MutableRefObject<Socket | null>
  isSelected: boolean
}

function ConnectorLine({ object, isSelected }: Props) {
  const from = useBoardStore(s => s.objects.get(object.from_id))
  const to = useBoardStore(s => s.objects.get(object.to_id))
  if (!from || !to) return null

  const fromX = from.x + from.width / 2
  const fromY = from.y + from.height / 2
  const toX = to.x + to.width / 2
  const toY = to.y + to.height / 2

  return (
    <Arrow
      points={[fromX, fromY, toX, toY]}
      stroke={isSelected ? '#6366f1' : object.color}
      strokeWidth={isSelected ? 3 : 2}
      fill={isSelected ? '#6366f1' : object.color}
      dash={object.style === 'dashed' ? [8, 4] : undefined}
      pointerLength={12}
      pointerWidth={10}
      lineCap="round"
      lineJoin="round"
    />
  )
}

export default memo(ConnectorLine)
