import {
  MAX_IMPACT_OFFSET,
  SIMULATION_CONFIG,
  TABLE_GEOMETRY,
} from './constants.ts'
import { cloneBallStates } from './layout.ts'
import type {
  BallId,
  BallState,
  PredictedPath,
  PreviewSegmentKind,
  ShotInput,
  ShotPreview,
  SimulationConfig,
  SimulationEvent,
  SimulationFrame,
  SimulationResult,
  Vector2,
} from './types.ts'
import {
  add,
  angleToVector,
  clamp01,
  clampMagnitude,
  cloneVector,
  distance,
  dot,
  length,
  lengthSq,
  lerpVector,
  normalize,
  perp,
  scale,
  sub,
  ZERO_VECTOR,
} from './vector.ts'

const COLLISION_EPSILON = 1e-8
const RESTING_SPIN_EPSILON = 0.03
const PREVIEW_MOVEMENT_EPSILON = TABLE_GEOMETRY.ballRadius * 0.18
const PREVIEW_TURN_DOT = Math.cos(Math.PI / 18)

export function clampImpactOffset(offset: Vector2): Vector2 {
  return clampMagnitude(offset, MAX_IMPACT_OFFSET)
}

export function simulateShot(
  initialBalls: ReadonlyArray<BallState>,
  shotInput: ShotInput,
  overrides: Partial<SimulationConfig> = {},
): SimulationResult {
  const config: SimulationConfig = {
    ...SIMULATION_CONFIG,
    ...overrides,
  }
  const initialSnapshot = cloneBallStates(initialBalls)
  const balls = cloneBallStates(initialBalls)
  const events: SimulationEvent[] = []
  const cueBall = balls.find((ball) => ball.id === shotInput.cueBallId)
  const power = clamp01(shotInput.power)
  const impactOffset = clampImpactOffset(shotInput.impactOffset)

  if (cueBall && power > config.aimEpsilon) {
    const strike = createCueStrike(shotInput.angle, power, impactOffset, config)
    cueBall.velocity = strike.velocity
    cueBall.spin = strike.spin

    events.push({
      type: 'shot-start',
      time: 0,
      ballId: cueBall.id,
      point: cloneVector(cueBall.position),
    })
  }

  const frames: SimulationFrame[] = [
    {
      time: 0,
      balls: cloneBallStates(balls),
      events: [...events],
    },
  ]

  let settled = areAllBallsResting(balls, config.stopSpeed)
  let durationSeconds = 0
  const maxSteps = Math.ceil(config.maxDurationSeconds / config.stepSeconds)

  for (let stepIndex = 1; stepIndex <= maxSteps && !settled; stepIndex += 1) {
    const time = stepIndex * config.stepSeconds
    const stepEvents = advanceSimulation(balls, time, config)
    settled = areAllBallsResting(balls, config.stopSpeed)

    if (settled) {
      stepEvents.push({
        type: 'settled',
        time,
        point: cueBall ? cloneVector(cueBall.position) : cloneVector(ZERO_VECTOR),
      })
    }

    durationSeconds = time
    events.push(...stepEvents)
    frames.push({
      time,
      balls: cloneBallStates(balls),
      events: stepEvents,
    })
  }

  if (!settled && frames.length > 0) {
    durationSeconds = frames[frames.length - 1].time
  }

  return {
    initialBalls: initialSnapshot,
    finalBalls: cloneBallStates(balls),
    frames,
    events,
    preview: buildShotPreview(frames, durationSeconds),
    durationSeconds,
    settled,
    stepSeconds: config.stepSeconds,
  }
}

export function sampleSimulationFrame(
  frames: ReadonlyArray<SimulationFrame>,
  time: number,
): BallState[] {
  if (frames.length === 0) {
    return []
  }

  if (frames.length === 1 || time <= frames[0].time) {
    return cloneBallStates(frames[0].balls)
  }

  const lastFrame = frames[frames.length - 1]

  if (time >= lastFrame.time) {
    return cloneBallStates(lastFrame.balls)
  }

  let lowerIndex = 0

  for (let index = 0; index < frames.length - 1; index += 1) {
    if (frames[index + 1].time >= time) {
      lowerIndex = index
      break
    }
  }

  const lowerFrame = frames[lowerIndex]
  const upperFrame = frames[lowerIndex + 1]
  const frameSpan = upperFrame.time - lowerFrame.time
  const alpha = frameSpan > 0 ? (time - lowerFrame.time) / frameSpan : 0

  return lowerFrame.balls.map((ball, index) => {
    const nextBall = upperFrame.balls[index]

    return {
      id: ball.id,
      radius: ball.radius,
      inPlay: ball.inPlay,
      position: lerpVector(ball.position, nextBall.position, alpha),
      velocity: lerpVector(ball.velocity, nextBall.velocity, alpha),
      spin: {
        side: ball.spin.side + (nextBall.spin.side - ball.spin.side) * alpha,
        roll: ball.spin.roll + (nextBall.spin.roll - ball.spin.roll) * alpha,
      },
    }
  })
}

