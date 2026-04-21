import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import { Vector3 } from 'three'

import type {
  BallDefinition,
  BallState,
  CueBallId,
  ShotControls,
  TableGeometry,
} from '../lib/sim/index.ts'

const TABLE_MODEL = {
  baseHeight: 0.18,
  clothHeight: 0.032,
  railHeight: 0.11,
  railWidth: 0.14,
  cueLength: 1.42,
  cueGap: 0.14,
}

interface BilliardsSceneProps {
  table: TableGeometry
  balls: readonly BallState[]
  ballDefinitions: readonly BallDefinition[]
  activeCueBallId: CueBallId
  shotControls: ShotControls
  status: 'aiming' | 'running'
}

function toScenePosition(position: BallState['position'], table: TableGeometry): [number, number, number] {
  return [position.x - table.width * 0.5, table.ballRadius, position.y - table.height * 0.5]
}

function TableModel({ table }: { table: TableGeometry }) {
  const tableWidth = table.width
  const tableHeight = table.height
  const outerWidth = tableWidth + TABLE_MODEL.railWidth * 2.4
  const outerHeight = tableHeight + TABLE_MODEL.railWidth * 2.4
  const cushionThickness = TABLE_MODEL.railWidth * 0.48
  const sightInset = TABLE_MODEL.railWidth * 0.68
  const sightRadius = table.ballRadius * 0.1
  const topRailZ = tableHeight * 0.5 + TABLE_MODEL.railWidth * 0.58
  const sideRailX = tableWidth * 0.5 + TABLE_MODEL.railWidth * 0.58

  const longSightOffsets = [-0.96, -0.48, 0, 0.48, 0.96].map(
    (offset) => (offset * tableWidth) / 2.2,
  )
  const shortSightOffsets = [-0.56, 0, 0.56].map((offset) => (offset * tableHeight) / 2.2)

  return (
    <group>
      <mesh position={[0, -TABLE_MODEL.baseHeight * 0.72, 0]} receiveShadow castShadow>
        <boxGeometry args={[outerWidth, TABLE_MODEL.baseHeight, outerHeight]} />
        <meshStandardMaterial color="#22150d" roughness={0.48} metalness={0.08} />
      </mesh>

      <mesh position={[0, -TABLE_MODEL.baseHeight * 0.12, 0]} receiveShadow>
        <boxGeometry args={[tableWidth, TABLE_MODEL.clothHeight, tableHeight]} />
        <meshStandardMaterial color="#0a5a49" roughness={0.96} metalness={0.04} />
      </mesh>

      <mesh position={[0, TABLE_MODEL.railHeight * 0.12, topRailZ]} receiveShadow castShadow>
        <boxGeometry args={[outerWidth, TABLE_MODEL.railHeight, TABLE_MODEL.railWidth]} />
        <meshStandardMaterial color="#3d2617" roughness={0.4} metalness={0.12} />
      </mesh>
      <mesh position={[0, TABLE_MODEL.railHeight * 0.12, -topRailZ]} receiveShadow castShadow>
        <boxGeometry args={[outerWidth, TABLE_MODEL.railHeight, TABLE_MODEL.railWidth]} />
        <meshStandardMaterial color="#3d2617" roughness={0.4} metalness={0.12} />
      </mesh>
      <mesh position={[sideRailX, TABLE_MODEL.railHeight * 0.12, 0]} receiveShadow castShadow>
        <boxGeometry args={[TABLE_MODEL.railWidth, TABLE_MODEL.railHeight, outerHeight]} />
        <meshStandardMaterial color="#3d2617" roughness={0.4} metalness={0.12} />
      </mesh>
      <mesh position={[-sideRailX, TABLE_MODEL.railHeight * 0.12, 0]} receiveShadow castShadow>
        <boxGeometry args={[TABLE_MODEL.railWidth, TABLE_MODEL.railHeight, outerHeight]} />
        <meshStandardMaterial color="#3d2617" roughness={0.4} metalness={0.12} />
      </mesh>

      <mesh position={[0, TABLE_MODEL.railHeight * 0.08, tableHeight * 0.5 - cushionThickness * 0.55]}>
        <boxGeometry args={[tableWidth - 0.04, TABLE_MODEL.railHeight * 0.74, cushionThickness]} />
        <meshStandardMaterial color="#124b3d" roughness={0.88} metalness={0.05} />
      </mesh>
      <mesh position={[0, TABLE_MODEL.railHeight * 0.08, -tableHeight * 0.5 + cushionThickness * 0.55]}>
        <boxGeometry args={[tableWidth - 0.04, TABLE_MODEL.railHeight * 0.74, cushionThickness]} />
        <meshStandardMaterial color="#124b3d" roughness={0.88} metalness={0.05} />
      </mesh>
      <mesh position={[tableWidth * 0.5 - cushionThickness * 0.55, TABLE_MODEL.railHeight * 0.08, 0]}>
        <boxGeometry args={[cushionThickness, TABLE_MODEL.railHeight * 0.74, tableHeight - 0.04]} />
        <meshStandardMaterial color="#124b3d" roughness={0.88} metalness={0.05} />
      </mesh>
      <mesh position={[-tableWidth * 0.5 + cushionThickness * 0.55, TABLE_MODEL.railHeight * 0.08, 0]}>
        <boxGeometry args={[cushionThickness, TABLE_MODEL.railHeight * 0.74, tableHeight - 0.04]} />
        <meshStandardMaterial color="#124b3d" roughness={0.88} metalness={0.05} />
      </mesh>

      {longSightOffsets.map((offset, index) => (
        <group key={`long-sight-${index}`}>
          <mesh position={[offset, TABLE_MODEL.railHeight * 0.62, topRailZ - sightInset]}>
            <cylinderGeometry args={[sightRadius, sightRadius, 0.02, 18]} />
            <meshStandardMaterial color="#d5a95c" roughness={0.32} metalness={0.78} />
          </mesh>
          <mesh position={[offset, TABLE_MODEL.railHeight * 0.62, -topRailZ + sightInset]}>
            <cylinderGeometry args={[sightRadius, sightRadius, 0.02, 18]} />
            <meshStandardMaterial color="#d5a95c" roughness={0.32} metalness={0.78} />
          </mesh>
        </group>
      ))}
      {shortSightOffsets.map((offset, index) => (
        <group key={`short-sight-${index}`}>
          <mesh position={[sideRailX - sightInset, TABLE_MODEL.railHeight * 0.62, offset]}>
            <cylinderGeometry args={[sightRadius, sightRadius, 0.02, 18]} />
            <meshStandardMaterial color="#d5a95c" roughness={0.32} metalness={0.78} />
          </mesh>
          <mesh position={[-sideRailX + sightInset, TABLE_MODEL.railHeight * 0.62, offset]}>
            <cylinderGeometry args={[sightRadius, sightRadius, 0.02, 18]} />
            <meshStandardMaterial color="#d5a95c" roughness={0.32} metalness={0.78} />
          </mesh>
        </group>
      ))}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]} receiveShadow>
        <planeGeometry args={[7, 7]} />
        <meshStandardMaterial color="#091014" roughness={1} metalness={0} />
      </mesh>
    </group>
  )
}

