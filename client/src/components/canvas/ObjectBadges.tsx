import { Group, Circle, Text } from 'react-konva'
import { useBoardStore } from '../../stores/boardStore'
import { BoardObject } from '@collabboard/shared'

interface BadgesProps {
  object: BoardObject
}

/**
 * Renders comment count and attachment indicator badges at the top-right
 * corner of a canvas object. Uses Konva shapes.
 */
export function ObjectBadges({ object }: BadgesProps) {
  const commentCount = useBoardStore(s => s.commentCounts.get(object.id) ?? 0)
  const attachmentCount = ('attachments' in object ? (object.attachments?.length ?? 0) : 0)

  if (commentCount === 0 && attachmentCount === 0) return null
  if (object.width < 50 || object.height < 50) return null

  const BADGE_R = 10
  const GAP = 4
  let offsetFromRight = 0

  const badges: React.ReactNode[] = []

  // Comment count badge (rightmost, indigo)
  if (commentCount > 0) {
    const cx = object.width - BADGE_R - 2 - offsetFromRight
    const cy = -BADGE_R + 4
    badges.push(
      <Group key="cb" x={cx} y={cy} listening={false}>
        <Circle radius={BADGE_R} fill="#6366f1" />
        <Text
          x={-BADGE_R}
          y={-BADGE_R}
          width={BADGE_R * 2}
          height={BADGE_R * 2}
          text={commentCount > 99 ? '99+' : String(commentCount)}
          fill="#fff"
          fontSize={commentCount > 99 ? 7 : 10}
          fontStyle="bold"
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      </Group>
    )
    offsetFromRight += BADGE_R * 2 + GAP
  }

  // Attachment count badge (left of comment badge, green)
  if (attachmentCount > 0) {
    const cx = object.width - BADGE_R - 2 - offsetFromRight
    const cy = -BADGE_R + 4
    badges.push(
      <Group key="ab" x={cx} y={cy} listening={false}>
        <Circle radius={BADGE_R} fill="#10b981" />
        <Text
          x={-BADGE_R}
          y={-BADGE_R}
          width={BADGE_R * 2}
          height={BADGE_R * 2}
          text={String(attachmentCount)}
          fill="#fff"
          fontSize={10}
          fontStyle="bold"
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      </Group>
    )
  }

  return <>{badges}</>
}
