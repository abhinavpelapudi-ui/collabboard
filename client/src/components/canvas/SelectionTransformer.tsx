import { memo, useEffect, useRef } from 'react'
import { Transformer } from 'react-konva'
import Konva from 'konva'
import type { Socket } from 'socket.io-client'
import { useBoardStore } from '../../stores/boardStore'

interface Props {
  selectedIds: string[]
  boardId: string
  socketRef: React.MutableRefObject<Socket | null>
}

function SelectionTransformer({ selectedIds, boardId, socketRef }: Props) {
  const transformerRef = useRef<Konva.Transformer>(null)
  const updateObject = useBoardStore(s => s.updateObject)

  useEffect(() => {
    if (!transformerRef.current) return
    const stage = transformerRef.current.getStage()
    if (!stage) return
    const nodes = selectedIds
      .map(id => stage.findOne(`#${id}`))
      .filter((n): n is Konva.Node => !!n)
    transformerRef.current.nodes(nodes)
    transformerRef.current.getLayer()?.batchDraw()
  }, [selectedIds])

  function onTransformEnd() {
    const nodes = transformerRef.current?.nodes() ?? []
    nodes.forEach(node => {
      const id = node.id()
      const props = {
        x: node.x(),
        y: node.y(),
        width: Math.max(20, node.width() * node.scaleX()),
        height: Math.max(20, node.height() * node.scaleY()),
        rotation: node.rotation(),
      }
      node.scaleX(1)
      node.scaleY(1)
      updateObject(id, props)
      socketRef.current?.emit('object:update', { boardId, objectId: id, props })
    })
  }

  if (selectedIds.length === 0) return null

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

export default memo(SelectionTransformer)
