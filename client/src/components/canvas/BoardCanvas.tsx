import { useRef, useCallback, useEffect, useState } from 'react'
import { Stage, Layer, Rect as KonvaRect } from 'react-konva'
import { getUser } from '../../hooks/useAuth'
import Konva from 'konva'
import type { Socket } from 'socket.io-client'
import { useBoardStore } from '../../stores/boardStore'
import { useUIStore } from '../../stores/uiStore'
import {
  StickyObject, RectObject, CircleObject, FrameObject,
  ConnectorObject, TextObject, ImageObject,
} from '@collabboard/shared'
import StickyNote from './StickyNote'
import RectShape from './RectShape'
import CircleShape from './CircleShape'
import FrameShape from './FrameShape'
import ConnectorLine from './ConnectorLine'
import TextShape from './TextShape'
import ImageShape from './ImageShape'
import CursorsLayer from './CursorsLayer'
import SelectionTransformer from './SelectionTransformer'

interface Props {
  boardId: string
  socketRef: React.MutableRefObject<Socket | null>
}

function newId() { return crypto.randomUUID() }

export default function BoardCanvas({ boardId, socketRef }: Props) {
  const stageRef = useRef<Konva.Stage>(null)
  const userId = getUser()?.userId || ''
  const { objects, addObject, pushUndo } = useBoardStore()
  const {
    activeTool, activeColor, setActiveTool,
    setSelectedObjectId, selectedIds, setSelectedIds,
    toggleSelectedId, clearSelection, fitRequest,
  } = useUIStore()

  const [pendingConnectorSource, setPendingConnectorSource] = useState<string | null>(null)
  const [stageSize, setStageSize] = useState({ width: window.innerWidth, height: window.innerHeight })

  // Drag-select state
  const isDragSelecting = useRef(false)
  const dragStartWorld = useRef<{ x: number; y: number } | null>(null)
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  useEffect(() => {
    if (activeTool !== 'connect') setPendingConnectorSource(null)
  }, [activeTool])

  // Keep stage size in sync with window
  useEffect(() => {
    const onResize = () => setStageSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!fitRequest || !stageRef.current) return
    const stage = stageRef.current

    // Calculate bounding box of all objects
    const allObjects = Array.from(objects.values()).filter(o => o.type !== 'connector')
    if (allObjects.length === 0) {
      stage.position({ x: 0, y: 0 })
      stage.scale({ x: 1, y: 1 })
      stage.batchDraw()
      return
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const obj of allObjects) {
      minX = Math.min(minX, obj.x)
      minY = Math.min(minY, obj.y)
      maxX = Math.max(maxX, obj.x + obj.width)
      maxY = Math.max(maxY, obj.y + obj.height)
    }

    const contentW = maxX - minX
    const contentH = maxY - minY
    const stageW = stage.width()
    const stageH = stage.height()
    const padding = 80 // px padding around content

    // Scale to fit with padding
    const scaleX = (stageW - padding * 2) / contentW
    const scaleY = (stageH - padding * 2) / contentH
    const newScale = Math.min(scaleX, scaleY, 2) // cap at 2x zoom

    // Center the content
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const newX = stageW / 2 - centerX * newScale
    const newY = stageH / 2 - centerY * newScale

    stage.scale({ x: newScale, y: newScale })
    stage.position({ x: newX, y: newY })
    stage.batchDraw()
  }, [fitRequest, objects])

  // Non-passive wheel for zoom
  useEffect(() => {
    const container = stageRef.current?.container()
    if (!container) return
    function handleWheel(e: WheelEvent) {
      e.preventDefault()
      const stage = stageRef.current!
      const oldScale = stage.scaleX()
      const pointer = stage.getPointerPosition()!
      const scaleBy = 1.05
      const newScale = e.deltaY < 0
        ? Math.min(oldScale * scaleBy, 5)
        : Math.max(oldScale / scaleBy, 0.1)
      const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
      }
      stage.scale({ x: newScale, y: newScale })
      stage.position({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      })
    }
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [])

  function getWorldPos(stage: Konva.Stage) {
    const pos = stage.getPointerPosition()!
    const transform = stage.getAbsoluteTransform().copy().invert()
    return transform.point(pos)
  }

  // Cursor sync
  const lastCursorRef = useRef(0)
  const onMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const now = Date.now()
    if (now - lastCursorRef.current < 16) return
    lastCursorRef.current = now
    const stage = stageRef.current
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    const worldPos = getWorldPos(stage)
    socketRef.current?.emit('cursor:move', { boardId, x: worldPos.x, y: worldPos.y })

    // Update drag selection box
    if (isDragSelecting.current && dragStartWorld.current) {
      const x = Math.min(dragStartWorld.current.x, worldPos.x)
      const y = Math.min(dragStartWorld.current.y, worldPos.y)
      const w = Math.abs(worldPos.x - dragStartWorld.current.x)
      const h = Math.abs(worldPos.y - dragStartWorld.current.y)
      if (w > 4 || h > 4) setSelectionBox({ x, y, w, h })
    }
  }, [boardId, socketRef])

  // Start drag-select on mousedown on empty canvas
  const onMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (activeTool !== 'select') return
    if (e.target !== stageRef.current) return
    if (e.evt.shiftKey) return
    const stage = stageRef.current!
    isDragSelecting.current = true
    dragStartWorld.current = getWorldPos(stage)
    setSelectionBox(null)
  }, [activeTool])

  // Finish drag-select on mouseup
  const onMouseUp = useCallback(() => {
    if (!isDragSelecting.current) return
    isDragSelecting.current = false

    if (selectionBox && (selectionBox.w > 4 || selectionBox.h > 4)) {
      const { x, y, w, h } = selectionBox
      const ids: string[] = []
      for (const obj of objects.values()) {
        if (obj.type === 'connector') continue
        const ox = obj.x, oy = obj.y, ow = obj.width, oh = obj.height
        if (ox < x + w && ox + ow > x && oy < y + h && oy + oh > y) {
          ids.push(obj.id)
        }
      }
      setSelectedIds(ids)
    }

    setSelectionBox(null)
    dragStartWorld.current = null
  }, [selectionBox, objects, setSelectedIds])

  // Stage click: object creation + connect tool + shift-click multi-select
  const onStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // ── Connect tool ──
    if (activeTool === 'connect') {
      let node: Konva.Node = e.target
      while (node && node !== (stageRef.current as unknown as Konva.Node)) {
        if (objects.has(node.id())) break
        const parent = node.getParent()
        if (!parent) break
        node = parent as Konva.Node
      }
      const clickedId = objects.has(node.id()) ? node.id() : null
      if (!clickedId) { setPendingConnectorSource(null); return }
      if (!pendingConnectorSource) {
        setPendingConnectorSource(clickedId)
      } else if (pendingConnectorSource !== clickedId) {
        pushUndo()
        const connector: ConnectorObject = {
          id: newId(), board_id: boardId, type: 'connector',
          from_id: pendingConnectorSource, to_id: clickedId,
          x: 0, y: 0, width: 0, height: 0, rotation: 0,
          z_index: objects.size,
          created_by: userId, updated_at: new Date().toISOString(),
          style: 'solid', color: activeColor || '#6366f1',
        }
        addObject(connector)
        socketRef.current?.emit('object:create', { boardId, object: connector })
        setPendingConnectorSource(null)
        setActiveTool('select')
      }
      return
    }

    // ── Shift-click on shape: toggle multi-select ──
    if (activeTool === 'select' && e.evt.shiftKey && e.target !== stageRef.current) {
      let node: Konva.Node = e.target
      while (node && node !== (stageRef.current as unknown as Konva.Node)) {
        if (objects.has(node.id())) break
        const parent = node.getParent()
        if (!parent) break
        node = parent as Konva.Node
      }
      if (objects.has(node.id())) { toggleSelectedId(node.id()); return }
    }

    // ── Click on empty canvas ──
    if (e.target !== stageRef.current) return

    const stage = stageRef.current!
    const { x, y } = getWorldPos(stage)

    if (activeTool === 'select') { clearSelection(); return }

    if (activeTool === 'sticky') {
      pushUndo()
      const obj: StickyObject = {
        id: newId(), board_id: boardId, type: 'sticky',
        x: x - 80, y: y - 50, width: 160, height: 100, rotation: 0,
        z_index: objects.size, created_by: userId, updated_at: new Date().toISOString(),
        text: '', color: activeColor, font_size: 16,
      }
      addObject(obj); socketRef.current?.emit('object:create', { boardId, object: obj })
      setActiveTool('select'); setSelectedObjectId(obj.id)
    }

    if (activeTool === 'rect') {
      pushUndo()
      const obj: RectObject = {
        id: newId(), board_id: boardId, type: 'rect',
        x: x - 75, y: y - 50, width: 150, height: 100, rotation: 0,
        z_index: objects.size, created_by: userId, updated_at: new Date().toISOString(),
        fill: activeColor, stroke: '#6366f1', stroke_width: 2,
      }
      addObject(obj); socketRef.current?.emit('object:create', { boardId, object: obj })
      setActiveTool('select'); setSelectedObjectId(obj.id)
    }

    if (activeTool === 'circle') {
      pushUndo()
      const obj: CircleObject = {
        id: newId(), board_id: boardId, type: 'circle',
        x: x - 75, y: y - 75, width: 150, height: 150, rotation: 0,
        z_index: objects.size, created_by: userId, updated_at: new Date().toISOString(),
        fill: activeColor, stroke: '#6366f1', stroke_width: 2,
      }
      addObject(obj); socketRef.current?.emit('object:create', { boardId, object: obj })
      setActiveTool('select'); setSelectedObjectId(obj.id)
    }

    if (activeTool === 'frame') {
      pushUndo()
      const obj: FrameObject = {
        id: newId(), board_id: boardId, type: 'frame',
        x: x - 200, y: y - 150, width: 400, height: 300, rotation: 0,
        z_index: objects.size, created_by: userId, updated_at: new Date().toISOString(),
        title: 'Frame', fill: 'rgba(255,255,255,0.03)',
      }
      addObject(obj); socketRef.current?.emit('object:create', { boardId, object: obj })
      setActiveTool('select'); setSelectedObjectId(obj.id)
    }

    if (activeTool === 'text') {
      pushUndo()
      const obj: TextObject = {
        id: newId(), board_id: boardId, type: 'text',
        x: x - 60, y: y - 12, width: 200, height: 40, rotation: 0,
        z_index: objects.size, created_by: userId, updated_at: new Date().toISOString(),
        text: '', color: '#ffffff', font_size: 16,
      }
      addObject(obj); socketRef.current?.emit('object:create', { boardId, object: obj })
      setActiveTool('select'); setSelectedObjectId(obj.id)
    }
  }, [
    activeTool, activeColor, boardId, objects, userId, addObject, pushUndo,
    socketRef, setActiveTool, setSelectedObjectId, pendingConnectorSource,
    toggleSelectedId, clearSelection,
  ])

  const objectList = Array.from(objects.values()).sort((a, b) => a.z_index - b.z_index)

  const cursorStyle = activeTool === 'pan' ? 'grab'
    : ['sticky', 'rect', 'circle', 'frame', 'text', 'connect'].includes(activeTool) ? 'crosshair'
    : 'default'

  return (
    <>
      {activeTool === 'connect' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-gray-900 border border-indigo-500 rounded-xl px-4 py-2 text-sm text-indigo-300 shadow-lg pointer-events-none">
          {pendingConnectorSource
            ? 'Now click the second shape to connect — or press Escape to cancel'
            : 'Click a shape to start a connector'}
        </div>
      )}

      {selectedIds.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-300 shadow-lg pointer-events-none">
          {selectedIds.length} objects selected · Delete to remove · Ctrl+D to duplicate
        </div>
      )}

      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        draggable={activeTool === 'pan'}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onClick={onStageClick}
        style={{ cursor: cursorStyle }}
      >
        <Layer>
          {objectList.map(obj => {
            const sel = selectedIds.includes(obj.id)
            if (obj.type === 'connector') return (
              <ConnectorLine key={obj.id} object={obj as ConnectorObject}
                boardId={boardId} socketRef={socketRef} isSelected={sel} />
            )
            if (obj.type === 'sticky') return (
              <StickyNote key={obj.id} object={obj as StickyObject}
                boardId={boardId} socketRef={socketRef} isSelected={sel} />
            )
            if (obj.type === 'rect') return (
              <RectShape key={obj.id} object={obj as RectObject}
                boardId={boardId} socketRef={socketRef} isSelected={sel} />
            )
            if (obj.type === 'circle') return (
              <CircleShape key={obj.id} object={obj as CircleObject}
                boardId={boardId} socketRef={socketRef} isSelected={sel} />
            )
            if (obj.type === 'frame') return (
              <FrameShape key={obj.id} object={obj as FrameObject}
                boardId={boardId} socketRef={socketRef} isSelected={sel} />
            )
            if (obj.type === 'text') return (
              <TextShape key={obj.id} object={obj as TextObject}
                boardId={boardId} socketRef={socketRef} isSelected={sel} />
            )
            if (obj.type === 'image') return (
              <ImageShape key={obj.id} object={obj as ImageObject}
                boardId={boardId} socketRef={socketRef} isSelected={sel} />
            )
            return null
          })}

          {/* Drag-select rubber band */}
          {selectionBox && (
            <KonvaRect
              x={selectionBox.x} y={selectionBox.y}
              width={selectionBox.w} height={selectionBox.h}
              fill="rgba(99,102,241,0.1)"
              stroke="#6366f1" strokeWidth={1} dash={[4, 4]}
              listening={false}
            />
          )}

          {/* Transformer — handles single or multi-select */}
          {selectedIds.length > 0 &&
            !selectedIds.every(id => objects.get(id)?.type === 'connector') && (
            <SelectionTransformer
              selectedIds={selectedIds.filter(id => objects.get(id)?.type !== 'connector')}
              boardId={boardId}
              socketRef={socketRef}
            />
          )}
        </Layer>

        <Layer listening={false}>
          <CursorsLayer />
        </Layer>
      </Stage>
    </>
  )
}
