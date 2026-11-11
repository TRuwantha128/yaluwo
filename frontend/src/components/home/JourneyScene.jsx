import { useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { PLACES } from '../../lib/places'
import { COAST } from '../../lib/coast'
import { JOURNEY_KM, JOURNEY_PATH, JOURNEY_STOPS, storyAt } from '../../lib/journey'

// The island lies flat (x = east, z = south, y = up) and the camera flies over it.
const SCALE = 1.38
const TOP = 0.34 // height of the land surface
const flat = (lng, lat) => [(lng - 80.8) * SCALE, (lat - 7.85) * SCALE]
const world = (lng, lat, h = TOP) => {
  const [x, y] = flat(lng, lat)
  return new THREE.Vector3(x, h, -y)
}
const COAST_XY = COAST.map(([lng, lat]) => flat(lng, lat))
const HILL_CENTRE = flat(80.75, 7.0)
const hillLift = (x, y) => 0.2 * Math.exp(-((x - HILL_CENTRE[0]) ** 2 + (y - HILL_CENTRE[1]) ** 2) / 0.16)

const HILLS = [
  [80.78, 6.99, 0.26, 0.4], [80.5, 6.81, 0.18, 0.42], [80.82, 7.44, 0.24, 0.26], [81.0, 7.05, 0.2, 0.24],
  [80.6, 7.08, 0.2, 0.22], [80.9, 7.24, 0.22, 0.22], [80.66, 6.72, 0.18, 0.2], [80.86, 6.72, 0.16, 0.2],
]

function coastShape(scale) {
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

// ---- The road: one smooth curve through the stops, with each stop's place along it ----
const ROAD = (() => {
  const pts = JOURNEY_PATH.map((p) => {
    const [x, y] = flat(p.lng, p.lat)
    return new THREE.Vector3(x, TOP + 0.025 + hillLift(x, y), -y)
  })
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5)
  // Arc-length position (0..1) of every stop
  const samples = curve.getSpacedPoints(600)
  const stopAt = JOURNEY_PATH.map((p, i) => (p.stop ? pts[i] : null))
    .filter(Boolean)
    .map((target) => {
      let best = 0
      let bestD = Infinity
      samples.forEach((s, k) => {
        const d = s.distanceToSquared(target)
        if (d < bestD) {
          bestD = d
          best = k
        }
      })
      return best / 600
    })
  return { curve, stopAt }
})()

const STOPS = JOURNEY_STOPS.length
const CAM = [
  { az: 0.45, el: 0.72, dist: 5.6 },
  { az: -0.3, el: 0.66, dist: 5.2 },
  { az: 0.38, el: 0.62, dist: 5.0 },
  { az: -0.25, el: 0.7, dist: 5.6 },
]
const OVERVIEW = { az: 0.12, el: 0.7, dist: 10.4 }
const lerp = THREE.MathUtils.lerp

function Land() {
  const land = useMemo(() => new THREE.ExtrudeGeometry(coastShape(1), { depth: 0.26, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.05, bevelSegments: 3, curveSegments: 22 }), [])
  const beach = useMemo(() => new THREE.ExtrudeGeometry(coastShape(1.05), { depth: 0.14, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 22 }), [])
  const reef = useMemo(() => new THREE.ShapeGeometry(coastShape(1.2), 22), [])
  return (
    <group rotation-x={-Math.PI / 2}>
      <mesh geometry={reef} position-z={-0.035}>
        <meshBasicMaterial color="#00aeef" transparent opacity={0.16} />
      </mesh>
      <mesh geometry={beach} position-z={-0.02}>
        <meshStandardMaterial attach="material-0" color="#f1d6a4" roughness={1} />
        <meshStandardMaterial attach="material-1" color="#c9a877" roughness={1} />
      </mesh>
      <mesh geometry={land}>
        <meshStandardMaterial attach="material-0" color="#1f8f66" roughness={0.9} />
        <meshStandardMaterial attach="material-1" color="#5a4a6e" roughness={1} />
      </mesh>
    </group>
  )
}

function Hills() {
  return HILLS.map(([lng, lat, r, h], i) => {
    const p = world(lng, lat, TOP + h / 2 - 0.04)
    return (
      <mesh key={i} position={p}>
        <coneGeometry args={[r, h, 7]} />
        <meshStandardMaterial color={i % 2 ? '#1b7d5a' : '#166b4e'} flatShading roughness={0.9} />
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
    while (list.length < 130) {
      const x = (rand() - 0.5) * 3.4
      const y = (rand() - 0.5) * 6.2
      if (!inside(x, y, inner)) continue
      list.push({ x, y, s: 0.6 + rand() * 0.6, color: ['#157052', '#1f9a6c', '#2bb07c', '#0f5e45'][Math.floor(rand() * 4)] })
    }
    return list
  }, [])
  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    const c = new THREE.Color()
    trees.forEach((t, i) => {
      o.position.set(t.x, TOP + 0.09 * t.s + hillLift(t.x, t.y) * 0.6, -t.y)
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
      <coneGeometry args={[0.055, 0.19, 6]} />
      <meshStandardMaterial flatShading roughness={0.9} />
    </instancedMesh>
  )
}

// One small light for every place on Yaluwo, coming on at dusk
function PlaceLights() {
  const ref = useRef()
  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    PLACES.forEach((p, i) => {
      const [x, y] = flat(p.lng, p.lat)
      o.position.set(x, TOP + 0.03 + hillLift(x, y), -y)
      o.updateMatrix()
      ref.current.setMatrixAt(i, o.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [])
  useFrame(({ clock }) => {
    ref.current.material.opacity = 0.75 + Math.sin(clock.elapsedTime * 1.6) * 0.2
  })
  return (
    <instancedMesh ref={ref} args={[null, null, PLACES.length]}>
      <sphereGeometry args={[0.013, 8, 8]} />
      <meshBasicMaterial color="#ffd27a" transparent />
    </instancedMesh>
  )
}

// Rings spreading from the coast, like a chart's depth lines
function Ripples() {
  const group = useRef()
  const rings = useMemo(
    () =>
      [1.12, 1.24, 1.38].map((s) => {
        const pts = coastShape(s).getSpacedPoints(160).map((p) => new THREE.Vector3(p.x, 0.02, -p.y))
        return new THREE.BufferGeometry().setFromPoints(pts)
      }),
    [],
  )
  useFrame(({ clock }) => {
    group.current.children.forEach((line, i) => {
      line.material.opacity = 0.1 + 0.1 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.8 - i * 1.3))
    })
  })
  return (
    <group ref={group}>
      {rings.map((g, i) => (
        <lineLoop key={i} geometry={g}>
          <lineBasicMaterial color="#7fd8ff" transparent opacity={0.15} />
        </lineLoop>
      ))}
    </group>
  )
}

// Evening clouds drifting in from the west
const CLOUDS = [
  [-2.4, 1.5, -1.6, 1.0], [1.6, 1.75, -2.4, 0.8], [-0.6, 1.9, 1.4, 1.2], [2.6, 1.45, 0.9, 0.9], [-3.2, 1.7, 0.6, 0.7], [0.4, 1.6, -0.2, 0.6],
]
function Clouds() {
  const group = useRef()
  useFrame(({ clock }) => {
    group.current.children.forEach((c, i) => {
      const [x, y, z] = CLOUDS[i]
      c.position.x = ((x + clock.elapsedTime * (0.05 + i * 0.008) + 4.5) % 9) - 4.5
      c.position.y = y + Math.sin(clock.elapsedTime * 0.3 + i) * 0.04
      c.position.z = z
    })
  })
  return (
    <group ref={group}>
      {CLOUDS.map(([, , , s], i) => (
        <group key={i} scale={s * 0.72}>
          {[[0, 0, 0, 0.26], [0.26, 0.03, 0.04, 0.2], [-0.25, 0.01, -0.03, 0.18], [0.08, 0.1, -0.05, 0.19]].map(([x, y, z, r], k) => (
            <mesh key={k} position={[x, y, z]} scale={[1, 0.62, 0.8]}>
              <icosahedronGeometry args={[r, 1]} />
              <meshStandardMaterial color="#ffe3d6" emissive="#93359b" emissiveIntensity={0.18} flatShading transparent opacity={0.9} roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

// A fishing boat going round the south coast, with its lamp lit
function Boat() {
  const ref = useRef()
  useFrame(({ clock }) => {
    const a = clock.elapsedTime * 0.07 + 2.2
    ref.current.position.set(Math.sin(a) * 2.5, 0.03 + Math.sin(clock.elapsedTime * 1.4) * 0.008, Math.cos(a) * 3.9 - 0.1)
    ref.current.rotation.y = a + Math.PI / 2
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 1.4) * 0.06
  })
  return (
    <group ref={ref}>
      <mesh position-y={0.02}>
        <boxGeometry args={[0.2, 0.04, 0.06]} />
        <meshStandardMaterial color="#00aeef" roughness={0.6} />
      </mesh>
      <mesh position={[0.02, 0.12, 0]}>
        <coneGeometry args={[0.055, 0.17, 3]} />
        <meshStandardMaterial color="#ffffff" flatShading />
      </mesh>
      <mesh position={[-0.08, 0.06, 0]}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshBasicMaterial color="#ffd27a" />
      </mesh>
    </group>
  )
}

function Road({ progress }) {
  const SEG = 420
  const RAD = 6
  const done = useRef()
  const full = useMemo(() => new THREE.TubeGeometry(ROAD.curve, SEG, 0.011, RAD, false), [])
  const lit = useMemo(() => new THREE.TubeGeometry(ROAD.curve, SEG, 0.02, RAD, false), [])
  useFrame(() => {
    done.current.geometry.setDrawRange(0, Math.floor(progress.current.along * SEG) * RAD * 6)
  })
  return (
    <>
      <mesh geometry={full}>
        <meshBasicMaterial color="#ffffff" transparent opacity={0.28} />
      </mesh>
      <mesh ref={done} geometry={lit}>
        <meshBasicMaterial color="#f68b1f" />
      </mesh>
    </>
  )
}

function Van({ progress }) {
  const ref = useRef()
  const ahead = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ clock }) => {
    const u = progress.current.along
    ROAD.curve.getPointAt(u, ref.current.position)
    ROAD.curve.getPointAt(Math.min(1, u + 0.004), ahead)
    if (u > 0.995) ROAD.curve.getPointAt(0.99, ahead).sub(ref.current.position).multiplyScalar(-1).add(ref.current.position)
    ref.current.lookAt(ahead)
    ref.current.position.y += 0.012 + Math.abs(Math.sin(clock.elapsedTime * 9)) * 0.004 * progress.current.moving
  })
  // Built facing +z (lookAt points +z at the road ahead)
  return (
    <group ref={ref} scale={1.15}>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.085, 0.07, 0.19]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.045, 0]}>
        <boxGeometry args={[0.088, 0.02, 0.192]} />
        <meshStandardMaterial color="#f68b1f" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.07, 0.035]}>
        <boxGeometry args={[0.087, 0.026, 0.1]} />
        <meshStandardMaterial color="#15174a" roughness={0.3} />
      </mesh>
      {[[-0.045, 0.06], [0.045, 0.06], [-0.045, -0.06], [0.045, -0.06]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.016, z]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.018, 0.018, 0.014, 10]} />
          <meshStandardMaterial color="#15174a" />
        </mesh>
      ))}
      {[-0.028, 0.028].map((x) => (
        <mesh key={x} position={[x, 0.04, 0.097]}>
          <sphereGeometry args={[0.01, 8, 8]} />
          <meshBasicMaterial color="#fff3c4" />
        </mesh>
      ))}
      <pointLight position={[0, 0.08, 0.22]} color="#ffcf7a" intensity={0.5} distance={0.9} />
    </group>
  )
}

