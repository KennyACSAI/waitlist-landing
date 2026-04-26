import { useEffect, useMemo, useRef } from 'react'
import { extend, useFrame, type ThreeElement } from '@react-three/fiber'
import * as THREE from 'three'
import {
  EXCITE_DECAY_MS,
  PIN_DELAY_MS,
  PIN_FORM_MS,
  particleMood,
} from './particleStore'

/**
 * A soft, drifting, interactive point cloud in the brand color.
 *
 * Interactions (all uniform-driven -zero JS work per particle per frame):
 *  - Typing excite: keystrokes in the email input pull particles gently toward
 *    the input box, then release as the envelope decays.
 *  - Pin formation: on successful submit, a subset of particles coalesces
 *    into teardrop-shaped map pins scattered across the viewport. Permanent.
 */

const PIN_COUNT = 16
const PARTICLES_PER_PIN = 40

class ParticleMaterialImpl extends THREE.ShaderMaterial {
  constructor() {
    super({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 36 },
        uDpr: { value: Math.min(window.devicePixelRatio || 1, 1.5) },
        uColor: { value: new THREE.Color('#28aa97') },
        uExciteTarget: { value: new THREE.Vector3(0, -2, 0) },
        uExcite: { value: 0 },
        uPinForm: { value: 0 },
        uPinTargets: {
          value: Array.from({ length: PIN_COUNT }, () => new THREE.Vector3()),
        },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uSize;
        uniform float uDpr;
        uniform vec3  uExciteTarget;
        uniform float uExcite;
        uniform float uPinForm;
        uniform vec3  uPinTargets[${PIN_COUNT}];

        attribute float aScale;
        attribute float aSeed;
        attribute float aPinId;
        attribute vec3  aPinOffset;

        varying float vAlpha;
        varying float vPin;

        void main() {
          vec3 rest = position;

          // Slow organic drift.
          float t = uTime * 0.15 + aSeed * 6.2831;
          rest.x += sin(t) * 0.12;
          rest.y += cos(t * 0.9) * 0.12;
          rest.z += sin(t * 0.7) * 0.10;

          vec3 p = rest;

          // -- Typing excite: drift gently toward the email input -------------
          float dExcite = distance(rest, uExciteTarget);
          float excitePull = exp(-dExcite * 0.45) * uExcite;
          vec3 exciteJitter = vec3(
            sin(aSeed * 41.0 + uTime * 1.1),
            cos(aSeed * 31.0 + uTime * 1.0),
            sin(aSeed * 19.0 + uTime * 0.9)
          ) * 0.12;
          p = mix(p, uExciteTarget + exciteJitter, clamp(excitePull, 0.0, 0.35));

          vec4 mv = modelViewMatrix * vec4(p, 1.0);

          // -- Pin formation: coalesce assigned particles into map pins -------
          // Offsets are authored in view-space (XY) so pins render billboard-
          // aligned and at a consistent on-screen size regardless of depth.
          float pinMix = 0.0;
          if (aPinId >= 0.0 && uPinForm > 0.0) {
            int iPin = int(aPinId);
            vec3 targetWorld = vec3(0.0);
            for (int i = 0; i < ${PIN_COUNT}; i++) {
              if (i == iPin) targetWorld = uPinTargets[i];
            }
            vec4 pinView = modelViewMatrix * vec4(targetWorld, 1.0);
            vec4 pinned = pinView + vec4(aPinOffset, 0.0);
            pinMix = smoothstep(0.0, 1.0, uPinForm);
            mv = mix(mv, pinned, pinMix);
          }

          gl_Position = projectionMatrix * mv;

          float dist = -mv.z;
          float sizeBoost = 1.0 + uExcite * 0.18 + pinMix * 0.15;
          gl_PointSize = uSize * aScale * uDpr * sizeBoost * (1.0 / max(dist, 0.1));

          float nearFade = smoothstep(0.5, 1.8, dist);
          float farFade  = 1.0 - smoothstep(8.0, 16.0, dist);
          vAlpha = nearFade * farFade;
          vPin = pinMix;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        varying float vPin;

        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          float a = smoothstep(0.5, 0.0, d);
          float core = smoothstep(0.22, 0.0, d);
          vec3 col = uColor + core * 0.35;
          // Pinned particles get a touch more core punch so pin shapes read clearly.
          float alpha = a * vAlpha * (0.9 + vPin * 0.35);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    })
  }
}

