import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Float, Html, QuadraticBezierLine } from '@react-three/drei'
import * as THREE from 'three'
import { ISLAND_PINS, ISLAND_ROUTES, PLACE_BY_ID } from '../lib/places'
import { COAST } from '../lib/coast'

const SCALE = 1.38
const toXY = (lng, lat) => [(lng - 80.8) * SCALE, (lat - 7.85) * SCALE]
const COAST_XY = COAST.map(([lng, lat]) => toXY(lng, lat))
const TOP = 0.36 // height of the land surface

const HILLS = [
  [80.78, 6.97, 0.28, 0.36], [80.5, 6.81, 0.18, 0.42], [80.8, 7.42, 0.24, 0.26], [81.03, 6.9, 0.2, 0.24],
  [80.62, 7.2, 0.2, 0.2], [80.95, 7.15, 0.22, 0.22], [80.68, 6.76, 0.18, 0.18],
]

// Shared mouse / phone-tilt position, from -1 to 1
const pointer = { x: 0, y: 0 }

function makeShape(scale) {
  const pts = COAST_XY.map(([x, y]) => new THREE.Vector2(x * scale, y * scale))
  const shape = new THREE.Shape()
  shape.moveTo(pts[0].x, pts[0].y)
  shape.splineThru([...pts.slice(1), pts[0]])
  return shape
}

function inside(x, y, poly) {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

function seeded(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function Land() {
  const land = useMemo(
    () => new THREE.ExtrudeGeometry(makeShape(1), { depth: 0.28, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.05, bevelSegments: 3, curveSegments: 20 }),
    [],
  )
  const beach = useMemo(
    () => new THREE.ExtrudeGeometry(makeShape(1.045), { depth: 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 20 }),
    [],
  )
  return (
    <>
      <mesh geometry={land}>
        <meshStandardMaterial attach="material-0" color="#3DAE68" roughness={0.85} />
        <meshStandardMaterial attach="material-1" color="#8B6A4A" roughness={1} />
      </mesh>
      <mesh geometry={beach} position-z={-0.02}>
        <meshStandardMaterial attach="material-0" color="#F3DDB3" roughness={1} />
        <meshStandardMaterial attach="material-1" color="#D9BF94" roughness={1} />
      </mesh>
    </>
  )
}

function Hills() {
  return HILLS.map(([lng, lat, r, h], i) => {
    const [x, y] = toXY(lng, lat)
    return (
      <mesh key={i} position={[x, y, TOP + h / 2 - 0.04]} rotation-x={Math.PI / 2}>
        <coneGeometry args={[r, h, 7]} />
        <meshStandardMaterial color={i % 2 ? '#2A8A52' : '#23794A'} flatShading roughness={0.9} />
      </mesh>
    )
  })
}

function Trees() {
  const ref = useRef()
  const trees = useMemo(() => {
    const rand = seeded(7)
    const inner = COAST_XY.map(([x, y]) => [x * 0.88, y * 0.88])
    const list = []
    while (list.length < 110) {
      const x = (rand() - 0.5) * 3.4
      const y = (rand() - 0.5) * 6.2
      if (!inside(x, y, inner)) continue
      list.push({ x, y, s: 0.7 + rand() * 0.6, color: ['#1F7A45', '#2E9E5B', '#3FB66C', '#17663A'][Math.floor(rand() * 4)] })
    }
    return list
  }, [])

  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    const c = new THREE.Color()
    trees.forEach((t, i) => {
      o.position.set(t.x, t.y, TOP + 0.1 * t.s)
      o.rotation.set(Math.PI / 2, 0, 0)
      o.scale.setScalar(t.s)
      o.updateMatrix()
      ref.current.setMatrixAt(i, o.matrix)
      ref.current.setColorAt(i, c.set(t.color))
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.instanceColor.needsUpdate = true
  }, [trees])

  return (
    <instancedMesh ref={ref} args={[null, null, trees.length]}>
      <coneGeometry args={[0.06, 0.2, 6]} />
      <meshStandardMaterial flatShading roughness={0.9} />
    </instancedMesh>
  )
}

function Pin({ place, index, color }) {
  const ring = useRef()
  const [x, y] = toXY(place.lng, place.lat)
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime * 0.7 + index * 0.17) % 1
    ring.current.scale.setScalar(1 + t * 2.4)
    ring.current.material.opacity = 1 - t
  })
  return (
    <group position={[x, y, TOP]}>
      <mesh ref={ring} position-z={0.01}>
        <ringGeometry args={[0.05, 0.075, 32]} />
        <meshBasicMaterial color={color} transparent />
      </mesh>
      <mesh position-z={0.09} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.012, 0.012, 0.18, 8]} />
        <meshStandardMaterial color="#FFFFFF" />
      </mesh>
      <mesh position-z={0.2}>
        <sphereGeometry args={[0.065, 24, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
      {place.label !== false && <Html position={[0, 0, 0.34]} center distanceFactor={6} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap rounded-full bg-surface/95 px-2 py-0.5 text-[12px] font-semibold text-ink shadow-md backdrop-blur">
          {place.name}
        </div>
      </Html>}
    </group>
  )
}

