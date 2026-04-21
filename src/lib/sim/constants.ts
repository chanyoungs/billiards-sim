import type {
  BallDefinition,
  ShotControls,
  SimulationConfig,
  TableGeometry,
} from './types.ts'

const BALL_RADIUS = 0.03075
const TABLE_WIDTH = 2.84
const TABLE_HEIGHT = 1.42

export const TABLE_GEOMETRY: TableGeometry = {
  width: TABLE_WIDTH,
  height: TABLE_HEIGHT,
  ballRadius: BALL_RADIUS,
  ballDiameter: BALL_RADIUS * 2,
  bounds: {
    minX: BALL_RADIUS,
    maxX: TABLE_WIDTH - BALL_RADIUS,
    minY: BALL_RADIUS,
    maxY: TABLE_HEIGHT - BALL_RADIUS,
  },
}

export const SIMULATION_CONFIG: SimulationConfig = {
  stepSeconds: 1 / 120,
  maxDurationSeconds: 18,
  maxCollisionPasses: 2,
  stopSpeed: 0.03,
  linearDamping: 0.9,
  spinDamping: 1.8,
  rollInfluence: 0.75,
  railRestitution: 0.92,
  ballRestitution: 0.985,
  railSpinInfluence: 0.18,
  tangentCollisionDamping: 0.08,
  positionCorrection: 0.9,
  cueSpeed: 6.2,
  sideSpinStrength: 1.25,
  rollSpinStrength: 1.35,
  cueDeflection: 0.1,
  aimEpsilon: 0.0001,
}

export const MAX_IMPACT_OFFSET = 0.8

export const BALL_DEFINITIONS: readonly BallDefinition[] = [
  {
    id: 'cue-white',
    label: 'White Cue',
    role: 'cue',
    cueEligible: true,
    skin: {
      baseColor: '#f5f3ed',
      accentColor: '#ddd7cd',
      marker: 'solid',
    },
  },
  {
    id: 'cue-yellow',
    label: 'Yellow Cue',
    role: 'cue',
    cueEligible: true,
    skin: {
      baseColor: '#f2cc38',
      accentColor: '#fff0a5',
      marker: 'ring',
    },
  },
  {
    id: 'object-red-1',
    label: 'Red One',
    role: 'object',
    cueEligible: false,
    skin: {
      baseColor: '#c92b34',
      accentColor: '#ffc0c5',
      marker: 'solid',
    },
  },
  {
    id: 'object-red-2',
    label: 'Red Two',
    role: 'object',
    cueEligible: false,
    skin: {
      baseColor: '#ad1924',
      accentColor: '#ffe3e6',
      marker: 'dot',
    },
  },
]

export function createDefaultShotControls(): ShotControls {
  return {
    angle: 0,
    power: 0.55,
    impactOffset: { x: 0, y: 0 },
  }
}
