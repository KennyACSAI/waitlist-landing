import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Network-graph backdrop — a cloud of drifting *map pin* billboards
 * (camera-facing sprites) with hairlines connecting any two pins whose
 * distance is under LINK_DISTANCE. Reads as a mesh of Yoova pins,
 * echoing the main 3D pin without duplicating heavy glb geometry.
 *
 * The pin icon is drawn once to a Canvas and reused as a THREE.Points
 * texture. Lines use per-vertex brightness as an alpha proxy (additive
 * blending on the dark bg) so they fade smoothly with distance.
 */
const POINT_COUNT = 28
const LINK_DISTANCE = 2.9
const MAX_LINKS = POINT_COUNT * 20
const BOUNDS = { x: 9, y: 6 }
const Z_NEAR = -2
const Z_FAR = -6
const PIN_COLOR = '#28aa97'

// Background pin softness (DOF-ish). Applied as a canvas blur on the sprite
// texture, so every Starfield pin renders softer while the foreground 3D
// Yoova pin stays sharp. 0 = crisp, ~1.5 = subtle haze, ~3 = strong DOF.
const BG_PIN_BLUR_PX = 0.5
// Line brightness multiplier. 1px WebGL lines can't be literally blurred,
// so we dim them to match the soft pins — they fade into the backdrop
// instead of cutting across it. 1 = original, ~0.55 = hazy, ~0.3 = faint.
const BG_LINE_INTENSITY = 0.45

// Connection lifecycle — trace-on + fade-out. Durations in seconds.
const FORM_SECONDS = 0.5
const FADE_SECONDS = 0.7
// Reduced-motion fallback: no trace, tiny fade.
const FORM_SECONDS_REDUCED = 0
const FADE_SECONDS_REDUCED = 0.1
// Minimum sustain brightness. Without this, lines asymptote to 0 at the
// link-distance threshold so by the time a pair crosses out of range
// there's nothing left to fade — the dissolve reads as an instant pop.
const SUSTAIN_FLOOR = 0.55

type ConnectionPhase = 'forming' | 'sustain' | 'dissolving'

interface ConnectionState {
  phase: ConnectionPhase
  /** Seconds elapsed in the current phase. */
  t: number
  /** Last computed brightness — captured at dissolve start so the fade
   *  curve starts from the line's visible intensity, not from full. */
  lastBrightness: number
}

