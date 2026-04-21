import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'

import './App.css'
import { MAX_IMPACT_OFFSET } from './lib/sim/index.ts'
import type { BallDefinition } from './lib/sim/index.ts'
import { useBilliardsStore } from './store/index.ts'
import { BilliardsScene } from './components/BilliardsScene.tsx'
import { TopDownPlanner } from './components/TopDownPlanner.tsx'

const DEGREES_PER_RADIAN = 180 / Math.PI
const RADIANS_PER_DEGREE = Math.PI / 180

function toSignedDegrees(angle: number): number {
  const rawDegrees = angle * DEGREES_PER_RADIAN

  return ((rawDegrees + 180) % 360 + 360) % 360 - 180
}

function formatDegrees(angle: number): string {
  return `${toSignedDegrees(angle).toFixed(1)}°`
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatMeters(value: number): string {
  return `${value.toFixed(2)} m`
}

function clampSignedUnit(value: number): number {
  return Math.max(-1, Math.min(1, value))
}

interface CueBallButtonProps {
  definition: BallDefinition
  active: boolean
  disabled: boolean
  onSelect: () => void
}

function CueBallButton({ definition, active, disabled, onSelect }: CueBallButtonProps) {
  return (
    <button
      className={`cue-toggle${active ? ' cue-toggle--active' : ''}`}
      type="button"
      disabled={disabled}
      onClick={onSelect}
    >
      <span
        className="cue-toggle__swatch"
        aria-hidden="true"
        style={{
          '--ball-base': definition.skin.baseColor,
          '--ball-accent': definition.skin.accentColor,
        } as CSSProperties}
      >
        <span className={`cue-toggle__marker cue-toggle__marker--${definition.skin.marker}`} />
      </span>
      <span className="cue-toggle__text">
        <strong>{definition.label}</strong>
        <small>{definition.skin.marker === 'ring' ? 'Ring cue' : 'Solid cue'}</small>
      </span>
    </button>
  )
}

function App() {
  const table = useBilliardsStore((state) => state.table)
  const ballDefinitions = useBilliardsStore((state) => state.ballDefinitions)
  const cueBallIds = useBilliardsStore((state) => state.cueBallIds)
  const activeCueBallId = useBilliardsStore((state) => state.activeCueBallId)
  const balls = useBilliardsStore((state) => state.balls)
  const shotControls = useBilliardsStore((state) => state.shotControls)
  const preview = useBilliardsStore((state) => state.preview)
  const status = useBilliardsStore((state) => state.status)
  const playback = useBilliardsStore((state) => state.playback)
  const lastSimulation = useBilliardsStore((state) => state.lastSimulation)
  const setActiveCueBall = useBilliardsStore((state) => state.setActiveCueBall)
  const setCueBallPosition = useBilliardsStore((state) => state.setCueBallPosition)
  const setAimAngle = useBilliardsStore((state) => state.setAimAngle)
  const setShotPower = useBilliardsStore((state) => state.setShotPower)
  const setImpactOffset = useBilliardsStore((state) => state.setImpactOffset)
  const runShot = useBilliardsStore((state) => state.runShot)
  const stepShot = useBilliardsStore((state) => state.stepShot)
  const stopShot = useBilliardsStore((state) => state.stopShot)
  const resetTable = useBilliardsStore((state) => state.resetTable)

  const definitionById = useMemo(
    () => new Map(ballDefinitions.map((definition) => [definition.id, definition])),
    [ballDefinitions],
  )

  const activeCueBall = balls.find((ball) => ball.id === activeCueBallId) ?? null
  const playbackProgress =
    playback && playback.durationSeconds > 0
      ? playback.elapsedSeconds / playback.durationSeconds
      : 0

  const impactPadRef = useRef<HTMLDivElement | null>(null)
  const [impactPointerId, setImpactPointerId] = useState<number | null>(null)

  useEffect(() => {
    if (status !== 'running') {
      return undefined
    }

    let animationFrameId = 0
    let previousTime: number | null = null

    const tick = (time: number) => {
      if (previousTime !== null) {
        stepShot((time - previousTime) / 1000)
      }

      previousTime = time
      animationFrameId = window.requestAnimationFrame(tick)
    }

    animationFrameId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [status, stepShot])

  useEffect(() => {
    if (impactPointerId === null || status === 'running') {
      return undefined
    }

    const updateImpactOffsetFromPointer = (clientX: number, clientY: number) => {
      const pad = impactPadRef.current

      if (!pad) {
        return
      }

      const bounds = pad.getBoundingClientRect()

      if (bounds.width <= 0 || bounds.height <= 0) {
        return
      }

      const normalizedX = clampSignedUnit(((clientX - bounds.left) / bounds.width) * 2 - 1)
      const normalizedY = clampSignedUnit(((clientY - bounds.top) / bounds.height) * 2 - 1)

      setImpactOffset({
        x: normalizedX * MAX_IMPACT_OFFSET,
        y: -normalizedY * MAX_IMPACT_OFFSET,
      })
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== impactPointerId) {
        return
      }

      updateImpactOffsetFromPointer(event.clientX, event.clientY)
    }

    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerId !== impactPointerId) {
        return
      }

      setImpactPointerId(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerEnd)
    window.addEventListener('pointercancel', handlePointerEnd)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
    }
  }, [impactPointerId, setImpactOffset, status])

  const previewCuePath =
    preview.paths.find((path) => path.ballId === activeCueBallId)?.segments.length ?? 0

  const handleImpactPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (status === 'running') {
      return
    }

    setImpactPointerId(event.pointerId)

    const bounds = event.currentTarget.getBoundingClientRect()
    const normalizedX = clampSignedUnit(((event.clientX - bounds.left) / bounds.width) * 2 - 1)
    const normalizedY = clampSignedUnit(((event.clientY - bounds.top) / bounds.height) * 2 - 1)

    setImpactOffset({
      x: normalizedX * MAX_IMPACT_OFFSET,
      y: -normalizedY * MAX_IMPACT_OFFSET,
    })
  }

  return (
    <main className="app-shell">
      <header className="hero-bar">
        <div>
          <p className="eyebrow">Korean four-ball simulator</p>
          <h1>Broadcast-style planning and shot playback</h1>
          <p className="hero-copy">
            Drag the active cue ball in the planner, set your line and english, then fire a
            fully simulated shot through the existing Zustand store.
          </p>
        </div>
        <div className="hero-metrics" aria-label="Session telemetry">
          <article className="hero-metric">
            <span>Status</span>
            <strong>{status === 'running' ? 'Shot running' : 'Ready to aim'}</strong>
          </article>
          <article className="hero-metric">
            <span>Preview time</span>
            <strong>{preview.durationSeconds.toFixed(2)} s</strong>
          </article>
          <article className="hero-metric">
            <span>Events</span>
            <strong>{preview.totalEvents}</strong>
          </article>
          <article className="hero-metric">
            <span>Table</span>
            <strong>
              {formatMeters(table.width)} × {formatMeters(table.height)}
            </strong>
          </article>
        </div>
      </header>

      <section className="dashboard" aria-label="Billiards simulator workspace">
        <div className="view-stack">
          <section className="surface surface--scene" aria-labelledby="scene-title">
            <div className="surface__header">
              <div>
                <p className="section-label">3D table</p>
                <h2 id="scene-title">Premium table presentation</h2>
              </div>
              <p className="surface__hint">
                Realistic table materials, cue alignment, live ball playback, and orbit camera.
              </p>
            </div>
            <div className="scene-frame">
              <BilliardsScene
                table={table}
                balls={balls}
                ballDefinitions={ballDefinitions}
                activeCueBallId={activeCueBallId}
                shotControls={shotControls}
                status={status}
              />
            </div>
          </section>

          <section className="surface surface--planner" aria-labelledby="planner-title">
            <div className="surface__header">
              <div>
                <p className="section-label">Planner</p>
                <h2 id="planner-title">Top-down shot map</h2>
              </div>
              <p className="surface__hint">
                {status === 'running'
                  ? 'Playback is live. Cue-ball dragging pauses until the shot settles.'
                  : 'Drag the selected cue ball to place it. Predicted tracks update instantly.'}
              </p>
            </div>
            <TopDownPlanner
              table={table}
              balls={balls}
              ballDefinitions={ballDefinitions}
              activeCueBallId={activeCueBallId}
              shotControls={shotControls}
              preview={preview}
              status={status}
              onPlaceCueBall={setCueBallPosition}
            />
            <div className="planner-legend" aria-label="Planner legend">
              <span>
                <i className="planner-legend__swatch planner-legend__swatch--roll" /> Roll
              </span>
              <span>
                <i className="planner-legend__swatch planner-legend__swatch--rail" /> Rail
                bounce
              </span>
              <span>
                <i className="planner-legend__swatch planner-legend__swatch--collision" /> Ball
                contact
              </span>
            </div>
          </section>
        </div>

        <aside className="inspector" aria-label="Shot controls and telemetry">
          <section className="surface control-surface">
            <div className="surface__header">
              <div>
                <p className="section-label">Cue selection</p>
                <h2>Ball in hand</h2>
              </div>
              <p className="surface__hint">Only the cue balls can be placed and played.</p>
            </div>

            <div className="cue-toggle-list">
              {cueBallIds.map((cueBallId) => {
                const definition = definitionById.get(cueBallId)

                if (!definition) {
                  return null
                }

                return (
                  <CueBallButton
                    key={cueBallId}
                    definition={definition}
                    active={cueBallId === activeCueBallId}
                    disabled={status === 'running'}
                    onSelect={() => setActiveCueBall(cueBallId)}
                  />
                )
              })}
            </div>
          </section>

          <section className="surface control-surface">
            <div className="surface__header">
              <div>
                <p className="section-label">Shot line</p>
                <h2>Aim and pace</h2>
              </div>
              <p className="surface__hint">The store regenerates the preview after every change.</p>
            </div>

            <div className="control-block">
              <label className="control-label" htmlFor="aim-angle">
                <span>Aim angle</span>
                <strong>{formatDegrees(shotControls.angle)}</strong>
              </label>
              <input
                id="aim-angle"
                className="slider"
                type="range"
                min={-180}
                max={180}
                step={0.1}
                value={toSignedDegrees(shotControls.angle)}
                disabled={status === 'running'}
                onChange={(event) => {
                  setAimAngle(Number(event.currentTarget.value) * RADIANS_PER_DEGREE)
                }}
              />
            </div>

            <div className="control-block">
              <label className="control-label" htmlFor="shot-power">
                <span>Shot power</span>
                <strong>{formatPercent(shotControls.power)}</strong>
              </label>
              <input
                id="shot-power"
                className="slider"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={shotControls.power}
                disabled={status === 'running'}
                onChange={(event) => {
                  setShotPower(Number(event.currentTarget.value))
                }}
              />
            </div>

            <div className="metric-grid metric-grid--compact">
              <article>
                <span>Predicted cue segments</span>
                <strong>{previewCuePath}</strong>
              </article>
              <article>
                <span>Playback progress</span>
                <strong>{formatPercent(playbackProgress)}</strong>
              </article>
            </div>
          </section>

          <section className="surface control-surface">
            <div className="surface__header">
              <div>
                <p className="section-label">Impact offset</p>
                <h2>English and strike point</h2>
              </div>
              <p className="surface__hint">
                Side english bends off the rail. Vertical offset changes roll through the hit.
              </p>
            </div>

            <div className="impact-layout">
              <div
                ref={impactPadRef}
                className={`impact-pad${status === 'running' ? ' impact-pad--disabled' : ''}`}
                role="presentation"
                onPointerDown={handleImpactPointerDown}
              >
                <span className="impact-pad__cross impact-pad__cross--horizontal" />
                <span className="impact-pad__cross impact-pad__cross--vertical" />
                <span className="impact-pad__ring impact-pad__ring--outer" />
                <span className="impact-pad__ring impact-pad__ring--inner" />
                <span
                  className="impact-pad__reticle"
                  style={{
                    left: `${((shotControls.impactOffset.x / MAX_IMPACT_OFFSET + 1) * 0.5) * 100}%`,
                    top: `${((1 - (shotControls.impactOffset.y / MAX_IMPACT_OFFSET + 1) * 0.5) * 100).toFixed(2)}%`,
                  }}
                />
              </div>

              <div className="impact-sliders">
                <div className="control-block">
                  <label className="control-label" htmlFor="side-spin">
                    <span>Side english</span>
                    <strong>{shotControls.impactOffset.x.toFixed(2)}</strong>
                  </label>
                  <input
                    id="side-spin"
                    className="slider"
                    type="range"
                    min={-MAX_IMPACT_OFFSET}
                    max={MAX_IMPACT_OFFSET}
                    step={0.01}
                    value={shotControls.impactOffset.x}
                    disabled={status === 'running'}
                    onChange={(event) => {
                      setImpactOffset({
                        x: Number(event.currentTarget.value),
                        y: shotControls.impactOffset.y,
                      })
                    }}
                  />
                </div>

                <div className="control-block">
                  <label className="control-label" htmlFor="vertical-spin">
                    <span>Vertical offset</span>
                    <strong>{shotControls.impactOffset.y.toFixed(2)}</strong>
                  </label>
                  <input
                    id="vertical-spin"
                    className="slider"
                    type="range"
                    min={-MAX_IMPACT_OFFSET}
                    max={MAX_IMPACT_OFFSET}
                    step={0.01}
                    value={shotControls.impactOffset.y}
                    disabled={status === 'running'}
                    onChange={(event) => {
                      setImpactOffset({
                        x: shotControls.impactOffset.x,
                        y: Number(event.currentTarget.value),
                      })
                    }}
                  />
                </div>

                <button
                  className="button button--secondary"
                  type="button"
                  disabled={status === 'running'}
                  onClick={() => setImpactOffset({ x: 0, y: 0 })}
                >
                  Recenter strike
                </button>
              </div>
            </div>
          </section>

          <section className="surface control-surface">
            <div className="surface__header">
              <div>
                <p className="section-label">Transport</p>
                <h2>Preview and play</h2>
              </div>
              <p className="surface__hint">
                Shot playback advances through the store&apos;s `stepShot` timeline.
              </p>
            </div>

            <div className="button-row">
              <button
                className="button button--primary"
                type="button"
                disabled={status === 'running' || shotControls.power <= 0}
                onClick={runShot}
              >
                Play shot
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={status !== 'running'}
                onClick={stopShot}
              >
                Freeze
              </button>
              <button className="button button--ghost" type="button" onClick={resetTable}>
                Reset table
              </button>
            </div>

            <div className="metric-grid">
              <article>
                <span>Preview duration</span>
                <strong>{preview.durationSeconds.toFixed(2)} s</strong>
              </article>
              <article>
                <span>Sim events</span>
                <strong>{lastSimulation?.events.length ?? preview.totalEvents}</strong>
              </article>
              <article>
                <span>Timeline frames</span>
                <strong>{playback?.frames.length ?? lastSimulation?.frames.length ?? 0}</strong>
              </article>
              <article>
                <span>Selected cue</span>
                <strong>{definitionById.get(activeCueBallId)?.label ?? activeCueBallId}</strong>
              </article>
              <article>
                <span>Cue position</span>
                <strong>
                  {activeCueBall
                    ? `${activeCueBall.position.x.toFixed(2)}, ${activeCueBall.position.y.toFixed(2)}`
                    : '—'}
                </strong>
              </article>
            </div>
          </section>

          <section className="surface control-surface">
            <div className="surface__header">
              <div>
                <p className="section-label">Table telemetry</p>
                <h2>Live ball positions</h2>
              </div>
              <p className="surface__hint">
                All coordinates and ball identities come straight from the simulation store.
              </p>
            </div>

            <div className="telemetry-list" role="list">
              {balls.map((ball) => {
                const definition = definitionById.get(ball.id)

                return (
                  <article key={ball.id} className="telemetry-card" role="listitem">
                    <div className="telemetry-card__title">
                      <span
                        className="telemetry-card__swatch"
                        aria-hidden="true"
                        style={{
                          '--ball-base': definition?.skin.baseColor ?? '#ffffff',
                          '--ball-accent': definition?.skin.accentColor ?? '#ffffff',
                        } as CSSProperties}
                      />
                      <div>
                        <strong>{definition?.label ?? ball.id}</strong>
                        <small>{ball.id === activeCueBallId ? 'Active cue ball' : ball.id}</small>
                      </div>
                    </div>
                    <dl>
                      <div>
                        <dt>X</dt>
                        <dd>{ball.position.x.toFixed(3)}</dd>
                      </div>
                      <div>
                        <dt>Y</dt>
                        <dd>{ball.position.y.toFixed(3)}</dd>
                      </div>
                      <div>
                        <dt>Speed</dt>
                        <dd>{Math.hypot(ball.velocity.x, ball.velocity.y).toFixed(3)}</dd>
                      </div>
                    </dl>
                  </article>
                )
              })}
            </div>
          </section>
        </aside>
      </section>

      <footer className="footer-note">
        Built on the existing Zustand store and sim modules. The visual layer is desktop-first,
        but the physics source of truth remains unchanged.
      </footer>
    </main>
  )
}

export default App
