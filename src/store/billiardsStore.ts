import { create } from 'zustand'

import {
  applyCueBallPlacement,
  BALL_DEFINITIONS,
  clampImpactOffset,
  clamp01,
  createDefaultBallStates,
  createDefaultShotControls,
  CUE_BALL_IDS,
  DEFAULT_FOUR_BALL_LAYOUT,
  sampleSimulationFrame,
  simulateShot,
  TABLE_GEOMETRY,
  ZERO_VECTOR,
} from '../lib/sim/index.ts'
import type {
  BallDefinition,
  BallPlacement,
  BallState,
  CueBallId,
  ShotControls,
  ShotInput,
  ShotPreview,
  SimulationEvent,
  SimulationFrame,
  SimulationResult,
  TableGeometry,
  Vector2,
} from '../lib/sim/index.ts'

export type SimulationStatus = 'aiming' | 'running'

export interface ShotPlayback {
  elapsedSeconds: number
  durationSeconds: number
  stepSeconds: number
  frames: SimulationFrame[]
  events: SimulationEvent[]
  finalBalls: BallState[]
}

export interface BilliardsStoreState {
  table: TableGeometry
  ballDefinitions: readonly BallDefinition[]
  defaultLayout: readonly BallPlacement[]
  cueBallIds: readonly CueBallId[]
  activeCueBallId: CueBallId
  balls: BallState[]
  shotControls: ShotControls
  preview: ShotPreview
  status: SimulationStatus
  playback: ShotPlayback | null
  lastSimulation: SimulationResult | null
  setActiveCueBall: (cueBallId: CueBallId) => void
  setCueBallPosition: (position: Vector2) => void
  setAimAngle: (angle: number) => void
  setShotPower: (power: number) => void
  setImpactOffset: (impactOffset: Vector2) => void
  setShotControls: (patch: Partial<ShotControls>) => void
  regeneratePreview: () => void
  runShot: () => void
  stepShot: (deltaSeconds: number) => void
  stopShot: () => void
  resetTable: () => void
}

function createShotInput(
  cueBallId: CueBallId,
  shotControls: ShotControls,
): ShotInput {
  return {
    cueBallId,
    angle: shotControls.angle,
    power: clamp01(shotControls.power),
    impactOffset: clampImpactOffset(shotControls.impactOffset),
  }
}

function createPreview(
  balls: ReadonlyArray<BallState>,
  cueBallId: CueBallId,
  shotControls: ShotControls,
): ShotPreview {
  return simulateShot(balls, createShotInput(cueBallId, shotControls)).preview
}

function normalizeShotControls(
  currentControls: ShotControls,
  patch: Partial<ShotControls>,
): ShotControls {
  return {
    angle: patch.angle ?? currentControls.angle,
    power:
      patch.power === undefined ? currentControls.power : clamp01(patch.power),
    impactOffset:
      patch.impactOffset === undefined
        ? clampImpactOffset(currentControls.impactOffset)
        : clampImpactOffset(patch.impactOffset),
  }
}

function freezeBalls(balls: ReadonlyArray<BallState>): BallState[] {
  return balls.map((ball) => ({
    ...ball,
    position: { ...ball.position },
    velocity: { ...ZERO_VECTOR },
    spin: { side: 0, roll: 0 },
  }))
}

const initialBalls = createDefaultBallStates()
const initialShotControls = createDefaultShotControls()
const initialCueBallId: CueBallId = 'cue-white'