function BallMesh({
  ball,
  definition,
  table,
}: {
  ball: BallState
  definition: BallDefinition
  table: TableGeometry
}) {
  const meshRef = useRef<Mesh | null>(null)
  const rotationAxis = useMemo(() => new Vector3(), [])

  useFrame((_, delta) => {
    const mesh = meshRef.current

    if (!mesh) {
      return
    }

    const speed = Math.hypot(ball.velocity.x, ball.velocity.y)

    if (speed <= 0.0001) {
      return
    }

    rotationAxis.set(ball.velocity.y, 0, -ball.velocity.x)

    if (rotationAxis.lengthSq() <= 0.000001) {
      return
    }

    rotationAxis.normalize()
    mesh.rotateOnWorldAxis(rotationAxis, (speed / ball.radius) * delta * 0.92)
  })

  return (
    <group position={toScenePosition(ball.position, table)}>
      <mesh ref={meshRef} castShadow receiveShadow>
        <sphereGeometry args={[ball.radius, 48, 48]} />
        <meshPhysicalMaterial
          color={definition.skin.baseColor}
          roughness={0.24}
          metalness={0.02}
          clearcoat={0.95}
          clearcoatRoughness={0.12}
          reflectivity={0.52}
        />
        {definition.skin.marker === 'ring' ? (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[ball.radius * 0.68, ball.radius * 0.08, 18, 48]} />
            <meshStandardMaterial color={definition.skin.accentColor} roughness={0.3} metalness={0.04} />
          </mesh>
        ) : null}
        {definition.skin.marker === 'dot' ? (
          <group>
            <mesh position={[0, 0, ball.radius * 0.82]}>
              <sphereGeometry args={[ball.radius * 0.2, 16, 16]} />
              <meshStandardMaterial color={definition.skin.accentColor} roughness={0.3} metalness={0.04} />
            </mesh>
            <mesh position={[0, 0, -ball.radius * 0.82]}>
              <sphereGeometry args={[ball.radius * 0.2, 16, 16]} />
              <meshStandardMaterial color={definition.skin.accentColor} roughness={0.3} metalness={0.04} />
            </mesh>
          </group>
        ) : null}
      </mesh>
    </group>
  )
}