function createCueStrike(
  angle: number,
  power: number,
  impactOffset: Vector2,
  config: SimulationConfig,
): Pick<BallState, 'velocity' | 'spin'> {
  const direction = angleToVector(angle)
  const lateral = perp(direction)
  const offsetLength = length(impactOffset)
  const speedPenalty = 1 - 0.14 * (offsetLength / MAX_IMPACT_OFFSET)
  const shotSpeed = config.cueSpeed * Math.pow(power, 1.35) * speedPenalty

  return {
    velocity: add(
      scale(direction, shotSpeed),
      scale(lateral, shotSpeed * impactOffset.x * config.cueDeflection),
    ),
    spin: {
      side: impactOffset.x * config.sideSpinStrength,
      roll: impactOffset.y * config.rollSpinStrength,
    },
  }
}

function advanceSimulation(
  balls: BallState[],
  time: number,
  config: SimulationConfig,
): SimulationEvent[] {
  const stepEvents: SimulationEvent[] = []

  for (const ball of balls) {
    if (!ball.inPlay) {
      continue
    }

    applyMotion(ball, config)
    stepEvents.push(...resolveRailContacts(ball, time, config))
  }

  stepEvents.push(...resolveBallContacts(balls, time, config))

  return stepEvents
}

function applyMotion(ball: BallState, config: SimulationConfig): void {
  const speedSq = lengthSq(ball.velocity)

  if (speedSq > config.stopSpeed * config.stopSpeed * 0.0625) {
    const direction = normalize(ball.velocity)
    ball.velocity = add(
      ball.velocity,
      scale(direction, ball.spin.roll * config.rollInfluence * config.stepSeconds),
    )
  }

  const linearDecay = Math.exp(-config.linearDamping * config.stepSeconds)
  const spinDecay = Math.exp(-config.spinDamping * config.stepSeconds)

  ball.velocity = scale(ball.velocity, linearDecay)
  ball.spin = {
    side: ball.spin.side * spinDecay,
    roll: ball.spin.roll * spinDecay,
  }
  ball.position = add(ball.position, scale(ball.velocity, config.stepSeconds))

  stabilizeBall(ball, config)
}

function resolveRailContacts(
  ball: BallState,
  time: number,
  config: SimulationConfig,
): SimulationEvent[] {
  const events: SimulationEvent[] = []
  const minX = TABLE_GEOMETRY.bounds.minX
  const maxX = TABLE_GEOMETRY.bounds.maxX
  const minY = TABLE_GEOMETRY.bounds.minY
  const maxY = TABLE_GEOMETRY.bounds.maxY

  if (ball.position.x < minX && ball.velocity.x < 0) {
    const normalSpeed = Math.abs(ball.velocity.x)
    ball.position.x = minX
    ball.velocity.x = normalSpeed * config.railRestitution
    ball.velocity.y += ball.spin.side * normalSpeed * config.railSpinInfluence
    ball.spin.side *= -0.45
    events.push({
      type: 'rail-bounce',
      time,
      ballId: ball.id,
      rail: 'left',
      point: cloneVector(ball.position),
    })
  } else if (ball.position.x > maxX && ball.velocity.x > 0) {
    const normalSpeed = Math.abs(ball.velocity.x)
    ball.position.x = maxX
    ball.velocity.x = -normalSpeed * config.railRestitution
    ball.velocity.y += ball.spin.side * normalSpeed * config.railSpinInfluence
    ball.spin.side *= -0.45
    events.push({
      type: 'rail-bounce',
      time,
      ballId: ball.id,
      rail: 'right',
      point: cloneVector(ball.position),
    })
  }

  if (ball.position.y < minY && ball.velocity.y < 0) {
    const normalSpeed = Math.abs(ball.velocity.y)
    ball.position.y = minY
    ball.velocity.y = normalSpeed * config.railRestitution
    ball.velocity.x -= ball.spin.side * normalSpeed * config.railSpinInfluence
    ball.spin.side *= -0.45
    events.push({
      type: 'rail-bounce',
      time,
      ballId: ball.id,
      rail: 'top',
      point: cloneVector(ball.position),
    })
  } else if (ball.position.y > maxY && ball.velocity.y > 0) {
    const normalSpeed = Math.abs(ball.velocity.y)
    ball.position.y = maxY
    ball.velocity.y = -normalSpeed * config.railRestitution
    ball.velocity.x -= ball.spin.side * normalSpeed * config.railSpinInfluence
    ball.spin.side *= -0.45
    events.push({
      type: 'rail-bounce',
      time,
      ballId: ball.id,
      rail: 'bottom',
      point: cloneVector(ball.position),
    })
  }

  stabilizeBall(ball, config)

  return events
}