// A kilometre post at each stop: yellow cap with the distance, white body with the town
function Post({ stop, index, progress }) {
  const el = useRef()
  const beam = useRef()
  const [x, y] = flat(stop.lng, stop.lat)
  useFrame(() => {
    const here = progress.current.reached >= index
    if (el.current) el.current.style.opacity = here ? 1 : 0.55
    beam.current.material.opacity = here ? 0.95 : 0.35
  })
  return (
    <group position={[x, TOP + hillLift(x, y), -y]}>
      <mesh ref={beam} position-y={0.17}>
        <cylinderGeometry args={[0.008, 0.008, 0.34, 6]} />
        <meshBasicMaterial color="#ffffff" transparent />
      </mesh>
      <mesh position-y={0.01} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.05, 0.07, 28]} />
        <meshBasicMaterial color="#f6c21f" />
      </mesh>
      <Html position={[0, 0.44, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={el} className="km-post whitespace-nowrap text-[10px] font-bold transition-opacity duration-500 sm:text-[11px]">
          <span className="px-2 py-1">km {JOURNEY_KM[index]}</span>
          <span className="px-2 py-1">{stop.name}</span>
        </div>
      </Html>
    </group>
  )
}

function Rig({ scroll, progress, still }) {
  const { camera, size } = useThree()
  const target = useMemo(() => new THREE.Vector3(0, TOP, 0.25), [])
  const want = useMemo(() => new THREE.Vector3(), [])
  const state = useRef({ az: OVERVIEW.az, el: OVERVIEW.el, dist: OVERVIEW.dist, ready: false })
  const centre = useMemo(() => new THREE.Vector3(0, TOP, 0.25), [])

  // The story text sits on the left (desktop) or the bottom (phones): shift the picture away from it
  useLayoutEffect(() => {
    const wide = size.width >= 900
    const dx = wide ? -size.width * 0.23 : 0
    const dy = wide ? 0 : size.height * 0.2
    camera.setViewOffset(size.width, size.height, dx, dy, size.width, size.height)
    return () => camera.clearViewOffset()
  }, [camera, size])

  useFrame(({ clock }, delta) => {
    const p = still ? 0 : scroll.current
    const s = storyAt(p)
    const t = clock.elapsedTime
    // Before anyone scrolls, the scene plays like a short film: the van drives the
    // whole route again and again. Scrolling takes over and puts it where the story is.
    const film = s.intro < 0.04
    const loop = (t * 0.045) % 1.15 // a short pause at Arugam Bay before starting again
    const along = film ? Math.min(1, loop) : lerp(ROAD.stopAt[s.index], ROAD.stopAt[Math.min(STOPS - 1, s.index + 1)], s.drive)
    // the loop restarts by jumping back to Colombo, not by reversing down the road
    if (film && along < progress.current.along - 0.5) progress.current.along = along
    progress.current.along = THREE.MathUtils.damp(progress.current.along, along, film ? 3 : 6, delta)
    progress.current.moving = film ? (loop < 1 ? 1 : 0) : s.drive > 0.02 && s.drive < 0.98 ? 1 : 0
    progress.current.reached = film
      ? ROAD.stopAt.reduce((n, at, i) => (progress.current.along >= at - 0.01 ? i : n), -1)
      : s.intro < 0.5 ? -1 : s.drive > 0.9 ? s.index + 1 : s.index

    const a = CAM[s.index]
    const b = CAM[Math.min(STOPS - 1, s.index + 1)]
    const portrait = size.width / size.height < 0.8
    // Pull out a little in the middle of each drive, so the land rolls past
    let az = lerp(a.az, b.az, s.drive)
    let el = lerp(a.el, b.el, s.drive)
    let dist = (lerp(a.dist, b.dist, s.drive) + Math.sin(s.drive * Math.PI) * 0.9) * (portrait ? 1.25 : 1)
    const mix = s.intro * (1 - s.outro)
    const overview = OVERVIEW.dist * (portrait ? 1.5 : 1)
    // The opening shot: from high and far in the north-west, sweeping down and round to
    // the whole island, then a slow drift so the picture never stands still
    const open = still ? 1 : 1 - (1 - Math.min(1, t / 3.4)) ** 3
    const drift = Math.sin(t * 0.16) * 0.2
    az = lerp(lerp(-1.5, OVERVIEW.az, open) + drift, az, mix)
    el = lerp(lerp(1.2, OVERVIEW.el, open) + Math.sin(t * 0.11) * 0.03, el, mix)
    dist = lerp(lerp(overview * 2.3, overview, open), dist, mix)

    ROAD.curve.getPointAt(progress.current.along, want)
    want.lerpVectors(centre, want, mix)

    const st = state.current
    const k = st.ready && t > 3.6 ? 4.5 : 1000 // the opening sweep follows its own curve exactly
    st.ready = true
    st.az = THREE.MathUtils.damp(st.az, az, k, delta)
    st.el = THREE.MathUtils.damp(st.el, el, k, delta)
    st.dist = THREE.MathUtils.damp(st.dist, dist, k, delta)
    target.x = THREE.MathUtils.damp(target.x, want.x, k, delta)
    target.y = THREE.MathUtils.damp(target.y, want.y, k, delta)
    target.z = THREE.MathUtils.damp(target.z, want.z, k, delta)

    camera.position.set(
      target.x + Math.sin(st.az) * Math.cos(st.el) * st.dist,
      target.y + Math.sin(st.el) * st.dist,
      target.z + Math.cos(st.az) * Math.cos(st.el) * st.dist,
    )
    camera.lookAt(target)
  })
  return null
}

