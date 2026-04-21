export interface Vector2 {
  x: number
  y: number
}

export interface SpinState {
  side: number
  roll: number
}

export type BallId = 'cue-white' | 'cue-yellow' | 'object-red-1' | 'object-red-2'

export type CueBallId = 'cue-white' | 'cue-yellow'

export type BallRole = 'cue' | 'object'

export type RailId = 'left' | 'right' | 'top' | 'bottom'

export type SimulationEventType =
  | 'shot-start'
  | 'rail-bounce'
  | 'ball-collision'
  | 'settled'

export type PreviewSegmentKind = 'roll' | 'rail-bounce' | 'ball-collision'

export interface BallSkin {
  baseColor: string
  accentColor: string
  marker: 'solid' | 'dot' | 'ring'
}

export interface BallDefinition {
  id: BallId
  label: string
  role: BallRole
  cueEligible: boolean
  skin: BallSkin
}

export interface TableBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface TableGeometry {
  width: number
  height: number
  ballRadius: number
  ballDiameter: number
  bounds: TableBounds
}

export interface BallPlacement {
  id: BallId
  position: Vector2
}

export interface BallState {
  id: BallId
  position: Vector2
  velocity: Vector2
  spin: SpinState
  radius: number
  inPlay: boolean
}

export interface ShotControls {
  angle: number
  power: number
  impactOffset: Vector2
}

export interface ShotInput extends ShotControls {
  cueBallId: CueBallId
}

export interface SimulationEvent {
  type: SimulationEventType
  time: number
  point: Vector2
  ballId?: BallId
  otherBallId?: BallId
  rail?: RailId
}

export interface SimulationFrame {
  time: number
  balls: BallState[]
  events: SimulationEvent[]
}

export interface PreviewSegment {
  from: Vector2
  to: Vector2
  kind: PreviewSegmentKind
}

export interface PredictedPath {
  ballId: BallId
  points: Vector2[]
  segments: PreviewSegment[]
}

export interface ShotPreview {
  paths: PredictedPath[]
  durationSeconds: number
  totalEvents: number
}

export interface SimulationResult {
  initialBalls: BallState[]
  finalBalls: BallState[]
  frames: SimulationFrame[]
  events: SimulationEvent[]
  preview: ShotPreview
  durationSeconds: number
  settled: boolean
  stepSeconds: number
}

export interface SimulationConfig {
  stepSeconds: number
  maxDurationSeconds: number
  maxCollisionPasses: number
  stopSpeed: number
  linearDamping: number
  spinDamping: number
  rollInfluence: number
  railRestitution: number
  ballRestitution: number
  railSpinInfluence: number
  tangentCollisionDamping: number
  positionCorrection: number
  cueSpeed: number
  sideSpinStrength: number
  rollSpinStrength: number
  cueDeflection: number
  aimEpsilon: number
}