function resolveBallContacts(
  balls: BallState[],
  time: number,
  config: SimulationConfig,
): SimulationEvent[] {
  const events: SimulationEvent[] = []
  const reportedPairs = new Set<string>()

  for (let pass = 0; pass < config.maxCollisionPasses; pass += 1) {
    let collisionsThisPass = 0

    for (let leftIndex = 0; leftIndex < balls.length - 1; leftIndex += 1) {
      const leftBall = balls[leftIndex]

      if (!leftBall.inPlay) {
        continue
      }

      for (let rightIndex = leftIndex + 1; rightIndex < balls.length; rightIndex += 1) {
        const rightBall = balls[rightIndex]

        if (!rightBall.inPlay) {
          continue
        }

        const separation = sub(rightBall.position, leftBall.position)
        const targetDistance = leftBall.radius + rightBall.radius
        const actualDistanceSq = lengthSq(separation)

        if (actualDistanceSq > targetDistance * targetDistance) {
          continue
        }

        collisionsThisPass += 1
        const actualDistance = Math.sqrt(actualDistanceSq)
        const normal =
          actualDistance > COLLISION_EPSILON
            ? scale(separation, 1 / actualDistance)
            : fallbackCollisionNormal(leftBall, rightBall)
        const overlap = targetDistance - actualDistance + COLLISION_EPSILON
        const correction = scale(normal, overlap * config.positionCorrection * 0.5)

        leftBall.position = sub(leftBall.position, correction)
        rightBall.position = add(rightBall.position, correction)

        const relativeVelocity = sub(rightBall.velocity, leftBall.velocity)
        const normalSpeed = dot(relativeVelocity, normal)

        if (normalSpeed < 0) {
          const impulseMagnitude = (-(1 + config.ballRestitution) * normalSpeed) / 2
          const impulse = scale(normal, impulseMagnitude)

          leftBall.velocity = sub(leftBall.velocity, impulse)
          rightBall.velocity = add(rightBall.velocity, impulse)

          const tangent = perp(normal)
          const tangentSpeed = dot(relativeVelocity, tangent)
          const tangentImpulse = tangentSpeed * config.tangentCollisionDamping * 0.5
          const tangentVector = scale(tangent, tangentImpulse)

          leftBall.velocity = add(leftBall.velocity, tangentVector)
          rightBall.velocity = sub(rightBall.velocity, tangentVector)
          leftBall.spin.side += tangentSpeed * 0.03
          rightBall.spin.side -= tangentSpeed * 0.03
        }

        stabilizeBall(leftBall, config)
        stabilizeBall(rightBall, config)

        const pairKey = createPairKey(leftBall.id, rightBall.id)

        if (!reportedPairs.has(pairKey)) {
          reportedPairs.add(pairKey)
          events.push({
            type: 'ball-collision',
            time,
            ballId: leftBall.id,
            otherBallId: rightBall.id,
            point: scale(add(leftBall.position, rightBall.position), 0.5),
          })
        }
      }
    }

    if (collisionsThisPass === 0) {
      break
    }
  }

  return events
}

function fallbackCollisionNormal(leftBall: BallState, rightBall: BallState): Vector2 {
  const relativeVelocity = sub(rightBall.velocity, leftBall.velocity)

  if (lengthSq(relativeVelocity) > COLLISION_EPSILON) {
    return normalize(relativeVelocity)
  }

  return { x: 1, y: 0 }
}

