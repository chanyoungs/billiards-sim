import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  BallDefinition,
  BallState,
  CueBallId,
  ShotControls,
  ShotPreview,
  TableGeometry,
  Vector2,
} from '../lib/sim/index.ts'

const OUTER_MARGIN = 0.18
const RAIL_MARGIN = 0.1

interface TopDownPlannerProps {
  table: TableGeometry
  balls: readonly BallState[]
  ballDefinitions: readonly BallDefinition[]
  activeCueBallId: CueBallId
  shotControls: ShotControls
  preview: ShotPreview
  status: 'aiming' | 'running'
  onPlaceCueBall: (position: Vector2) => void
}

export function TopDownPlanner({
  table,
  balls,
  ballDefinitions,
  activeCueBallId,
  shotControls,
  preview,
  status,
  onPlaceCueBall,
}: TopDownPlannerProps) {
  const definitionsById = useMemo(
    () => new Map(ballDefinitions.map((definition) => [definition.id, definition])),
    [ballDefinitions],
  )
  const activeCueBall = balls.find((ball) => ball.id === activeCueBallId) ?? null
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dragPointerId, setDragPointerId] = useState<number | null>(null)

  const viewBoxX = -OUTER_MARGIN
  const viewBoxY = -OUTER_MARGIN
  const viewBoxWidth = table.width + OUTER_MARGIN * 2
  const viewBoxHeight = table.height + OUTER_MARGIN * 2
  const aimLength = table.width * 0.3

  const updateCueBallFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current

      if (!svg) {
        return
      }

      const bounds = svg.getBoundingClientRect()

      if (bounds.width <= 0 || bounds.height <= 0) {
        return
      }

      const svgX = ((clientX - bounds.left) / bounds.width) * viewBoxWidth + viewBoxX
      const svgY = ((clientY - bounds.top) / bounds.height) * viewBoxHeight + viewBoxY

      onPlaceCueBall({ x: svgX, y: svgY })
    },
    [onPlaceCueBall, viewBoxHeight, viewBoxWidth, viewBoxX, viewBoxY],
  )

  useEffect(() => {
    if (dragPointerId === null || status === 'running') {
      return undefined
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragPointerId) {
        return
      }

      updateCueBallFromClient(event.clientX, event.clientY)
    }

    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerId !== dragPointerId) {
        return
      }

      setDragPointerId(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerEnd)
    window.addEventListener('pointercancel', handlePointerEnd)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
    }
  }, [dragPointerId, status, updateCueBallFromClient])

  return (
    <div className="planner-frame">
      <svg
        ref={svgRef}
        className="planner-svg"
        viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
        role="img"
        aria-label="Top-down billiards table planner"
      >
        <defs>
          <linearGradient id="planner-rail" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#3a2417" />
            <stop offset="100%" stopColor="#1c1009" />
          </linearGradient>
          <linearGradient id="planner-cloth" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#0d5a4b" />
            <stop offset="55%" stopColor="#0a4c3f" />
            <stop offset="100%" stopColor="#08362d" />
          </linearGradient>
          <radialGradient id="planner-ball-highlight" cx="35%" cy="28%" r="65%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.96)" />
            <stop offset="40%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>

        <rect
          className="planner-table planner-table--wood"
          x={-RAIL_MARGIN}
          y={-RAIL_MARGIN}
          width={table.width + RAIL_MARGIN * 2}
          height={table.height + RAIL_MARGIN * 2}
          rx={0.08}
        />
        <rect
          className="planner-table planner-table--cloth"
          x={0}
          y={0}
          width={table.width}
          height={table.height}
          rx={0.035}
        />

        <g className="planner-guides">
          <rect
            className="planner-guides__border"
            x={0.02}
            y={0.02}
            width={table.width - 0.04}
            height={table.height - 0.04}
            rx={0.03}
          />
          <line x1={table.width * 0.5} y1={0.06} x2={table.width * 0.5} y2={table.height - 0.06} />
          <circle cx={table.width * 0.5} cy={table.height * 0.5} r={table.ballRadius * 2.3} />
        </g>

        <g className="planner-paths">
          {preview.paths.map((path) =>
            path.segments.map((segment, index) => (
              <line
                key={`${path.ballId}-${segment.kind}-${index}`}
                className={`planner-path planner-path--${segment.kind}`}
                x1={segment.from.x}
                y1={segment.from.y}
                x2={segment.to.x}
                y2={segment.to.y}
              />
            )),
          )}
          {preview.paths.map((path) => {
            const lastPoint = path.points[path.points.length - 1]

            if (!lastPoint || path.points.length <= 1) {
              return null
            }

            return (
              <circle
                key={`${path.ballId}-endpoint`}
                className="planner-path planner-path--endpoint"
                cx={lastPoint.x}
                cy={lastPoint.y}
                r={table.ballRadius * 0.38}
              />
            )
          })}
        </g>

        {activeCueBall ? (
          <line
            className="planner-aim-line"
            x1={activeCueBall.position.x}
            y1={activeCueBall.position.y}
            x2={activeCueBall.position.x + Math.cos(shotControls.angle) * aimLength}
            y2={activeCueBall.position.y + Math.sin(shotControls.angle) * aimLength}
          />
        ) : null}

        <g className="planner-balls">
          {balls.map((ball) => {
            const definition = definitionsById.get(ball.id)

            if (!definition || !ball.inPlay) {
              return null
            }

            const isActiveCueBall = ball.id === activeCueBallId

            return (
              <g
                key={ball.id}
                className={`planner-ball${isActiveCueBall ? ' planner-ball--active' : ''}`}
                onPointerDown={(event) => {
                  if (!isActiveCueBall || status === 'running') {
                    return
                  }

                  setDragPointerId(event.pointerId)
                  updateCueBallFromClient(event.clientX, event.clientY)
                }}
              >
                {isActiveCueBall && status !== 'running' ? (
                  <circle
                    className="planner-ball__halo"
                    cx={ball.position.x}
                    cy={ball.position.y}
                    r={ball.radius * 1.72}
                  />
                ) : null}
                <circle
                  cx={ball.position.x}
                  cy={ball.position.y}
                  r={ball.radius}
                  fill={definition.skin.baseColor}
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth={0.006}
                />
                <circle
                  cx={ball.position.x - ball.radius * 0.18}
                  cy={ball.position.y - ball.radius * 0.2}
                  r={ball.radius * 0.44}
                  fill="url(#planner-ball-highlight)"
                  opacity={0.72}
                />
                {definition.skin.marker === 'ring' ? (
                  <circle
                    cx={ball.position.x}
                    cy={ball.position.y}
                    r={ball.radius * 0.46}
                    fill="none"
                    stroke={definition.skin.accentColor}
                    strokeWidth={0.011}
                  />
                ) : null}
                {definition.skin.marker === 'dot' ? (
                  <circle
                    cx={ball.position.x}
                    cy={ball.position.y}
                    r={ball.radius * 0.24}
                    fill={definition.skin.accentColor}
                  />
                ) : null}
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