/** Draws the pin silhouette onto an arbitrary 2D context at `size` px. */
function drawPinShape(ctx: CanvasRenderingContext2D, size: number) {
  const cx = size / 2
  const headCy = size * 0.36
  const headR = size * 0.22
  const tipY = size * 0.86
  const holeR = size * 0.08

  const tanAngle = Math.asin(headR / (tipY - headCy))
  const leftX = cx - headR * Math.cos(tanAngle)
  const tangentY = headCy + headR * Math.sin(tanAngle)

  ctx.beginPath()
  ctx.arc(cx, headCy, headR, Math.PI - tanAngle, tanAngle + Math.PI * 2, false)
  ctx.lineTo(cx, tipY)
  ctx.lineTo(leftX, tangentY)
  ctx.closePath()
  ctx.moveTo(cx + holeR, headCy)
  ctx.arc(cx, headCy, holeR, 0, Math.PI * 2, true)
  ctx.fillStyle = PIN_COLOR
  ctx.fill('evenodd')

  ctx.beginPath()
  ctx.arc(cx - headR * 0.25, headCy - headR * 0.3, headR * 0.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
  ctx.fill()
}

/** Paints a clean map-pin silhouette and returns a THREE.Texture for use
 *  as a points sprite.
 *
 *  iOS Safari < 18 silently ignores `CanvasRenderingContext2D.filter`, so
 *  the CSS `blur(…)` approach produces sharp pins on many phones. To get
 *  cross-browser softness we use a downsample/upsample pass: draw into a
 *  small canvas then scale it up to the final size — bilinear filtering
 *  during the upscale gives a smooth box-blur that works everywhere. */
function buildPinTexture(): THREE.Texture {
  const size = 128
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  if (BG_PIN_BLUR_PX <= 0) {
    drawPinShape(ctx, size)
  } else {
    // The smaller we draw the pin, the more blur the upscale produces.
    // Clamp the floor so ratio stays sensible (texture must have real pixels).
    const smallSize = Math.max(8, Math.round(size / (1 + BG_PIN_BLUR_PX)))
    const small = document.createElement('canvas')
    small.width = smallSize
    small.height = smallSize
    const sctx = small.getContext('2d')!
    drawPinShape(sctx, smallSize)

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(small, 0, 0, size, size)
  }

  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

export default function Starfield() {
  const data = useMemo(() => {
    const pos = new Float32Array(POINT_COUNT * 3)
    const vel = new Float32Array(POINT_COUNT * 3)
    for (let i = 0; i < POINT_COUNT; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * BOUNDS.x
      pos[i * 3 + 1] = (Math.random() * 2 - 1) * BOUNDS.y
      pos[i * 3 + 2] = Z_NEAR + Math.random() * (Z_FAR - Z_NEAR)
      vel[i * 3] = (Math.random() - 0.5) * 0.005
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.005
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.0022
    }
    return { pos, vel }
  }, [])

  const pointsGeom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(data.pos, 3).setUsage(THREE.DynamicDrawUsage),
    )
    return g
  }, [data])

  const linesGeom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(MAX_LINKS * 2 * 3)
    const col = new Float32Array(MAX_LINKS * 2 * 3)
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage))
    g.setDrawRange(0, 0)
    return g
  }, [])

  const pinTexture = useMemo(() => buildPinTexture(), [])

  const pointsRef = useRef<THREE.Points>(null!)
  const linesRef = useRef<THREE.LineSegments>(null!)

  // Persistent per-pair state. Lazy-init avoids allocating a Map on each
  // render. Keys are integers (i * POINT_COUNT + j) with i<j so no string
  // allocations on the hot path.
  const connectionsRef = useRef<Map<number, ConnectionState> | null>(null)
  if (!connectionsRef.current) connectionsRef.current = new Map()
  // Reused across frames via .clear() — avoids GC pressure from a new Set
  // allocated for every frame's in-range scan.
  const inRangeRef = useRef<Set<number> | null>(null)
  if (!inRangeRef.current) inRangeRef.current = new Set()

  // Honor prefers-reduced-motion: trace-on becomes instant, fade shortens.
  const reducedMotionRef = useRef(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      reducedMotionRef.current = mq.matches
    }
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useFrame((_, dt) => {
    const { pos, vel } = data
    const step = Math.min(dt, 0.05) * 60

    // Drift + reflect off bounds
    for (let i = 0; i < POINT_COUNT; i++) {
      const ix = i * 3
      pos[ix] += vel[ix] * step
      pos[ix + 1] += vel[ix + 1] * step
      pos[ix + 2] += vel[ix + 2] * step
      if (Math.abs(pos[ix]) > BOUNDS.x) vel[ix] *= -1
      if (Math.abs(pos[ix + 1]) > BOUNDS.y) vel[ix + 1] *= -1
      if (pos[ix + 2] > Z_NEAR || pos[ix + 2] < Z_FAR) vel[ix + 2] *= -1
    }
    pointsGeom.attributes.position.needsUpdate = true

    const connections = connectionsRef.current!
    const inRange = inRangeRef.current!
    inRange.clear()
    const reduced = reducedMotionRef.current
    const formDuration = reduced ? FORM_SECONDS_REDUCED : FORM_SECONDS
    const fadeDuration = reduced ? FADE_SECONDS_REDUCED : FADE_SECONDS
    const thr2 = LINK_DISTANCE * LINK_DISTANCE

    // 1) Scan pairs currently within link distance.
    //    - New pairs enter 'forming'.
    //    - Pairs already dissolving when they come back into range snap to
    //      'sustain' (no re-tracing flicker; sustain brightness ramps
    //      naturally from 0 as distance drops).
    for (let i = 0; i < POINT_COUNT; i++) {
      const ix = i * 3
      for (let j = i + 1; j < POINT_COUNT; j++) {
        const jx = j * 3
        const dx = pos[ix] - pos[jx]
        const dy = pos[ix + 1] - pos[jx + 1]
        const dz = pos[ix + 2] - pos[jx + 2]
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 >= thr2) continue
        const key = i * POINT_COUNT + j
        inRange.add(key)
        const existing = connections.get(key)
        if (!existing) {
          connections.set(key, { phase: 'forming', t: 0, lastBrightness: 0 })
        } else if (existing.phase === 'dissolving') {
          existing.phase = 'sustain'
          existing.t = 0
        }
      }
    }

    // 2) Advance timers; pairs that left range transition to 'dissolving';
    //    pairs finished dissolving are removed.
    for (const [key, s] of connections) {
      if (!inRange.has(key) && s.phase !== 'dissolving') {
        s.phase = 'dissolving'
        s.t = 0
      }
      s.t += dt
      if (s.phase === 'forming' && s.t >= formDuration) {
        s.phase = 'sustain'
        s.t = 0
      } else if (s.phase === 'dissolving' && s.t >= fadeDuration) {
        connections.delete(key)
      }
    }

    // 3) Emit one segment per tracked pair, with length + brightness
    //    derived from phase.
    const linePos = linesGeom.attributes.position.array as Float32Array
    const lineCol = linesGeom.attributes.color.array as Float32Array
    let link = 0

    for (const [key, s] of connections) {
      if (link >= MAX_LINKS) break
      const i = (key / POINT_COUNT) | 0
      const j = key - i * POINT_COUNT
      const ix = i * 3
      const jx = j * 3
      const ax = pos[ix]
      const ay = pos[ix + 1]
      const az = pos[ix + 2]
      const bx = pos[jx]
      const by = pos[jx + 1]
      const bz = pos[jx + 2]

      let endX = bx
      let endY = by
      let endZ = bz
      let brightness = 0

      if (s.phase === 'forming') {
        // ease-out-quart: confident, refined settle — 1 - (1-t)^4
        const u = formDuration > 0 ? Math.min(1, s.t / formDuration) : 1
        const eased = 1 - Math.pow(1 - u, 4)
        endX = ax + (bx - ax) * eased
        endY = ay + (by - ay) * eased
        endZ = az + (bz - az) * eased
        const dx = ax - bx
        const dy = ay - by
        const dz = az - bz
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const prox = Math.max(0, 1 - d / LINK_DISTANCE)
        const target = SUSTAIN_FLOOR + (1 - SUSTAIN_FLOOR) * prox
        brightness = eased * target
        s.lastBrightness = brightness
      } else if (s.phase === 'sustain') {
        const dx = ax - bx
        const dy = ay - by
        const dz = az - bz
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const prox = Math.max(0, 1 - d / LINK_DISTANCE)
        // Floor keeps the line perceivable right up to the threshold so
        // its fade-out has real intensity to start decaying from.
        brightness = SUSTAIN_FLOOR + (1 - SUSTAIN_FLOOR) * prox
        s.lastBrightness = brightness
      } else {
        // dissolving: quadratic ease-out, starting from brightness at
        // dissolve-onset so the fade reads as natural decay.
        const u = fadeDuration > 0 ? Math.min(1, s.t / fadeDuration) : 1
        const fade = (1 - u) * (1 - u)
        brightness = s.lastBrightness * fade
      }

      const base = link * 6
      const out = brightness * BG_LINE_INTENSITY
      linePos[base] = ax
      linePos[base + 1] = ay
      linePos[base + 2] = az
      linePos[base + 3] = endX
      linePos[base + 4] = endY
      linePos[base + 5] = endZ
      lineCol[base] = out
      lineCol[base + 1] = out
      lineCol[base + 2] = out
      lineCol[base + 3] = out
      lineCol[base + 4] = out
      lineCol[base + 5] = out
      link++
    }

    linesGeom.setDrawRange(0, link * 2)
    linesGeom.attributes.position.needsUpdate = true
    linesGeom.attributes.color.needsUpdate = true
  })

  return (
    <group>
      {/* Both objects are in the transparent queue, so three.js sorts them
          by camera distance and JSX order is ignored. Force it with
          renderOrder: lines at -1 (drawn first), pins at +1 (drawn on top).
          Pin opacity kept at 1.0 so additive line color under the sprite
          can't bleed through the 5% it would at 0.95. */}
      <lineSegments ref={linesRef} geometry={linesGeom} renderOrder={-1}>
        <lineBasicMaterial
          color={PIN_COLOR}
          vertexColors
          transparent
          opacity={1.0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
      <points ref={pointsRef} geometry={pointsGeom} renderOrder={1}>
        <pointsMaterial
          map={pinTexture}
          color="#ffffff"
          size={1.1}
          sizeAttenuation
          transparent
          alphaTest={0.05}
          opacity={1.0}
          depthWrite={false}
          onBeforeCompile={(shader) => {
            // Clamp gl_PointSize so far-plane pins don't shrink to a pixel
            // on large viewports and near-plane ones don't bloat on small.
            shader.vertexShader = shader.vertexShader.replace(
              'gl_PointSize = size;',
              'gl_PointSize = clamp( size, 2.0, 36.0 );',
            )
            shader.vertexShader = shader.vertexShader.replace(
              'gl_PointSize *= ( scale / - mvPosition.z );',
              'gl_PointSize = clamp( gl_PointSize * ( scale / - mvPosition.z ), 6.0, 42.0 );',
            )
          }}
        />
      </points>
    </group>
  )
}
