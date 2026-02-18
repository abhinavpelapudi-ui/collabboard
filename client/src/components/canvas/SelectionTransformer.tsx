import { useEffect, useRef } from 'react'
import { Transformer } from 'react-konva'
import Konva from 'konva'
import type { Socket } from 'socket.io-client'
import { useBoardStore } from '../../stores/boardStore'
import { useUIStore } from '../../stores/uiStore'

interface Props {
  selectedObjectId: string
  boardId: string
  socketRef: React.MutableRefObject<Socket | null>
}

export default function SelectionTransformer({ selectedObjectId, boardId, socketRef }: Props) {
  const transformerRef = useRef<Konva.Transformer>(null)
  const { updateObject, removeObject, pushUndo } = useBoardStore()
  const { setSelectedObjectId } = useUIStore()

  useEffect(() => {
    if (!transformerRef.current) return
    const stage = transformerRef.current.getStage()
    if (!stage) return
    const node = stage.findOne(`#${selectedObjectId}`)
    if (node) {
      transformerRef.current.nodes([node])
      transformerRef.current.getLayer()?.batchDraw()
    }
  }, [selectedObjectId])

  // Delete key on transformer
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObjectId) {
        const focused = document.activeElement
        // Only delete when canvas or body has focus — not any UI element
        const onCanvas = !focused || focused === document.body || focused.tagName === 'CANVAS'
        if (!onCanvas) return
        pushUndo()
        removeObject(selectedObjectId)
        socketRef.current?.emit('object:delete', { boardId, objectId: selectedObjectId })
        setSelectedObjectId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedObjectId, boardId, pushUndo, removeObject, socketRef, setSelectedObjectId])

  function onTransformEnd(e: Konva.KonvaEventObject<Event>) {
    const node = e.target
    const props = {
      x: node.x(),
      y: node.y(),
      width: Math.max(20, node.width() * node.scaleX()),
      height: Math.max(20, node.height() * node.scaleY()),
      rotation: node.rotation(),
    }
    node.scaleX(1)
    node.scaleY(1)
    updateObject(selectedObjectId, props)
    socketRef.current?.emit('object:update', { boardId, objectId: selectedObjectId, props })
  }

  return (
    <Transformer
      ref={transformerRef}
      onTransformEnd={onTransformEnd}
      boundBoxFunc={(oldBox, newBox) => {
        if (newBox.width < 20 || newBox.height < 20) return oldBox
        return newBox
      }}
    />
  )
}
