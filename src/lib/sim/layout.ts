import { TABLE_GEOMETRY } from './constants.ts'
import type { BallPlacement, BallState, CueBallId, SpinState, Vector2 } from './types.ts'
import {
  add,
  clamp,
  cloneVector,
  distance,
  normalize,
  scale,
  sub,
  ZERO_VECTOR,
} from './vector.ts'

const ZERO_SPIN: SpinState = { side: 0, roll: 0 }

const cueColumnX = TABLE_GEOMETRY.width * 0.23
const objectColumnX = TABLE_GEOMETRY.width * 0.77
const verticalSpread = TABLE_GEOMETRY.ballDiameter * 1.75
const tableCenter = {
  x: TABLE_GEOMETRY.width * 0.5,
  y: TABLE_GEOMETRY.height * 0.5,
}

export const CUE_BALL_IDS: readonly CueBallId[] = ['cue-white', 'cue-yellow']

export const DEFAULT_FOUR_BALL_LAYOUT: readonly BallPlacement[] = [
  {
    id: 'cue-white',
    position: { x: cueColumnX, y: tableCenter.y - verticalSpread * 0.5 },
  },
  {
    id: 'cue-yellow',
    position: { x: cueColumnX, y: tableCenter.y + verticalSpread * 0.5 },
  },
  {
    id: 'object-red-1',
    position: { x: objectColumnX, y: tableCenter.y - verticalSpread * 0.5 },
  },
  {
    id: 'object-red-2',
    position: { x: objectColumnX, y: tableCenter.y + verticalSpread * 0.5 },
  },
]

export function cloneBallState(ball: BallState): BallState {
  return {
    id: ball.id,
    position: cloneVector(ball.position),
    velocity: cloneVector(ball.velocity),
    spin: { ...ball.spin },
    radius: ball.radius,
    inPlay: ball.inPlay,
  }
}

export function cloneBallStates(balls: ReadonlyArray<BallState>): BallState[] {
  return balls.map(cloneBallState)
}

export function clampPositionToTable(position: Vector2): Vector2 {
  return {
    x: clamp(position.x, TABLE_GEOMETRY.bounds.minX, TABLE_GEOMETRY.bounds.maxX),
    y: clamp(position.y, TABLE_GEOMETRY.bounds.minY, TABLE_GEOMETRY.bounds.maxY),
  }
}

export function createDefaultBallStates(): BallState[] {
  return DEFAULT_FOUR_BALL_LAYOUT.map(({ id, position }) => ({
    id,
    position: cloneVector(position),
    velocity: cloneVector(ZERO_VECTOR),
    spin: { ...ZERO_SPIN },
    radius: TABLE_GEOMETRY.ballRadius,
    inPlay: true,
  }))
}

export function resolveCueBallPlacement(
  cueBallId: CueBallId,
  desiredPosition: Vector2,
  balls: ReadonlyArray<BallState>,
): Vector2 {
  let resolved = clampPositionToTable(desiredPosition)
  const minimumSeparation = TABLE_GEOMETRY.ballDiameter + TABLE_GEOMETRY.ballRadius * 0.08

  for (let attempt = 0; attempt < 8; attempt += 1) {
    let adjusted = false

    for (const ball of balls) {
      if (!ball.inPlay || ball.id === cueBallId) {
        continue
      }

      const separation = distance(resolved, ball.position)

      if (separation >= minimumSeparation) {
        continue
      }

      const direction = normalize(sub(resolved, ball.position), normalize(sub(resolved, tableCenter)))

      resolved = clampPositionToTable(
        add(ball.position, scale(direction, minimumSeparation)),
      )
      adjusted = true
    }

    if (!adjusted) {
      break
    }
  }

  return resolved
}

export function applyCueBallPlacement(
  balls: ReadonlyArray<BallState>,
  cueBallId: CueBallId,
  desiredPosition: Vector2,
): BallState[] {
  const resolvedPosition = resolveCueBallPlacement(cueBallId, desiredPosition, balls)

  return balls.map((ball) => {
    if (ball.id !== cueBallId) {
      return cloneBallState(ball)
    }

    return {
      ...cloneBallState(ball),
      position: resolvedPosition,
      velocity: cloneVector(ZERO_VECTOR),
      spin: { ...ZERO_SPIN },
    }
  })
}