function stabilizeBall(ball: BallState, config: SimulationConfig): void {
  if (lengthSq(ball.velocity) <= config.stopSpeed * config.stopSpeed) {
    ball.velocity = cloneVector(ZERO_VECTOR)
  }

  if (Math.abs(ball.spin.side) <= RESTING_SPIN_EPSILON) {
    ball.spin.side = 0
  }

  if (Math.abs(ball.spin.roll) <= RESTING_SPIN_EPSILON) {
    ball.spin.roll = 0
  }
}

function areAllBallsResting(
  balls: ReadonlyArray<BallState>,
  stopSpeed: number,
): boolean {
  return balls.every((ball) => {
    const velocityResting = lengthSq(ball.velocity) <= stopSpeed * stopSpeed
    const spinResting =
      Math.abs(ball.spin.side) <= RESTING_SPIN_EPSILON &&
      Math.abs(ball.spin.roll) <= RESTING_SPIN_EPSILON

    return velocityResting && spinResting
  })
}

function buildShotPreview(
  frames: ReadonlyArray<SimulationFrame>,
  durationSeconds: number,
): ShotPreview {
  if (frames.length === 0) {
    return {
      paths: [],
      durationSeconds,
      totalEvents: 0,
    }
  }

  const paths = frames[0].balls.map((ball) => buildPredictedPath(ball.id, frames))

  return {
    paths,
    durationSeconds,
    totalEvents: frames.reduce((count, frame) => count + frame.events.length, 0),
  }
}

function buildPredictedPath(
  ballId: BallId,
  frames: ReadonlyArray<SimulationFrame>,
): PredictedPath {
  const initialBall = getBallFromFrame(frames[0], ballId)

  if (!initialBall) {
    return {
      ballId,
      points: [],
      segments: [],
    }
  }

  const segments: PredictedPath['segments'] = []
  let segmentStart = cloneVector(initialBall.position)
  let segmentEnd = cloneVector(initialBall.position)
  let lastDirection: Vector2 | null = null

  for (let index = 1; index < frames.length; index += 1) {
    const previousBall = getBallFromFrame(frames[index - 1], ballId)
    const currentBall = getBallFromFrame(frames[index], ballId)

    if (!previousBall || !currentBall) {
      continue
    }

    const movement = sub(currentBall.position, previousBall.position)
    const travelled = length(movement)

    if (travelled < PREVIEW_MOVEMENT_EPSILON) {
      continue
    }

    const direction = normalize(movement)
    const segmentKind = getPreviewSegmentKind(frames[index].events, ballId)
    const turnedSharply = lastDirection !== null && dot(lastDirection, direction) < PREVIEW_TURN_DOT

    segmentEnd = cloneVector(currentBall.position)

    if (segmentKind || turnedSharply) {
      if (distance(segmentStart, segmentEnd) >= PREVIEW_MOVEMENT_EPSILON) {
        segments.push({
          from: cloneVector(segmentStart),
          to: cloneVector(segmentEnd),
          kind: segmentKind ?? 'roll',
        })
        segmentStart = cloneVector(segmentEnd)
      }
    }

    lastDirection = direction
  }

  if (distance(segmentStart, segmentEnd) >= PREVIEW_MOVEMENT_EPSILON) {
    segments.push({
      from: cloneVector(segmentStart),
      to: cloneVector(segmentEnd),
      kind: 'roll',
    })
  }

  const points =
    segments.length > 0
      ? [cloneVector(segments[0].from), ...segments.map((segment) => cloneVector(segment.to))]
      : [cloneVector(initialBall.position)]

  return {
    ballId,
    points,
    segments,
  }
}

function getBallFromFrame(
  frame: SimulationFrame,
  ballId: BallId,
): BallState | undefined {
  return frame.balls.find((ball) => ball.id === ballId)
}

function getPreviewSegmentKind(
  events: ReadonlyArray<SimulationEvent>,
  ballId: BallId,
): PreviewSegmentKind | null {
  for (const event of events) {
    const matchesBall = event.ballId === ballId || event.otherBallId === ballId

    if (!matchesBall) {
      continue
    }

    if (event.type === 'rail-bounce' || event.type === 'ball-collision') {
      return event.type
    }
  }

  return null
}

function createPairKey(leftId: BallId, rightId: BallId): string {
  return leftId < rightId ? `${leftId}:${rightId}` : `${rightId}:${leftId}`
}
