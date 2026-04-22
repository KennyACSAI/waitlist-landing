import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import YoovaPin, { type PinMeasurement } from './YoovaPin'
import Starfield from './Starfield'

// ============================================================================
// PIN INTRO ANIMATION — entrance choreography that mirrors the headline's
// "glide" phase in App.tsx (delay ~900ms after mount, then a 1.6s ease-out
// travel). Main pin rises from below; side pins sweep in from their world
// sides (A from the right, B from the left). Orbit rotation is held at 0
// for the full intro and only begins advancing once progress reaches 1 — so
// the pins finish "docking" before starting to orbit.
// ============================================================================
const PIN_INTRO = {
  /** Seconds between scene mount and the first frame of movement. Matches
   *  the 900ms headline glide delay so text and pins leave their starting
   *  positions on the same beat. */
  delayS: 0.9,
  /** Seconds for the full 0→1 intro ease. Matches the headline wrapper's
   *  1600ms translate transition. */
  durationS: 1.6,
  /** World-Y offset the main pin starts at (negative = below). Slides up
   *  to 0 over the intro. Big enough that the pin enters the frame from
   *  off-screen even on tall viewports. */
  mainFromY: -7,
  /** World-X offset magnitude the side pins start at (applied in each pin's
   *  local frame; pin A's local +X = world +X, pin B's local +X = world -X
   *  because of its 180° phase rotation — so the same positive value puts
   *  pin A far right and pin B far left, and both slide inward as it
   *  decays to 0). */
  sideFromX: 9,
}
// ============================================================================

// ============================================================================
// MAIN PIN SIZE — world-unit scale for the big center pin, per viewport.
// Side pins are sized as a FRACTION of the main pin (see SIDE_PINS below),
// so changing these values also proportionally changes side pins at the
// same fraction — the two scenes stay in balance automatically. Edit
// sizeMobile to shrink/grow the big pin on phones without affecting desktop.
// ============================================================================
const MAIN_PIN = {
  /** Big pin scale on desktop (>640px viewport). Multiplier on the GLB's
   *  natural size. Default 2 ≈ fills about a third of viewport height. */
  sizeDesktop: 2,
  /** Big pin scale on mobile (≤640px viewport). Smaller than desktop so
   *  the pin + headline + form all fit in one portrait screen without
   *  crowding. */
  sizeMobile: 1.7,
}
// ============================================================================

// ============================================================================
// SIDE PIN CONTROLS — applies to BOTH the left and right orbiting pins.
// Edit any value here and both pins update symmetrically. No other file to
// touch. Keep units in the comments so tweaks stay predictable.
// ============================================================================
const SIDE_PINS = {
  /** Pin size on desktop, as a fraction of the main pin (main = 1.0).
   *  0.5 = half the main pin's scale; 1.0 = same size. */
  sizeDesktop: 0.60,
  /** Pin size on narrow viewports (≤640px). Smaller so all three fit. */
  sizeMobile: 0.55,
  /** How far each pin leans outward from vertical, in degrees.
   *  0 = pins stand upright (stacked at main tip, not useful).
   *  45 = classic cone — heads sweep at equal horizontal + vertical offset.
   *  90 = pins lie flat, heads orbit at main-tip height. */
  leanDegrees: 25,
  /** Orbit angular speed in radians per second. Positive = CCW viewed from
   *  above; negative = CW. 0 = frozen (tips welded, no motion). */
  orbitSpeed: 0.6,
  /** Angular spacing between the two pins around the orbit, in degrees.
   *  180 = opposite sides (default). 120 or 90 spreads them differently
   *  — note with only two pins the scene reads strangely below ~120°. */
  phaseDegrees: 180,
  /** Vertical shift of the orbit hinge (positive = above main tip, negative
   *  = below). 0 welds tips exactly to the main pin's tip. Useful if the
   *  tips clip the main pin's geometry and you want a small gap. */
  anchorOffsetY: 0.5,
  /** Horizontal shift of the orbit hinge. Usually 0 (keeps the orbit
   *  centered on the main pin's vertical axis). Non-zero decouples the
   *  orbit center from the main pin, which breaks the "welded tips" look. */
  anchorOffsetX: 0,
  /** Depth shift of the orbit hinge (positive = toward the camera, negative
   *  = away into the scene). Moves the entire side-pin rig forward/back
   *  without affecting Y or X. Visually this also changes perspective
   *  size (closer = larger, farther = smaller) because the scene is
   *  perspective-projected. 0 keeps the orbit in the same depth plane as
   *  the main pin. */
  anchorOffsetZ: 0,
  /** Distance between the two side pins' tips, in world units, on desktop.
   *  0 = tips welded together at the hinge (converge to one point).
   *  Positive values split the tips symmetrically along the phase axis —
   *  pin A moves outward, pin B moves outward in its rotated frame. The
   *  total head-to-head separation at opposite-lean snapshot is
   *  2·sin(lean)·pinLength + tipSeparation, so this adds directly to
   *  whatever spread the lean already gives. */
  tipSeparation: 2.2,
  /** Same control, on mobile (≤640px). Kept as its own knob so you can
   *  tighten the orbit on phones without affecting desktop — narrow
   *  viewports usually want less spread so all three pins read as one
   *  motif rather than scattered. */
  tipSeparationMobile: 1.78,
}
// ============================================================================

