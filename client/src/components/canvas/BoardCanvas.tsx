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

// Minimum canvas dimensions — grows dynamically to fit all objects
const MIN_CANVAS_WIDTH = 4000
const MIN_CANVAS_HEIGHT = 3000
const CANVAS_PADDING = 500 // extra space beyond outermost objects

function newId() { return crypto.randomUUID() }

export default function BoardCanvas({ boardId, socketRef }: Props) {
  const stageRef = useRef<Konva.Stage>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const userId = getUser()?.userId || ''
  const { objects, addObject, pushUndo } = useBoardStore()
  const {
    activeTool, activeColor, setActiveTool,
    setSelectedObjectId, selectedIds, setSelectedIds,
    toggleSelectedId, clearSelection, fitRequest,
  } = useUIStore()

  const [pendingConnectorSource, setPendingConnectorSource] = useState<string | null>(null)

  // Drag-select state
  const isDragSelecting = useRef(false)
  const dragStartWorld = useRef<{ x: number; y: number } | null>(null)
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  useEffect(() => {
    if (activeTool !== 'connect') setPendingConnectorSource(null)
  }, [activeTool])

  // Dynamic canvas size: expand to fit all objects (including negative coords)
  let minObjX = 0, minObjY = 0
  let maxObjX = 0, maxObjY = 0
  for (const obj of objects.values()) {
    if (obj.type === 'connector') continue
    minObjX = Math.min(minObjX, obj.x)
    minObjY = Math.min(minObjY, obj.y)
    maxObjX = Math.max(maxObjX, obj.x + obj.width)
    maxObjY = Math.max(maxObjY, obj.y + obj.height)
  }
  // Offset to shift negative-coordinate objects into visible space
  const offsetX = minObjX < 0 ? Math.abs(minObjX) + CANVAS_PADDING : 0
  const offsetY = minObjY < 0 ? Math.abs(minObjY) + CANVAS_PADDING : 0

  const canvasWidth = Math.max(MIN_CANVAS_WIDTH, maxObjX + offsetX + CANVAS_PADDING)
  const canvasHeight = Math.max(MIN_CANVAS_HEIGHT, maxObjY + offsetY + CANVAS_PADDING)

  // Fit-to-view: scroll the container to center all objects
  useEffect(() => {
    if (!fitRequest || !containerRef.current) return
    const container = containerRef.current

    const allObjects = Array.from(objects.values()).filter(o => o.type !== 'connector')
    if (allObjects.length === 0) {
      // Center the canvas in the viewport
      container.scrollLeft = (MIN_CANVAS_WIDTH - container.clientWidth) / 2
      container.scrollTop = (MIN_CANVAS_HEIGHT - container.clientHeight) / 2
      return
    }

    // Calculate bounding box of all objects
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const obj of allObjects) {
      minX = Math.min(minX, obj.x)
      minY = Math.min(minY, obj.y)
      maxX = Math.max(maxX, obj.x + obj.width)
      maxY = Math.max(maxY, obj.y + obj.height)
    }

    // Scroll to center the content bounding box in the viewport (account for layer offset)
    const centerX = (minX + maxX) / 2 + offsetX
    const centerY = (minY + maxY) / 2 + offsetY
    container.scrollLeft = centerX - container.clientWidth / 2
    container.scrollTop = centerY - container.clientHeight / 2
  }, [fitRequest, objects, offsetX, offsetY])

  // Get pointer position in world coordinates (subtract layer offset)
  function getWorldPos(stage: Konva.Stage) {
    const pos = stage.getPointerPosition()!
    return { x: pos.x - offsetX, y: pos.y - offsetY }
  }

  // Cursor sync
  const lastCursorRef = useRef(0)
  const onMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const now = Date.now()
    if (now - lastCursorRef.current < 16) return
    lastCursorRef.current = now
    const stage = stageRef.current
    if (!stage) return
    const rawPos = stage.getPointerPosition()
    if (!rawPos) return
    const pos = { x: rawPos.x - offsetX, y: rawPos.y - offsetY }
    socketRef.current?.emit('cursor:move', { boardId, x: pos.x, y: pos.y })

    // Update drag selection box
    if (isDragSelecting.current && dragStartWorld.current) {
      const x = Math.min(dragStartWorld.current.x, pos.x)
      const y = Math.min(dragStartWorld.current.y, pos.y)
      const w = Math.abs(pos.x - dragStartWorld.current.x)
      const h = Math.abs(pos.y - dragStartWorld.current.y)
      if (w > 4 || h > 4) setSelectionBox({ x, y, w, h })
    }
  }, [boardId, socketRef, offsetX, offsetY])

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
        text: '', color: '#0f172a', font_size: 16,
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

  const cursorStyle = ['sticky', 'rect', 'circle', 'frame', 'text', 'connect'].includes(activeTool)
    ? 'crosshair'
    : 'default'

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto"
      style={{ background: '#f9fafb', overscrollBehavior: 'contain' }}
    >
      {activeTool === 'connect' && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 bg-surface-raised border border-indigo-500 rounded-xl px-4 py-2 text-sm text-indigo-600 shadow-lg pointer-events-none">
          {pendingConnectorSource
            ? 'Now click the second shape to connect — or press Escape to cancel'
            : 'Click a shape to start a connector'}
        </div>
      )}

      {selectedIds.length > 1 && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 bg-surface-raised border border-surface-border rounded-xl px-4 py-2 text-sm text-slate-600 shadow-lg pointer-events-none">
          {selectedIds.length} objects selected · Delete to remove · Ctrl+D to duplicate
        </div>
      )}

      <Stage
        ref={stageRef}
        width={canvasWidth}
        height={canvasHeight}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onClick={onStageClick}
        style={{ cursor: cursorStyle }}
      >
        <Layer offsetX={-offsetX} offsetY={-offsetY}>
          {/* Canvas background */}
          <KonvaRect
            x={-offsetX} y={-offsetY}
            width={canvasWidth} height={canvasHeight}
            fill="#f9fafb"
            listening={false}
          />

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

        <Layer listening={false} offsetX={-offsetX} offsetY={-offsetY}>
          <CursorsLayer />
        </Layer>
      </Stage>
    </div>
  )
}