export default function JourneyScene({ scroll, active = true, still = false }) {
  const progress = useRef({ along: 0, moving: 0, reached: -1 })
  return (
    <Canvas dpr={[1, 1.75]} frameloop={active ? 'always' : 'never'} camera={{ position: [0, 7, 9], fov: 30, near: 0.1, far: 120 }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}>
      <Rig scroll={scroll} progress={progress} still={still} />
      <ambientLight intensity={0.55} color="#aab4ff" />
      <hemisphereLight args={['#7f8cff', '#3a1f5c', 0.7]} />
      {/* The sun has just set in the west: low, warm light from the left */}
      <directionalLight position={[-7, 2.6, 1.5]} intensity={2.6} color="#ffab6b" />
      <directionalLight position={[3, 8, 4]} intensity={0.55} color="#a9b8ff" />
      <Stars radius={50} depth={30} count={1400} factor={2.2} saturation={0} fade speed={0.6} />
      <Ripples />
      <Clouds />
      <Boat />
      <Land />
      <Hills />
      <Trees />
      <PlaceLights />
      <Road progress={progress} />
      {JOURNEY_STOPS.map((s, i) => (
        <Post key={s.id} stop={s} index={i} progress={progress} />
      ))}
      <Van progress={progress} />
    </Canvas>
  )
}