export const useBilliardsStore = create<BilliardsStoreState>((set, get) => ({
  table: TABLE_GEOMETRY,
  ballDefinitions: BALL_DEFINITIONS,
  defaultLayout: DEFAULT_FOUR_BALL_LAYOUT,
  cueBallIds: CUE_BALL_IDS,
  activeCueBallId: initialCueBallId,
  balls: initialBalls,
  shotControls: initialShotControls,
  preview: createPreview(initialBalls, initialCueBallId, initialShotControls),
  status: 'aiming',
  playback: null,
  lastSimulation: null,

  setActiveCueBall: (cueBallId) => {
    const state = get()

    if (state.status === 'running') {
      return
    }

    set({
      activeCueBallId: cueBallId,
      preview: createPreview(state.balls, cueBallId, state.shotControls),
    })
  },

  setCueBallPosition: (position) => {
    const state = get()

    if (state.status === 'running') {
      return
    }

    const balls = applyCueBallPlacement(state.balls, state.activeCueBallId, position)

    set({
      balls,
      preview: createPreview(balls, state.activeCueBallId, state.shotControls),
      playback: null,
    })
  },

  setAimAngle: (angle) => {
    const state = get()

    if (state.status === 'running') {
      return
    }

    const shotControls = {
      ...state.shotControls,
      angle,
    }

    set({
      shotControls,
      preview: createPreview(state.balls, state.activeCueBallId, shotControls),
    })
  },

  setShotPower: (power) => {
    const state = get()

    if (state.status === 'running') {
      return
    }

    const shotControls = {
      ...state.shotControls,
      power: clamp01(power),
    }

    set({
      shotControls,
      preview: createPreview(state.balls, state.activeCueBallId, shotControls),
    })
  },

  setImpactOffset: (impactOffset) => {
    const state = get()

    if (state.status === 'running') {
      return
    }

    const shotControls = {
      ...state.shotControls,
      impactOffset: clampImpactOffset(impactOffset),
    }

    set({
      shotControls,
      preview: createPreview(state.balls, state.activeCueBallId, shotControls),
    })
  },

  setShotControls: (patch) => {
    const state = get()

    if (state.status === 'running') {
      return
    }

    const shotControls = normalizeShotControls(state.shotControls, patch)

    set({
      shotControls,
      preview: createPreview(state.balls, state.activeCueBallId, shotControls),
    })
  },

  regeneratePreview: () => {
    const state = get()

    if (state.status === 'running') {
      return
    }

    set({
      preview: createPreview(state.balls, state.activeCueBallId, state.shotControls),
    })
  },

  runShot: () => {
    const state = get()

    if (state.status === 'running') {
      return
    }

    const shotInput = createShotInput(state.activeCueBallId, state.shotControls)

    if (shotInput.power <= 0) {
      set({
        preview: createPreview(state.balls, state.activeCueBallId, state.shotControls),
      })
      return
    }

    const simulation = simulateShot(state.balls, shotInput)

    set({
      status: 'running',
      balls: sampleSimulationFrame(simulation.frames, 0),
      preview: simulation.preview,
      playback: {
        elapsedSeconds: 0,
        durationSeconds: simulation.durationSeconds,
        stepSeconds: simulation.stepSeconds,
        frames: simulation.frames,
        events: simulation.events,
        finalBalls: simulation.finalBalls,
      },
      lastSimulation: simulation,
    })
  },

  stepShot: (deltaSeconds) => {
    const state = get()
    const playback = state.playback

    if (!playback) {
      return
    }

    const nextElapsed = Math.min(
      playback.elapsedSeconds + Math.max(0, deltaSeconds),
      playback.durationSeconds,
    )

    if (nextElapsed >= playback.durationSeconds) {
      const finalBalls = freezeBalls(playback.finalBalls)

      set({
        status: 'aiming',
        balls: finalBalls,
        playback: null,
        preview: createPreview(finalBalls, state.activeCueBallId, state.shotControls),
      })
      return
    }

    set({
      balls: sampleSimulationFrame(playback.frames, nextElapsed),
      playback: {
        ...playback,
        elapsedSeconds: nextElapsed,
      },
    })
  },

  stopShot: () => {
    const state = get()
    const playback = state.playback

    if (!playback) {
      return
    }

    const frozenBalls = freezeBalls(
      sampleSimulationFrame(playback.frames, playback.elapsedSeconds),
    )

    set({
      status: 'aiming',
      balls: frozenBalls,
      playback: null,
      preview: createPreview(frozenBalls, state.activeCueBallId, state.shotControls),
    })
  },

  resetTable: () => {
    const balls = createDefaultBallStates()
    const shotControls = createDefaultShotControls()

    set({
      activeCueBallId: initialCueBallId,
      balls,
      shotControls,
      preview: createPreview(balls, initialCueBallId, shotControls),
      status: 'aiming',
      playback: null,
      lastSimulation: null,
    })
  },
}))