const ParticleMaterial = extend(ParticleMaterialImpl)

declare module '@react-three/fiber' {
  interface ThreeElements {
    particleMaterialImpl: ThreeElement<typeof ParticleMaterialImpl>
  }
}

interface ParticleFieldProps {
  count?: number
  radius?: number
}

/**
 * Writes a random point inside a classic map-pin silhouette (view-space
 * units) into `out` at index `i`.
 *
 * Layout (readable as the universal "Google Maps" pin):
 *   - HEAD: outlined ring (annulus) with a visible hole -the dot/donut.
 *   - NECK: two short tangent lines sweeping down from the ring's lower sides
 *     so the tail visibly connects to the head rather than floating below it.
 *   - TAIL: long triangle tapering to a sharp point -the pointer tip.
 *   - TIP : small dense cluster right at the tip for extra punch.
 */
function sampleTeardrop(out: Float32Array, i: number) {
  const HEAD_CY = 0.18
  const HEAD_OUTER = 0.22
  const HEAD_INNER = 0.12
  const TAIL_TIP_Y = -0.52
  const TAIL_BASE_Y = -0.02
  const TAIL_BASE_HW = 0.14

  // Probability bands -tuned so the ring reads clearly AND the pointer tip
  // has enough density to look like a sharp point rather than a fizzle.
  const r0 = Math.random()
  if (r0 < 0.55) {
    // Ring: uniform-area sampling in an annulus.
    const th = Math.random() * Math.PI * 2
    const u = Math.random()
    const r = Math.sqrt(HEAD_INNER * HEAD_INNER + u * (HEAD_OUTER * HEAD_OUTER - HEAD_INNER * HEAD_INNER))
    out[i + 0] = Math.cos(th) * r
    out[i + 1] = HEAD_CY + Math.sin(th) * r
    out[i + 2] = 0
  } else if (r0 < 0.9) {
    // Tail triangle. `1 - sqrt(u)` concentrates mass near the wider base,
    // giving uniform planar density inside the triangle.
    const t = 1 - Math.sqrt(Math.random())
    const halfW = TAIL_BASE_HW * (1 - t)
    out[i + 0] = (Math.random() * 2 - 1) * halfW
    out[i + 1] = TAIL_BASE_Y + t * (TAIL_TIP_Y - TAIL_BASE_Y)
    out[i + 2] = 0
  } else {
    // Tip dot: tight cluster right at the pointer tip so the point reads sharp.
    const th = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * 0.035
    out[i + 0] = Math.cos(th) * r
    out[i + 1] = TAIL_TIP_Y + 0.02 + Math.sin(th) * r * 0.6
    out[i + 2] = 0
  }
}

/**
 * 16 pin targets spread across the viewport as a 4×4 jittered grid.
 * Deterministic jitter so positions stay stable across reloads.
 */
function computePinTargets(): THREE.Vector3[] {
  const COLS = 4
  const ROWS = 4
  const X_RANGE = 11
  const Y_RANGE = 6.2
  const cellW = X_RANGE / COLS
  const cellH = Y_RANGE / ROWS
  let s = 0.31415
  const rng = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  const pts: THREE.Vector3[] = []
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cx = -X_RANGE / 2 + cellW * (col + 0.5)
      const cy = Y_RANGE / 2 - cellH * (row + 0.5)
      const jx = (rng() - 0.5) * cellW * 0.55
      const jy = (rng() - 0.5) * cellH * 0.55
      const jz = (rng() - 0.5) * 2.2
      pts.push(new THREE.Vector3(cx + jx, cy + jy, jz))
    }
  }
  return pts
}