function Route({ from, to, index, color }) {
  const ref = useRef()
  const [ax, ay] = toXY(from.lng, from.lat)
  const [bx, by] = toXY(to.lng, to.lat)
  const dist = Math.hypot(bx - ax, by - ay)
  useFrame((_, delta) => {
    if (ref.current) ref.current.material.dashOffset -= delta * 0.5
  })
  return (
    <QuadraticBezierLine
      ref={ref}
      start={[ax, ay, TOP + 0.2]}
      end={[bx, by, TOP + 0.2]}
      mid={[(ax + bx) / 2, (ay + by) / 2, TOP + 0.35 + dist * 0.35 + (index % 2) * 0.1]}
      color={color}
      lineWidth={3}
      dashed
      dashSize={0.1}
      gapSize={0.07}
    />
  )
}

function Island({ accent }) {
  const group = useRef()

  useFrame((state, delta) => {
    const r = group.current.rotation
    r.x = THREE.MathUtils.damp(r.x, -0.82 + pointer.y * 0.12, 3, delta)
    r.y = THREE.MathUtils.damp(r.y, pointer.x * 0.3, 3, delta)
    r.z = Math.sin(state.clock.elapsedTime * 0.25) * 0.1 - 0.12
  })

  return (
    <group ref={group} rotation-x={-0.82}>
      <Land />
      <Hills />
      <Trees />
      {ISLAND_ROUTES.map(([a, b], i) => (
        <Route key={a + b} from={PLACE_BY_ID[a]} to={PLACE_BY_ID[b]} index={i} color={accent} />
      ))}
      {ISLAND_PINS.map((id, i) => (
        <Pin key={id} place={PLACE_BY_ID[id]} index={i} color={accent} />
      ))}
    </group>
  )
}

function usePointer() {
  useEffect(() => {
    const onMove = (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.y = -((e.clientY / window.innerHeight) * 2 - 1)
    }
    // Tilt the phone to move the island
    const onTilt = (e) => {
      if (e.gamma == null) return
      pointer.x = THREE.MathUtils.clamp(e.gamma / 30, -1, 1)
      pointer.y = THREE.MathUtils.clamp((e.beta - 45) / 30, -1, 1)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('deviceorientation', onTilt)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('deviceorientation', onTilt)
    }
  }, [])
}

// Pull the camera back on tall, narrow screens (phones) so the whole island fits
function ResponsiveCamera() {
  const { camera, size } = useThree()
  useEffect(() => {
    camera.position.z = size.width / size.height < 1 ? 15 : 11
    camera.updateProjectionMatrix()
  }, [camera, size])
  return null
}

export default function IslandScene({ night = false, accent = '#FF6B4A' }) {
  usePointer()
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0.3, 11], fov: 32 }} gl={{ antialias: true, alpha: true }}>
      <ResponsiveCamera />
      <ambientLight intensity={night ? 0.5 : 0.8} />
      <hemisphereLight args={['#BDE5FF', '#F6EAD7', night ? 0.5 : 0.9]} />
      <directionalLight position={[5, 8, 6]} intensity={night ? 1.1 : 2.3} color={night ? '#C4D2FF' : '#FFF1DC'} />
      <Float speed={1.3} rotationIntensity={0.12} floatIntensity={0.5}>
        <Island accent={accent} />
      </Float>
      <ContactShadows position={[0, -2.9, 0]} opacity={0.25} blur={2.8} scale={12} far={6} color="#000000" />
    </Canvas>
  )
}