/**
 * Two side pins hinged at the main pin's tip, leaning outward and orbiting
 * the vertical axis through that tip — tips stay welded while heads sweep
 * a horizontal circle.
 *
 * Transform stack (outer→inner):
 *   anchor   — translates to (anchorX, anchorY, 0); this is the hinge point
 *   orbit    — rotation.y ticks every frame; drives the conical orbit
 *   phase    — identity for pin A, `phaseRadians` around Y for pin B
 *   lean     — rotation.z = -leanRadians tilts the pin along the cone
 *   YoovaPin — positionY = tipLift so the pin model's tip coincides with
 *              the anchor origin (ensures tip stays glued to main tip)
 */
function OrbitingSidePins({
  anchorX,
  anchorY,
  anchorZ,
  tipLift,
  sideScale,
  leanRadians,
  phaseRadians,
  tipSeparation,
  orbitRef,
  sideAWrapRef,
  sideBWrapRef,
  wrapInitialX,
}: {
  anchorX: number
  anchorY: number
  anchorZ: number
  tipLift: number
  sideScale: number
  leanRadians: number
  phaseRadians: number
  tipSeparation: number
  orbitRef: React.RefObject<THREE.Group | null>
  sideAWrapRef: React.RefObject<THREE.Group | null>
  sideBWrapRef: React.RefObject<THREE.Group | null>
  /** Initial X offset applied to each pin's wrap group via JSX so the FIRST
   *  render already has them at their entrance position. Side pins only
   *  mount once the main-pin measurement resolves, which may happen after
   *  PinsIntroDriver has already started advancing — without this, pins
   *  would flash at rest for one frame before the driver takes over. */
  wrapInitialX: number
}) {
  // Orbit rotation + intro X-offsets are both driven externally by
  // PinsIntroDriver — this component is now purely structural.
  return (
    <group position={[anchorX, anchorY, anchorZ]}>
      <group ref={orbitRef}>
        {/* Pin A — intro wrap carries the sliding-in X offset (in world-X
            space while orbit is held at 0, which it is throughout the
            intro). Tip offset / lean / YoovaPin nest inside. */}
        <group ref={sideAWrapRef} position={[wrapInitialX, 0, 0]}>
          <group position={[tipSeparation / 2, 0, 0]}>
            <group rotation={[0, 0, -leanRadians]}>
              <YoovaPin positionY={tipLift} scale={sideScale} spinSpeed={0} />
            </group>
          </group>
        </group>
        {/* Pin B — phase rotation FIRST so its local +X points opposite pin
            A's +X, then its own intro wrap (same sign of offset → opposite
            world direction → "slides in from the left"). */}
        <group rotation={[0, phaseRadians, 0]}>
          <group ref={sideBWrapRef} position={[wrapInitialX, 0, 0]}>
            <group position={[tipSeparation / 2, 0, 0]}>
              <group rotation={[0, 0, -leanRadians]}>
                <YoovaPin positionY={tipLift} scale={sideScale} spinSpeed={0} />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

/**
 * Drives all three pins' entrance animation + the side-pin orbit on a single
 * clock, so the pieces stay phase-locked. Renders nothing — it's a pure
 * side-effect component inside <Canvas>.
 *
 *   t < delayS               → pins held at start positions (below / outside)
 *   delayS ≤ t < delay+dur   → ease-out-quart toward rest
 *   t ≥ delay+dur            → rest position, orbit begins advancing
 *
 * Reduced motion: snap to rest on first frame, leave orbit frozen (matches
 * the prior static-orbit contract for that accessibility preference).
 */
function PinsIntroDriver({
  mainWrapRef,
  orbitRef,
  sideAWrapRef,
  sideBWrapRef,
  orbitSpeed,
}: {
  mainWrapRef: React.RefObject<THREE.Group | null>
  orbitRef: React.RefObject<THREE.Group | null>
  sideAWrapRef: React.RefObject<THREE.Group | null>
  sideBWrapRef: React.RefObject<THREE.Group | null>
  orbitSpeed: number
}) {
  const startRef = useRef<number | null>(null)
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
  useFrame((state, dt) => {
    if (reducedMotionRef.current) {
      if (mainWrapRef.current) mainWrapRef.current.position.y = 0
      if (sideAWrapRef.current) sideAWrapRef.current.position.x = 0
      if (sideBWrapRef.current) sideBWrapRef.current.position.x = 0
      return
    }
    if (startRef.current === null) startRef.current = state.clock.elapsedTime
    const elapsed = state.clock.elapsedTime - startRef.current
    const raw = Math.min(1, Math.max(0, (elapsed - PIN_INTRO.delayS) / PIN_INTRO.durationS))
    // Ease-out-quart — fast departure, soft landing. Matches the overall
    // "arrive and settle" feel of the headline's ease-in-out glide (same
    // landing profile, slightly earlier arrival) without copying its exact
    // curve — they're different motions (translate vs. scale+translate).
    const eased = 1 - Math.pow(1 - raw, 4)
    const remaining = 1 - eased
    if (mainWrapRef.current) mainWrapRef.current.position.y = PIN_INTRO.mainFromY * remaining
    if (sideAWrapRef.current) sideAWrapRef.current.position.x = PIN_INTRO.sideFromX * remaining
    if (sideBWrapRef.current) sideBWrapRef.current.position.x = PIN_INTRO.sideFromX * remaining
    // Hold the orbit at rotation.y = 0 throughout the intro so the X offset
    // (applied in each pin's local frame) reads as a world-space slide-in.
    // Start advancing only once pins are fully docked at rest.
    if (raw >= 1 && orbitRef.current) {
      orbitRef.current.rotation.y += dt * orbitSpeed
    }
  })
  return null
}

/**
 * Installs a PMREM-filtered RoomEnvironment onto scene.environment so the
 * pin's PBR material gets realistic spec reflections / soft ambient.
 * Stays invisible — this is IBL, not a visible skybox.
 */
function SceneEnvironment({ intensity = 0.6 }: { intensity?: number }) {
  const { scene, gl } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = intensity
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [scene, gl, intensity])
  return null
}

interface HeroSceneProps {
  pinPositionY?: number
  onPinMeasured?: (info: PinMeasurement) => void
}

/**
 * Reactive narrow-viewport hook — re-reads on resize/rotate so the Canvas
 * DPR cap updates when a tablet flips into landscape instead of freezing
 * at whatever width loaded first.
 */
function useIsNarrowViewport() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const update = () => setNarrow(mq.matches)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return narrow
}

