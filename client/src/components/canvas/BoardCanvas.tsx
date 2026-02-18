import { useRef, useCallback, useEffect, useState } from 'react'
import { Stage, Layer } from 'react-konva'
import { getUser } from '../../hooks/useAuth'
import Konva from 'konva'
import type { Socket } from 'socket.io-client'
import { useBoardStore } from '../../stores/boardStore'
import { useUIStore } from '../../stores/uiStore'
import { StickyObject, RectObject, CircleObject, FrameObject, ConnectorObject } from '@collabboard/shared'
import StickyNote from './StickyNote'
import RectShape from './RectShape'
import CircleShape from './CircleShape'
import FrameShape from './FrameShape'
import ConnectorLine from './ConnectorLine'
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
  const { activeTool, activeColor, setActiveTool, setSelectedObjectId, selectedObjectId, fitRequest } = useUIStore()

  // Pending connector source — first shape clicked in connect mode
  const [pendingConnectorSource, setPendingConnectorSource] = useState<string | null>(null)

  // Clear pending source when switching away from connect tool
  useEffect(() => {
    if (activeTool !== 'connect') setPendingConnectorSource(null)
  }, [activeTool])

  // ─── fitRequest → reset canvas view so AI-created objects are visible ──────
  useEffect(() => {
    if (!fitRequest || !stageRef.current) return
    stageRef.current.position({ x: 0, y: 0 })
    stageRef.current.scale({ x: 1, y: 1 })
    stageRef.current.batchDraw()
  }, [fitRequest])

  // ─── Native non-passive wheel listener for zoom (React registers passive) ──
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

  // ─── Mouse move → cursor sync ─────────────────────────────────────────────
  const lastCursorRef = useRef(0)
  const onMouseMove = useCallback((_e: Konva.KonvaEventObject<MouseEvent>) => {
    const now = Date.now()
    if (now - lastCursorRef.current < 16) return
    lastCursorRef.current = now
    const stage = stageRef.current
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    const transform = stage.getAbsoluteTransform().copy().invert()
    const worldPos = transform.point(pos)
    socketRef.current?.emit('cursor:move', { boardId, x: worldPos.x, y: worldPos.y })
  }, [boardId, socketRef])

  // ─── Stage click → create object or connect ───────────────────────────────
  const onStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // ── Connect tool: intercept clicks on shapes ──────────────────────────
    if (activeTool === 'connect') {
      // Walk up from clicked node to find a board object (by ID in objects Map)
      let node: Konva.Node = e.target
      while (node && node !== (stageRef.current as unknown as Konva.Node)) {
        if (objects.has(node.id())) break
        const parent = node.getParent()
        if (!parent) break
        node = parent as Konva.Node
      }
      const clickedId = objects.has(node.id()) ? node.id() : null

      if (!clickedId) {
        // Clicked empty canvas — cancel pending source
        setPendingConnectorSource(null)
        return
      }

      if (!pendingConnectorSource) {
        // First click: set source
        setPendingConnectorSource(clickedId)
      } else if (pendingConnectorSource !== clickedId) {
        // Second click on a different shape: create connector
        pushUndo()
        const connector: ConnectorObject = {
          id: newId(), board_id: boardId, type: 'connector',
          from_id: pendingConnectorSource, to_id: clickedId,
          x: 0, y: 0, width: 0, height: 0, rotation: 0,
          z_index: objects.size,
          created_by: userId || '', updated_at: new Date().toISOString(),
          style: 'solid', color: activeColor || '#6366f1',
        }
        addObject(connector)
        socketRef.current?.emit('object:create', { boardId, object: connector })
        setPendingConnectorSource(null)
        setActiveTool('select')
      }
      return
    }

    if (e.target !== stageRef.current) return // clicked on an object

    const stage = stageRef.current!
    const pos = stage.getPointerPosition()!
    const transform = stage.getAbsoluteTransform().copy().invert()
    const { x, y } = transform.point(pos)

    if (activeTool === 'select') {
      setSelectedObjectId(null)
      return
    }

    if (activeTool === 'sticky') {
      pushUndo()
      const obj: StickyObject = {
        id: newId(), board_id: boardId, type: 'sticky',
        x: x - 100, y: y - 100, width: 200, height: 200,
        rotation: 0, z_index: objects.size,
        created_by: userId || '', updated_at: new Date().toISOString(),
        text: '', color: activeColor, font_size: 14,
      }
      addObject(obj)
      socketRef.current?.emit('object:create', { boardId, object: obj })
      setActiveTool('select')
      setSelectedObjectId(obj.id)
    }

    if (activeTool === 'rect') {
      pushUndo()
      const obj: RectObject = {
        id: newId(), board_id: boardId, type: 'rect',
        x: x - 75, y: y - 50, width: 150, height: 100,
        rotation: 0, z_index: objects.size,
        created_by: userId || '', updated_at: new Date().toISOString(),
        fill: activeColor, stroke: '#6366f1', stroke_width: 2,
      }
      addObject(obj)
      socketRef.current?.emit('object:create', { boardId, object: obj })
      setActiveTool('select')
      setSelectedObjectId(obj.id)
    }

    if (activeTool === 'circle') {
      pushUndo()
      const obj: CircleObject = {
        id: newId(), board_id: boardId, type: 'circle',
        x: x - 75, y: y - 75, width: 150, height: 150,
        rotation: 0, z_index: objects.size,
        created_by: userId || '', updated_at: new Date().toISOString(),
        fill: activeColor, stroke: '#6366f1', stroke_width: 2,
      }
      addObject(obj)
      socketRef.current?.emit('object:create', { boardId, object: obj })
      setActiveTool('select')
      setSelectedObjectId(obj.id)
    }

    if (activeTool === 'frame') {
      pushUndo()
      const obj: FrameObject = {
        id: newId(), board_id: boardId, type: 'frame',
        x: x - 200, y: y - 150, width: 400, height: 300,
        rotation: 0, z_index: objects.size,
        created_by: userId || '', updated_at: new Date().toISOString(),
        title: 'Frame', fill: 'rgba(255,255,255,0.03)',
      }
      addObject(obj)
      socketRef.current?.emit('object:create', { boardId, object: obj })
      setActiveTool('select')
      setSelectedObjectId(obj.id)
    }
  }, [activeTool, activeColor, boardId, objects, userId, addObject, pushUndo, socketRef, setActiveTool, setSelectedObjectId, pendingConnectorSource])

  const objectList = Array.from(objects.values()).sort((a, b) => a.z_index - b.z_index)

  const cursorStyle = activeTool === 'pan' ? 'grab'
    : ['sticky', 'rect', 'circle', 'frame', 'connect'].includes(activeTool) ? 'crosshair'
    : 'default'

  return (
    <>
      {/* Connect mode hint bar */}
      {activeTool === 'connect' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-gray-900 border border-indigo-500 rounded-xl px-4 py-2 text-sm text-indigo-300 shadow-lg pointer-events-none">
          {pendingConnectorSource
            ? 'Now click the second shape to connect — or press Escape to cancel'
            : 'Click a shape to start a connector'}
        </div>
      )}

      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight}
        draggable={activeTool === 'pan'}
        onMouseMove={onMouseMove}
        onClick={onStageClick}
        style={{ cursor: cursorStyle }}
      >
        {/* Objects layer */}
        <Layer>
          {objectList.map(obj => {
            if (obj.type === 'connector') return (
              <ConnectorLine
                key={obj.id}
                object={obj as ConnectorObject}
                boardId={boardId}
                socketRef={socketRef}
                isSelected={selectedObjectId === obj.id}
              />
            )
            if (obj.type === 'sticky') return (
              <StickyNote
                key={obj.id}
                object={obj as StickyObject}
                boardId={boardId}
                socketRef={socketRef}
                isSelected={selectedObjectId === obj.id}
              />
            )
            if (obj.type === 'rect') return (
              <RectShape
                key={obj.id}
                object={obj as RectObject}
                boardId={boardId}
                socketRef={socketRef}
                isSelected={selectedObjectId === obj.id}
              />
            )
            if (obj.type === 'circle') return (
              <CircleShape
                key={obj.id}
                object={obj as CircleObject}
                boardId={boardId}
                socketRef={socketRef}
                isSelected={selectedObjectId === obj.id}
              />
            )
            if (obj.type === 'frame') return (
              <FrameShape
                key={obj.id}
                object={obj as FrameObject}
                boardId={boardId}
                socketRef={socketRef}
                isSelected={selectedObjectId === obj.id}
              />
            )
            return null
          })}

          {/* Transformer for selected object (skip connectors) */}
          {selectedObjectId && objects.get(selectedObjectId)?.type !== 'connector' && (
            <SelectionTransformer
              selectedObjectId={selectedObjectId}
              boardId={boardId}
              socketRef={socketRef}
            />
          )}
        </Layer>

        {/* Cursors layer (non-interactive) */}
        <Layer listening={false}>
          <CursorsLayer />
        </Layer>
      </Stage>
    </>
  )
}