function CueStick({
  activeCueBall,
  shotControls,
  table,
}: {
  activeCueBall: BallState | null
  shotControls: ShotControls
  table: TableGeometry
}) {
  if (!activeCueBall) {
    return null
  }

  const [x, y, z] = toScenePosition(activeCueBall.position, table)
  const cueDrawBack = TABLE_MODEL.cueGap + shotControls.power * 0.18
  const verticalOffset = shotControls.impactOffset.y * table.ballRadius * 0.34
  const lateralOffset = shotControls.impactOffset.x * table.ballRadius * 0.34

  return (
    <group position={[x, y + verticalOffset, z]} rotation={[0, shotControls.angle, 0]}>
      <group position={[0, 0, lateralOffset]}>
        <mesh position={[-TABLE_MODEL.cueLength * 0.18 - cueDrawBack, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.011, 0.014, TABLE_MODEL.cueLength * 0.62, 20]} />
          <meshStandardMaterial color="#8c5d33" roughness={0.48} metalness={0.08} />
        </mesh>
        <mesh position={[-TABLE_MODEL.cueLength * 0.54 - cueDrawBack, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.014, 0.018, TABLE_MODEL.cueLength * 0.42, 20]} />
          <meshStandardMaterial color="#3d2012" roughness={0.54} metalness={0.12} />
        </mesh>
        <mesh position={[-cueDrawBack + table.ballRadius * 0.14, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.006, 0.006, 0.032, 16]} />
          <meshStandardMaterial color="#8ec8dd" roughness={0.4} metalness={0.16} />
        </mesh>
      </group>
    </group>
  )
}

function ActiveCueMarker({ table, position }: { table: TableGeometry; position: BallState['position'] }) {
  const [x, , z] = toScenePosition(position, table)

  return (
    <mesh position={[x, 0.002, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[table.ballRadius * 1.6, table.ballRadius * 0.13, 18, 40]} />
      <meshBasicMaterial color="#7ce0ff" transparent opacity={0.75} />
    </mesh>
  )
}

export function BilliardsScene({
  table,
  balls,
  ballDefinitions,
  activeCueBallId,
  shotControls,
  status,
}: BilliardsSceneProps) {
  const definitionsById = useMemo(
    () => new Map(ballDefinitions.map((definition) => [definition.id, definition])),
    [ballDefinitions],
  )
  const activeCueBall = balls.find((ball) => ball.id === activeCueBallId) ?? null

  return (
      <Canvas
        shadows="percentage"
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [0, 1.55, 2.12], fov: 34 }}
    >
      <color attach="background" args={['#071116']} />
      <fog attach="fog" args={['#071116', 2.1, 4.8]} />
      <ambientLight intensity={0.52} color="#b7e4f3" />
      <hemisphereLight intensity={0.42} color="#d6f4ff" groundColor="#0a1b22" />
      <spotLight
        castShadow
        position={[0, 2.4, 0.5]}
        angle={0.48}
        penumbra={0.75}
        intensity={34}
        color="#f9fcff"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <spotLight position={[-1.6, 1.4, 1.9]} angle={0.4} penumbra={0.65} intensity={9} color="#6dd8ff" />

      <TableModel table={table} />
      {status === 'aiming' && activeCueBall ? (
        <ActiveCueMarker table={table} position={activeCueBall.position} />
      ) : null}
      {status === 'aiming' ? (
        <CueStick activeCueBall={activeCueBall} shotControls={shotControls} table={table} />
      ) : null}
      {balls.map((ball) => {
        const definition = definitionsById.get(ball.id)

        if (!definition || !ball.inPlay) {
          return null
        }

        return <BallMesh key={ball.id} ball={ball} definition={definition} table={table} />
      })}

      <ContactShadows position={[0, -0.24, 0]} opacity={0.55} scale={5} blur={2.4} far={2.5} />
      <OrbitControls
        enablePan={false}
        minDistance={1.8}
        maxDistance={3.2}
        minPolarAngle={0.82}
        maxPolarAngle={1.22}
        minAzimuthAngle={-0.6}
        maxAzimuthAngle={0.6}
        target={[0, 0.04, 0]}
      />
    </Canvas>
  )
}