export default function ParticleField({ count = 1500, radius = 6 }: ParticleFieldProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const matRef = useRef<ParticleMaterialImpl>(null!)
  // NDC-space pointer, fed by a window listener. We don't rely on R3F's
  // `state.pointer` because HeroScene disables the event system
  // (`events={undefined}`) for perf, which leaves that value at (0,0).
  const pointerNdc = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointerNdc.current.x = (e.clientX / window.innerWidth) * 2 - 1
      pointerNdc.current.y = -((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  const [positions, scales, seeds, pinIds, pinOffsets, pinTargets] = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const scales = new Float32Array(count)
    const seeds = new Float32Array(count)
    const pinIds = new Float32Array(count)
    const pinOffsets = new Float32Array(count * 3)
    const pinCapacity = PIN_COUNT * PARTICLES_PER_PIN

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = radius * (0.35 + Math.pow(Math.random(), 1.5) * 0.65)
      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.7
      positions[i * 3 + 2] = r * Math.cos(phi) * 0.9
      scales[i] = 0.4 + Math.random() * 1.6
      seeds[i] = Math.random()

      if (i < pinCapacity) {
        pinIds[i] = Math.floor(i / PARTICLES_PER_PIN)
        sampleTeardrop(pinOffsets, i * 3)
      } else {
        pinIds[i] = -1
      }
    }

    return [positions, scales, seeds, pinIds, pinOffsets, computePinTargets()]
  }, [count, radius])

  // Upload pin targets once -the Vector3 instances inside the uniform persist.
  useEffect(() => {
    if (!matRef.current) return
    const arr = matRef.current.uniforms.uPinTargets.value as THREE.Vector3[]
    pinTargets.forEach((v, i) => arr[i].copy(v))
  }, [pinTargets])

  const tmpExciteLocal = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dt) => {
    const mat = matRef.current
    const group = groupRef.current
    if (!mat || !group) return

    mat.uniforms.uTime.value += dt

    // -- Excite envelope (sustain while typing, decay after last keystroke) -
    const sinceKey = performance.now() - particleMood.lastKeystrokeMs
    const exciteEnv = Math.max(0, 1 - sinceKey / EXCITE_DECAY_MS)
    mat.uniforms.uExcite.value += (exciteEnv - mat.uniforms.uExcite.value) * (1 - Math.exp(-dt * 1.8))

    tmpExciteLocal.set(
      particleMood.exciteTarget.x,
      particleMood.exciteTarget.y,
      particleMood.exciteTarget.z,
    )
    group.worldToLocal(tmpExciteLocal)
    mat.uniforms.uExciteTarget.value.copy(tmpExciteLocal)

    // -- Pin formation (0 -> 1 after PIN_DELAY_MS, then holds permanently) --
    // Before submit, pinFormStartMs is -Infinity → skip entirely so pins
    // aren't visible on load.
    let pinProgress = 0
    if (Number.isFinite(particleMood.pinFormStartMs)) {
      const sincePin = performance.now() - particleMood.pinFormStartMs
      pinProgress = Math.max(
        0,
        Math.min(1, (sincePin - PIN_DELAY_MS) / PIN_FORM_MS),
      )
    }
    mat.uniforms.uPinForm.value = pinProgress

    // -- Global parallax: the whole field subtly leans toward the cursor ---
    const tx = pointerNdc.current.x * 0.22
    const ty = -pointerNdc.current.y * 0.16
    group.rotation.y += (tx - group.rotation.y) * 0.06
    group.rotation.x += (ty - group.rotation.x) * 0.06
    group.rotation.z += dt * 0.01
  })

  return (
    <group ref={groupRef}>
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={positions.length / 3}
          />
          <bufferAttribute attach="attributes-aScale" args={[scales, 1]} count={scales.length} />
          <bufferAttribute attach="attributes-aSeed" args={[seeds, 1]} count={seeds.length} />
          <bufferAttribute attach="attributes-aPinId" args={[pinIds, 1]} count={pinIds.length} />
          <bufferAttribute
            attach="attributes-aPinOffset"
            args={[pinOffsets, 3]}
            count={pinOffsets.length / 3}
          />
        </bufferGeometry>
        <ParticleMaterial ref={matRef} />
      </points>
    </group>
  )
}
