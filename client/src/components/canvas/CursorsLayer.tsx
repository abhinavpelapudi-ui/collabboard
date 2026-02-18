import { Group, Circle, Text } from 'react-konva'
import { useCursorStore } from '../../stores/cursorStore'

export default function CursorsLayer() {
  const { cursors } = useCursorStore()

  return (
    <>
      {Array.from(cursors.values()).map(cursor => (
        <Group key={cursor.userId} x={cursor.x} y={cursor.y}>
          {/* Cursor dot */}
          <Circle radius={5} fill={cursor.userColor} />
          {/* Name label */}
          <Text
            text={cursor.userName}
            fontSize={12}
            fill="#fff"
            x={10}
            y={-6}
            padding={3}
          />
        </Group>
      ))}
    </>
  )
}