export default function HeroScene({ pinPositionY = -0.6, onPinMeasured }: HeroSceneProps) {
  const isMobileViewport = useIsNarrowViewport()

  // Local copy of the main pin's measurement. Drives side pin placement
  // (we need bottomOffsetY to compute where the tilted side pin's tip
  // lands so we can dock it to the main pin's tip point). Forwarded to
  // the parent too so the DOM placeholder still sizes correctly.
  const [measurement, setMeasurement] = useState<PinMeasurement | null>(null)
  const handleMeasured = useCallback(
    (info: PinMeasurement) => {
      setMeasurement(info)
      onPinMeasured?.(info)
    },
    [onPinMeasured],
  )

  // Refs for the intro animation. Created once here and passed down so the
  // PinsIntroDriver can mutate all three pins' wrap groups from a single
  // useFrame (keeps the three entrances phase-locked) and also hold the
  // side-pin orbit at rotation.y = 0 for the duration of the intro.
  const mainWrapRef = useRef<THREE.Group | null>(null)
  const orbitRef = useRef<THREE.Group | null>(null)
  const sideAWrapRef = useRef<THREE.Group | null>(null)
  const sideBWrapRef = useRef<THREE.Group | null>(null)
  // Initial positions for the wrap groups — applied via JSX so the VERY
  // FIRST render already has pins off-screen. Without this, there'd be a
  // one-frame flash of pins at their rest positions before PinsIntroDriver's
  // useFrame writes the eased offset.
  const mainWrapInitialY = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : PIN_INTRO.mainFromY,
    [],
  )
  const sideWrapInitialX = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : PIN_INTRO.sideFromX,
    [],
  )

  // Side pin geometry. Main pin renders at scale=MAIN_SCALE. SIDE_PINS.size*
  // is expressed as a fraction of the main pin (0.5 = half-size), so the
  // actual world scale = fraction * MAIN_SCALE. Measurement was captured at
  // MAIN_SCALE; scale it linearly to the side pin's scale to get the tip
  // offset distance that places each pin's tip exactly on the hinge.
  const MAIN_SCALE = isMobileViewport ? MAIN_PIN.sizeMobile : MAIN_PIN.sizeDesktop
  const sideFraction = isMobileViewport ? SIDE_PINS.sizeMobile : SIDE_PINS.sizeDesktop
  const sideScale = sideFraction * MAIN_SCALE
  const sideTipSeparation = isMobileViewport
    ? SIDE_PINS.tipSeparationMobile
    : SIDE_PINS.tipSeparation
  const b = measurement?.bottomOffsetY ?? 0 // negative; group-origin → tip
  const tipLift = Math.abs(b) * sideFraction // side-pin tip offset in world
  const mainTipY = pinPositionY + b // world Y of the main pin's tip

  return (
    <Canvas
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      dpr={[1, isMobileViewport ? 1.25 : 1.5]}
      camera={{ position: [0, 0, 7.5], fov: 55, near: 0.1, far: 50 }}
      style={{ background: 'transparent' }}
      events={undefined}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 0.75
      }}>
      <Suspense fallback={null}>
        <SceneEnvironment intensity={0.45} />

        {/* Soft fill — won't crush the IBL contribution */}
        <ambientLight intensity={0.15} />

        {/* Key light — no shadows (contact-shadow plane removed) */}
        <directionalLight position={[3, 5, 4]} intensity={0.9} color="#ffffff" />

        {/* Cool rim light — shapes the silhouette without tinting the face */}
        <directionalLight position={[-4, 2, -3]} intensity={0.2} color="#ffffff" />

        <Starfield />

        {/* Main pin wrapped in an intro group — slides up from mainFromY to
            0. YoovaPin's measurement uses getWorldPosition, so its reported
            deltas (bottomOffsetY, centerOffsetY) are invariant under this
            translation: the main pin can start off-screen and still emit
            the same measurement it would at rest. That keeps side-pin tip
            alignment correct no matter which frame the measurement fires on. */}
        <group ref={mainWrapRef} position={[0, mainWrapInitialY, 0]}>
          {/* Static 90° Y-rotation to align the main pin's face orientation
              with the side pins (side pins get their facing from the orbit
              frame; the bare main pin needs an extra phase offset so all
              three read as the same motif rather than "center pin flipped
              90° from the other two"). Spin still accumulates on top of
              this via YoovaPin's own useFrame. */}
          <group rotation={[0, Math.PI / 2, 0]}>
            <YoovaPin positionY={pinPositionY} scale={MAIN_SCALE} onMeasured={handleMeasured} />
          </group>
        </group>

        {/* Side pins appear only after measurement — without it we'd have
            to guess bottomOffsetY and their tips wouldn't converge at the
            main tip. Rendering is cheap here because the glb is already
            loaded (instances share the useLoader cache via MODEL_URL).
            OrbitingSidePins welds each side pin's tip to the main tip and
            sweeps their heads on a horizontal circle above it. Each pin's
            wrap group starts pre-offset on X so the first render already
            has them off-frame; PinsIntroDriver eases them to 0. */}
        {measurement && (
          <OrbitingSidePins
            anchorX={SIDE_PINS.anchorOffsetX}
            anchorY={mainTipY + SIDE_PINS.anchorOffsetY}
            anchorZ={SIDE_PINS.anchorOffsetZ}
            tipLift={tipLift}
            sideScale={sideScale}
            leanRadians={(SIDE_PINS.leanDegrees * Math.PI) / 180}
            phaseRadians={(SIDE_PINS.phaseDegrees * Math.PI) / 180}
            tipSeparation={sideTipSeparation}
            orbitRef={orbitRef}
            sideAWrapRef={sideAWrapRef}
            sideBWrapRef={sideBWrapRef}
            wrapInitialX={sideWrapInitialX}
          />
        )}

        {/* Single driver for all three pins' intro + the side-pin orbit.
            Keeps the three entrances phase-locked on one clock and holds
            the orbit at 0 until docking finishes. */}
        <PinsIntroDriver
          mainWrapRef={mainWrapRef}
          orbitRef={orbitRef}
          sideAWrapRef={sideAWrapRef}
          sideBWrapRef={sideBWrapRef}
          orbitSpeed={SIDE_PINS.orbitSpeed}
        />
      </Suspense>
    </Canvas>
  )
}
