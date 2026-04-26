import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, type Variants } from 'framer-motion'
import WaitlistForm from './components/WaitlistForm'
import { ShimmerText } from './components/ui/shimmer-text'
import { TextEffect } from './components/ui/text-effect'
import type { PinMeasurement } from './three/YoovaPin'

// Code-split the R3F scene: the 10MB glb + three.js chunk only downloads
// after first paint, so text/header/form appear instantly on cold loads.
const HeroScene = lazy(() => import('./three/HeroScene'))

// Must match HeroScene's <Canvas camera={...}>.
const CAM_Z = 7.5
const FOV_DEG = 55
const VISIBLE_WORLD_H = 2 * CAM_Z * Math.tan((FOV_DEG * Math.PI) / 360)

// ============================================================================
// PC GAP SINGLE-KNOB -changes ALL FOUR gaps in lockstep on desktop (≥640px).
//   header → [A] → headline → [B] → pins → [C] → form → [D] → footer
// Edit this one number and every PC gap resizes by the same amount, so the
// four distances stay mathematically equal without hand-syncing four
// spacer divs. Mobile uses its own per-spacer weights (unchanged).
//   Bigger value (e.g. 20) → bigger equal gaps → cluster pushed further down
//   Smaller value (e.g. 5) → smaller equal gaps → cluster pulled up
// ============================================================================
const PC_SPACER_FLEX = 10

// ============================================================================
// MAP BACKDROP TUNING -Rome map layer (z-0). Two sets of knobs: one for
// desktop, one for mobile (≤640px). Edit either object and hot reload picks
// it up instantly. All four controls work together; start with `size`, then
// `position`, then `opacity`, then optionally `filter`.
//
//   size     -'cover' | 'contain' | '100%' | '150%' | '200%' | '200% auto'
//              Higher % = zoomed IN more, less of the map shows per viewport.
//              'cover'   fills viewport, may crop edges
//              'contain' shows whole image, may leave bands
//              '200%'    = 2x zoom relative to viewport width
//              '200% auto' = width 2x, height scales proportionally
//
//   position -'center' | '50% 50%' | '30% 70%' | 'center 40%' | 'left top'
//              First value = horizontal, second = vertical.
//              0% = left/top edge, 100% = right/bottom edge.
//              Change this to shift which part of Rome sits behind the pin.
//
//   opacity  -0 invisible → 1 fully visible. Current values keep it subtle.
//
//   filter   -'' (empty = no filter) OR a CSS filter string such as
//              'brightness(0.9) contrast(1.15) saturate(0.85)'
//              brightness < 1 darkens, contrast > 1 punches, saturate 0 = gray
// ============================================================================
const MAP_TUNING = {
  desktop: {
    size: '200%',
    position: 'center',
    opacity: 0.65,
    filter: '',
  },
  mobile: {
    // Phones have a narrow viewport, so the same '200%' reads MORE zoomed than
    // on desktop. Bump it if you want the map tighter around the pin, drop it
    // toward '150%' if you want more context visible.
    size: '450%',
    position: 'center',
    // Mobile screens crowd fast; a slightly lower opacity keeps the map as
    // atmosphere instead of competing with the pin + form.
    opacity: 0.65,
    filter: '',
  },
}

/**
 * Layer stacking (back → front):
 *   z-0  Giant YOOVA serif wordmark, sits just beneath the header
 *   z-1  R3F Canvas -big teal pin in front, canvas transparent so the
 *        serif reads around the pin silhouette
 *   z-2  Subtle noise grain
 *   z-3  Top + bottom vignette gradients for edge falloff
 *   z-10 Main content column -body copy + form
 *   z-20 Header nav + footer
 */
export default function App() {
  const pinPlaceholderRef = useRef<HTMLDivElement>(null)
  // The form is lifted to position:fixed so it stays visible across the
  // scroll, but its slot is preserved as a placeholder div in the flex
  // column. We measure the placeholder's screen position after layout
  // settles and pin the fixed form on top of it -keeps the form at the
  // SAME vertical position it occupied in the original single-screen
  // layout, regardless of viewport height or device safe-area insets.
  const formPlaceholderRef = useRef<HTMLDivElement>(null)
  const [formFixedTop, setFormFixedTop] = useState<number | null>(null)
  const [pinMeasurement, setPinMeasurement] = useState<PinMeasurement | null>(null)
  const [pinScreenH, setPinScreenH] = useState(() =>
    typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.35) : 300,
  )
  const [pinPositionY, setPinPositionY] = useState(-0.6)

  // Form status is lifted here so the social-proof line under the pill can
  // fade out when the absolute-positioned status message ("You're on the
  // list…") appears -otherwise they stack on the same Y and the success
  // message reads as overlapping the scarcity text.
  const [formStatus, setFormStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const showSocialProof = formStatus === 'idle' || formStatus === 'loading'

  // Reactive mobile check for MAP_TUNING -re-fires on rotate/resize so the
  // map swaps between desktop/mobile values when a tablet flips orientation.
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const update = () => setIsMobileViewport(mq.matches)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  const mapTuning = isMobileViewport ? MAP_TUNING.mobile : MAP_TUNING.desktop

  // Intro choreography: "Your New Verse" starts at viewport center, scaled up,
  // while the rest of the page is hidden. After two RAFs + a brief hold, we
  // flip introDone which releases the headline transform AND reveals the rest
  // (fade + rise). introReady gates a visibility:hidden on the root to avoid a
  // one-frame flash of the resting layout before the transform is applied.
  const headlineRef = useRef<HTMLHeadingElement>(null)
  const headlineWrapRef = useRef<HTMLDivElement>(null)
  const [introReady, setIntroReady] = useState(false)
  const [introDone, setIntroDone] = useState(false)
  // Gate for the wrapper's translate VALUE change. Flips two rAFs after
  // introDone so Yandex sees:
  //   frame N:   data-intro='done' painted → transition-duration is now
  //              1600ms, transform still at translateY(delta)
  //   frame N+1: transform flips to translateY(0) → transition fires
  // Chrome/Safari tolerated the atomic duration+value change; Yandex
  // evaluated the value under the old 0ms duration and teleported.
  const [introGlideStarted, setIntroGlideStarted] = useState(false)
  const [headlineDelta, setHeadlineDelta] = useState(0)
  // Single starting scale. The CSS transition on .intro-headline carries
  // it smoothly down to 1 over the FULL intro duration (fade-in + hold +
  // glide) -no intermediate stop. That eliminates the abrupt transition
  // feeling that a two-stage scale (pending→enter→done) produced: the
  // text is always shrinking, so the hold period is purely a translate
  // delay, not a velocity-zero pause.
  const [headlineStartScale, setHeadlineStartScale] = useState(2.1)

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setHeadlineDelta(0)
      setIntroReady(true)
      setIntroDone(true)
      setIntroGlideStarted(true)
      return
    }
    const el = headlineRef.current
    if (!el) {
      setIntroReady(true)
      setIntroDone(true)
      setIntroGlideStarted(true)
      return
    }
    const rect = el.getBoundingClientRect()
    const currentCenterY = rect.top + rect.height / 2
    const targetCenterY = window.innerHeight / 2
    setHeadlineDelta(targetCenterY - currentCenterY)
    // Fit-to-88%-width is the soft cap. Floor at 1.6 so the shrink
    // motion is always visible -on narrow phones the resting headline
    // already fills most of the width, which collapsed start-scale to
    // ~1 and killed the animation. html/body overflow-x: hidden
    // (index.css) contains the transient horizontal overflow while the
    // text is oversized during fade-in/hold.
    const maxFit = (window.innerWidth * 0.88) / Math.max(rect.width, 1)
    setHeadlineStartScale(Math.min(2.1, Math.max(1.6, maxFit)))

    // Cross-browser transition trigger: introReady is deferred to the
    // next animation frame rather than flipped synchronously. React
    // batches setState calls inside useLayoutEffect and flushes them
    // before the browser paints, so if introReady flipped here it
    // would commit to DOM in the SAME paint as the pending state,
    // meaning no "before" paint for the transition to interpolate
    // from. Chrome/Safari tolerate this (they fire transitions on
    // computed-style changes even without intervening paints). Yandex
    // and some Chromium forks don't -they need the pending state
    // painted at least once. Deferring via double rAF guarantees that.
    let rafA = 0
    let rafB = 0
    let rafC = 0
    let rafD = 0
    let timer = 0
    rafA = requestAnimationFrame(() => {
      rafB = requestAnimationFrame(() => {
        setIntroReady(true)
        // 900ms after the fade-in begins, flip introDone so the wrapper
        // starts gliding up. The h1's scale transition (2500ms total on
        // .intro-headline in index.css) keeps running through this flip,
        // so the text is still actively shrinking as the glide kicks in.
        // No stop-start -scale carries continuous motion across the
        // hold/glide boundary, so translate starting doesn't feel abrupt.
        timer = window.setTimeout(() => {
          setIntroDone(true)
          // Two rAFs after data-intro flips to 'done', change the
          // wrapper's inline transform. Guarantees the browser paints
          // the 1600ms-transition-duration state BEFORE the transform
          // target changes → transition fires in every engine.
          rafC = requestAnimationFrame(() => {
            rafD = requestAnimationFrame(() => {
              setIntroGlideStarted(true)
            })
          })
        }, 900)
      })
    })
    return () => {
      cancelAnimationFrame(rafA)
      cancelAnimationFrame(rafB)
      cancelAnimationFrame(rafC)
      cancelAnimationFrame(rafD)
      clearTimeout(timer)
    }
  }, [])

  // Re-measure headlineDelta whenever the flex layout might have shifted
  // (pin finishing load, window resize) -but only while the intro is in
  // its enter phase, where the wrapper's translate transition is disabled
  // so these updates land instantly without smear-animating. We clear the
  // WRAPPER's transform (the translate) to read the resting Y, then
  // restore it. The inner h1's scale is preserved -scale around
  // transform-origin 'center center' doesn't shift the element's own
  // center, so a scaled h1 still reports the correct center Y.
  useLayoutEffect(() => {
    if (introDone || !introReady) return
    const wrap = headlineWrapRef.current
    const el = headlineRef.current
    if (!wrap || !el) return
    const savedTransform = wrap.style.transform
    wrap.style.transform = 'none'
    const rect = el.getBoundingClientRect()
    wrap.style.transform = savedTransform
    const currentCenterY = rect.top + rect.height / 2
    const targetCenterY = window.innerHeight / 2
    setHeadlineDelta(targetCenterY - currentCenterY)
  }, [pinScreenH, introDone, introReady])

  const handlePinMeasured = useCallback((info: PinMeasurement) => {
    setPinMeasurement(info)
  }, [])

  // When pin bbox is known, compute its on-screen height so the DOM
  // placeholder reserves exactly the same vertical space.
  //
  // Gated on !introDone: pinScreenH can update during the fade-in /
  // hold phase (when the wrapper's translate transition is disabled,
  // the re-measure effect above picks up the resulting flex layout
  // shift and snaps delta to the new resting spot instantly). Once
  // introDone flips, pinScreenH freezes: the glide is in motion and
  // any spacer redistribution would move the landing target mid-flight
  // → visible jump. Because the freeze happens BEFORE the glide
  // rather than 1.6s after it, the post-landing "stretching" layout
  // shift is gone -layout is final by the time the text arrives at
  // its resting position.
  useLayoutEffect(() => {
    if (!pinMeasurement) return
    if (introDone) return
    const ph = (pinMeasurement.worldHeight / VISIBLE_WORLD_H) * window.innerHeight
    setPinScreenH(ph)
  }, [pinMeasurement, introDone])

  // Resize handling runs independently of the intro gate -once
  // pinMeasurement exists, window resizes always update pinScreenH so
  // the placeholder tracks viewport changes even after the intro is
  // done. (Resize during the 1.6s glide itself is vanishingly rare and
  // would require the user to drag the window exactly while the text
  // is gliding; we accept that edge case.)
  useEffect(() => {
    if (!pinMeasurement) return
    const recompute = () => {
      const ph = (pinMeasurement.worldHeight / VISIBLE_WORLD_H) * window.innerHeight
      setPinScreenH(ph)
    }
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [pinMeasurement])

  // After layout settles, measure the placeholder's screen position and push
  // the pin's 3D Y so its bbox center lands at the placeholder's center.
  // Flex-grow spacers around the placeholder are what enforce the four equal
  // gaps; this effect just keeps the 3D pin docked to the DOM slot.
  //
  // FIX A: removed `ro.observe(document.body)`. Body-level size changes
  // (e.g. mobile dvh adjustments when the browser hides chrome on a swipe
  // gesture, scrollbar visibility changes on desktop) were firing the
  // recompute mid-scroll, shifting pinPositionY underneath the running
  // pin animation - perceived as the pins drifting to "random Z positions"
  // on rebuild. We only observe the placeholder itself now.
  //
  // FIX B: recompute is a no-op while scrollProgressRef > 0 (animation
  // mid-flight). Even if the placeholder somehow resizes during the
  // pin exit/return animation, pinPositionY stays locked. After the
  // animation returns to 0, any pending recomputes can run again.
  useLayoutEffect(() => {
    if (!pinMeasurement) return
    let raf = 0
    const recompute = () => {
      // Lock pinPositionY during scroll so the pin doesn't drift mid-rebuild.
      if (scrollProgressRef.current > 0) return
      const el = pinPlaceholderRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const V = window.innerHeight
      const centerScreenY = rect.top + rect.height / 2
      // Screen Y to world Y (viewport center = world 0, +Y is up).
      const worldCenterY = (0.5 - centerScreenY / V) * VISIBLE_WORLD_H
      const groupY = worldCenterY - pinMeasurement.centerOffsetY
      setPinPositionY(groupY)
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(recompute)
    }
    schedule()
    const ro = new ResizeObserver(schedule)
    if (pinPlaceholderRef.current) ro.observe(pinPlaceholderRef.current)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [pinMeasurement, pinScreenH])

  // Measure the form placeholder's screen position so we can pin the
  // fixed-position form on top of it. Re-runs whenever pinScreenH changes
  // (which shifts the surrounding flex slots) AND on window resize.
  //
  // FIX A: removed `ro.observe(document.body)` - body-level resize events
  // would trigger a state update (setFormFixedTop), causing App re-renders
  // mid-scroll that compounded the pin-rebuild bug.
  useLayoutEffect(() => {
    const measure = () => {
      const el = formPlaceholderRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setFormFixedTop(rect.top)
    }
    let raf = 0
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    schedule()
    const ro = new ResizeObserver(schedule)
    if (formPlaceholderRef.current) ro.observe(formPlaceholderRef.current)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [pinScreenH])

  // ============================================================================
  // TRIGGER-BASED ANIMATION (replaces the controllable scroll-driven
  // version). Wheel/touch direction TOGGLES a boolean (`isExpanded`); the
  // animation runs to completion on its own clock - the user just nudges
  // direction, they don't drive each frame. Eliminates partial-scroll
  // edge cases (pin frozen halfway, side pin still in view, etc.).
  //
  // scrollProgressRef is animated 0→1 (or 1→0) over the appropriate
  // direction-specific duration via requestAnimationFrame, ease-out
  // cubic. HeroScene's useFrame reads the
  // ref unchanged. Page-2 reveal/hide is triggered inside the rAF the
  // instant the ref crosses PAGE2_REVEAL_PROGRESS - guarantees pins are
  // fully off-screen before page 2 appears.
  // ============================================================================
  // Separate durations per direction. The rAF effect picks one based on
  // isExpanded:
  //   isExpanded true  (scroll DOWN, pins exit + page 2 reveal) → DOWN
  //   isExpanded false (scroll UP,   pins rebuild + headline returns) → UP
  // The headline opacity rides the same rAF clock as the pins, so it
  // always tracks whichever direction is currently playing - no
  // separate tuning needed.
  const ANIM_DURATION_DOWN_MS = 2000
  const ANIM_DURATION_UP_MS = 1000
  const PAGE2_REVEAL_PROGRESS = 0.4
  const WHEEL_TRIGGER_THRESHOLD = 5
  const TOUCH_TRIGGER_THRESHOLD = 20

  const [isExpanded, setIsExpanded] = useState(false)
  const [showPage2, setShowPage2] = useState(false)
  // Mirror state into refs so the global wheel/touch listeners (bound
  // once after intro) can read latest values without re-binding on every
  // toggle.
  const isExpandedRef = useRef(false)
  useEffect(() => {
    isExpandedRef.current = isExpanded
  }, [isExpanded])

  // Live animated value read by HeroScene's useFrame each frame. Driven
  // by the rAF loop in the isExpanded effect below - no React renders
  // per frame.
  const scrollProgressRef = useRef(0)
  // Ref to the headline section so the rAF loop can drive its opacity
  // each frame off the SAME value as the pin animation. Without this,
  // headline opacity ran on its own CSS transition timer and finished
  // ahead of the pin re-entry on scroll-up - "header text appears much
  // faster than the pins". Now they're locked in lockstep.
  const headlineSectionRef = useRef<HTMLElement | null>(null)

  // Body scroll lock: ALWAYS locked. The page is 100dvh and page 2 is an
  // overlay - there's nothing to scroll to, ever. Wheel/touch drive the
  // trigger animation directly.
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Wheel + touch event handlers. Bound ONCE after intro completes
  // (isExpanded read via ref, never re-bound). Each event is a
  // directional nudge: down past threshold = expand, up = collapse.
  useEffect(() => {
    if (!introDone) return

    const touchStartYRef = { current: 0 }

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.deltaY > WHEEL_TRIGGER_THRESHOLD && !isExpandedRef.current) {
        setIsExpanded(true)
      } else if (e.deltaY < -WHEEL_TRIGGER_THRESHOLD && isExpandedRef.current) {
        setIsExpanded(false)
      }
    }

    const handleTouchStart = (e: TouchEvent) => {
      touchStartYRef.current = e.touches[0]?.clientY ?? 0
    }

    const handleTouchMove = (e: TouchEvent) => {
      const startY = touchStartYRef.current
      if (!startY) return
      const currentY = e.touches[0]?.clientY ?? 0
      const deltaY = startY - currentY
      e.preventDefault()
      if (deltaY > TOUCH_TRIGGER_THRESHOLD && !isExpandedRef.current) {
        setIsExpanded(true)
        touchStartYRef.current = currentY
      } else if (deltaY < -TOUCH_TRIGGER_THRESHOLD && isExpandedRef.current) {
        setIsExpanded(false)
        touchStartYRef.current = currentY
      }
    }

    const handleTouchEnd = () => {
      touchStartYRef.current = 0
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('touchstart', handleTouchStart, { passive: false })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd)

    return () => {
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [introDone])

  // Time-based animation of scrollProgressRef. Runs whenever isExpanded
  // flips - eases from current ref value toward new target (1 or 0)
  // over the direction-specific duration (DOWN for exit, UP for
  // rebuild). Mid-animation reversal works naturally because we always
  // start from the CURRENT ref value, not from 0/1, and pick up the
  // duration matching the new direction.
  // Toggles showPage2 the instant the ref crosses PAGE2_REVEAL_PROGRESS.
  // ALSO drives the headline section's opacity from the SAME value -
  // headline reaches opacity 0 at exactly the moment pins are fully
  // out (scrollProgressRef = PAGE2_REVEAL_PROGRESS), reaches opacity 1
  // at exactly the moment pins are fully back at rest. No drift between
  // the headline fade and the pin animation, ever.
  useEffect(() => {
    if (!introDone) return
    const target = isExpanded ? 1 : 0
    const duration = isExpanded ? ANIM_DURATION_DOWN_MS : ANIM_DURATION_UP_MS
    const from = scrollProgressRef.current
    const startTime = performance.now()
    let raf = 0
    let crossed = from >= PAGE2_REVEAL_PROGRESS
    const step = (now: number) => {
      const elapsed = now - startTime
      const t = Math.min(1, elapsed / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const value = from + (target - from) * eased
      scrollProgressRef.current = value
      // Headline opacity tied 1:1 to the same animated value - reaches 0
      // when pins are fully out (value >= PAGE2_REVEAL_PROGRESS), 1 when
      // value = 0. Direct DOM write avoids React renders per frame.
      if (headlineSectionRef.current) {
        const opacity = Math.max(0, 1 - value / PAGE2_REVEAL_PROGRESS)
        headlineSectionRef.current.style.opacity = String(opacity)
      }
      const aboveThreshold = value >= PAGE2_REVEAL_PROGRESS
      if (aboveThreshold !== crossed) {
        crossed = aboveThreshold
        setShowPage2(aboveThreshold)
      }
      if (t < 1) {
        raf = requestAnimationFrame(step)
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [isExpanded, introDone])

  const introState = introReady ? (introDone ? 'done' : 'enter') : 'pending'
  // Split into two transforms so translate and scale can run on different
  // timelines. Wrapper carries translate: held at delta during pending/
  // enter, glides to 0 over 1600ms during done. H1 carries scale: fixed
  // at headlineStartScale during pending, transitions to 1 over the full
  // 2500ms intro duration as soon as introReady flips. There's no
  // intermediate scale value -the scale motion is one single continuous
  // ease from "oversized" to "final", which crosses the hold→glide
  // boundary without stopping, keeping the overall motion smooth.
  const headlineWrapTransform = introGlideStarted
    ? 'translateY(0)'
    : `translateY(${headlineDelta}px)`
  const currentHeadlineScale = introReady ? 1 : headlineStartScale

  return (
    <div
      data-intro={introState}
      className="relative w-full overflow-hidden bg-ink-950 font-sans"
      style={{
        '--pc-spacer-flex': String(PC_SPACER_FLEX),
        // Page is exactly 100dvh -no document scroll. Wheel/touch drive
        // a virtual scrollProgress that animates pins out of the scene
        // and reveals page-2 content as a fixed-position overlay.
        minHeight: '100dvh',
      } as CSSProperties}>
      {/* Layer 0 -faint Rome street map backdrop.
          All tunable values live in MAP_TUNING at the top of this file. */}
      <div aria-hidden className="intro-fade pointer-events-none fixed inset-0 z-0">
        <div
          className="h-full w-full"
          style={{
            backgroundImage: 'url(/romemapwebp.webp)',
            backgroundSize: mapTuning.size,
            backgroundPosition: mapTuning.position,
            opacity: mapTuning.opacity,
            filter: mapTuning.filter || undefined,
          }}
        />
      </div>

      {/* Layer 1 -3D pin + starfield. scrollProgressRef drives the pin's
          scroll-zoom inside HeroScene's useFrame (no React re-renders). */}
      <div className="intro-fade pointer-events-none fixed inset-0 z-[1]">
        <Suspense fallback={null}>
          <HeroScene
            pinPositionY={pinPositionY}
            onPinMeasured={handlePinMeasured}
            scrollProgressRef={scrollProgressRef}
          />
        </Suspense>
      </div>

      {/* Layer 2 -noise */}
      <div className="intro-fade noise pointer-events-none fixed inset-0 z-[2]" />

      {/* Layer 3 -edge vignettes */}
      <div
        aria-hidden
        className="intro-fade pointer-events-none fixed inset-x-0 top-0 z-[3] h-24 bg-gradient-to-b from-ink-950/70 to-transparent sm:h-32"
      />
      <div
        aria-hidden
        className="intro-fade pointer-events-none fixed inset-x-0 bottom-0 z-[3] h-40 bg-gradient-to-t from-ink-950/85 to-transparent sm:h-56"
      />

      {/* Header -lifted from flex column to fixed top so it stays
          pinned through the whole scroll. Visibility (not opacity) gated
          for the iOS Safari backdrop-filter quirk noted on the form. */}
      <header
        className="intro-reveal-header fixed inset-x-0 top-0 z-20"
        style={{ visibility: introGlideStarted ? 'visible' : 'hidden' }}>
        <div className="liquid-glass-apple liquid-glass-apple--edge-bottom w-full items-center">
          <div aria-hidden className="liquid-glass-apple__effect" />
          <div aria-hidden className="liquid-glass-apple__tint" />
          <div aria-hidden className="liquid-glass-apple__shine" />
          <div
            className="liquid-glass-apple__content flex items-center justify-between"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.375rem)',
              paddingBottom: '0.375rem',
              paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
              paddingRight: 'max(0.5rem, env(safe-area-inset-right, 0px))',
            }}>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              aria-label="Yoova, home"
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-1 sm:gap-2.5 sm:px-2">
              <YoovaLogoMark />
              <span
                className="text-sm font-semibold tracking-tight text-white sm:text-base"
                style={{ fontFamily: "'Inclusive Sans', system-ui, sans-serif" }}>
                yoova
              </span>
            </a>
            <div className="flex items-center">
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                aria-disabled="true"
                aria-label="Instagram"
                className="inline-flex min-h-11 min-w-11 items-center justify-center text-white/70 transition-colors hover:text-white">
                <InstagramIcon />
              </a>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                aria-disabled="true"
                aria-label="LinkedIn"
                className="inline-flex min-h-11 min-w-11 items-center justify-center text-white/70 transition-colors hover:text-white">
                <LinkedInIcon />
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* PAGE 1 -hero. The flex layout matches the original 100dvh
          layout exactly. Header/form/footer are lifted to fixed-position
          siblings (so they remain reachable through scroll), but their
          original slots in the flex column are preserved as PLACEHOLDERS
          with matching heights -that way the spacer math is unchanged
          and the headline + pin land at the same vertical positions they
          did in the old single-screen design. */}
      <div className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden">
        {/* Header placeholder -reserves the vertical space the lifted
            header occupies, including iOS notch safe-area inset. */}
        <div
          aria-hidden
          className="relative z-10 w-full shrink-0"
          style={{ minHeight: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)' }}
        />

        {/* Spacer A -header → headline. */}
        <div aria-hidden className="pc-spacer-equal relative z-10 min-h-0 flex-1" />

        {/* Headline + cycling word. Fades out as scrollProgress climbs
            so it doesn't crowd the screen as the pins reverse-exit. */}
        <section
          ref={headlineSectionRef}
          className="relative z-10 flex flex-col items-center px-5 text-center"
          style={{ opacity: 1 }}>
          <div
            ref={headlineWrapRef}
            className="intro-headline-wrap mb-3"
            style={{
              transform: headlineWrapTransform,
              willChange: 'transform',
            }}>
            <h1
              ref={headlineRef}
              className="intro-headline text-balance text-4xl font-light leading-[1.05] tracking-tight text-white sm:text-6xl md:text-7xl"
              style={{
                transform: `scale(${currentHeadlineScale})`,
                transformOrigin: 'center center',
                willChange: 'transform, opacity',
              }}>
              <span className="font-bold">Your</span>{' '}
              <span className="italic font-light">New</span>{' '}
              <span className="font-bold">Verse</span>
            </h1>
          </div>
          <p className="intro-fade-up flex items-baseline justify-center gap-2 text-2xl font-light leading-tight text-zinc-200 sm:gap-3 sm:text-4xl md:text-5xl">
            <span className="text-zinc-400">of</span>
            <CyclingTextEffect words={['Socializing', 'Discovering', 'Connecting']} />
          </p>
        </section>

        {/* Spacer B -headline → pin slot. */}
        <div aria-hidden className="pc-spacer-equal relative z-10 min-h-0 flex-1" />

        <div
          ref={pinPlaceholderRef}
          aria-hidden
          className="pin-placeholder relative z-10 w-full shrink-0"
          style={{ height: `${pinScreenH}px` }}
        />

        {/* Spacer C -pin slot → form slot. */}
        <div aria-hidden className="pc-spacer-equal relative z-10 min-h-0 flex-1" />

        {/* Form placeholder -reserves the vertical space the lifted
            waitlist form occupies. We measure this slot's screen position
            after layout settles and pin the fixed-position form on top of
            it (see formFixedTop state below). */}
        <div
          ref={formPlaceholderRef}
          aria-hidden
          className="relative z-10 w-full shrink-0"
          style={{ minHeight: '6.25rem' }}
        />

        {/* Spacer D -form slot → footer. Same flex weights as the
            original layout (mobile flex-[0.5], PC pc-spacer-equal). */}
        <div aria-hidden className="pc-spacer-equal relative z-10 min-h-0 flex-[0.5]" />

        {/* Footer placeholder -reserves the lifted footer's vertical
            space, including iOS bottom safe-area inset. */}
        <div
          aria-hidden
          className="relative z-10 w-full shrink-0"
          style={{ minHeight: 'calc(env(safe-area-inset-bottom, 0px) + 3.5rem)' }}
        />
      </div>

      {/* PAGE 2 -"How Yoova Works" overlay. Fixed-positioned so it sits
          ON TOP of the hero in the same viewport (no document scroll).
          The fixed band sits between the header (top) and the form
          (which is at formFixedTop) -content is centered in that band.
          Hidden until scrollProgress crosses 0.95 (pins fully out), then
          AnimatePresence triggers a blur+slide-up spring stagger. */}
      <AnimatePresence>
        {showPage2 && (
          <motion.section
            key="page2-overlay"
            className="pointer-events-none fixed inset-x-0 z-10 flex items-center justify-center px-5"
            style={{
              top: 'calc(env(safe-area-inset-top, 0px) + 4rem)',
              // Stop just above the fixed form -bottom is computed from
              // formFixedTop with a small gap. Falls back to 38vh until
              // the form's position is measured.
              bottom: formFixedTop !== null
                ? `calc(100vh - ${formFixedTop}px + 1rem)`
                : '38vh',
            }}
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={page2ContainerVariants}>
            <HowYoovaWorks />
          </motion.section>
        )}
      </AnimatePresence>

      {/* Form -lifted to fixed-positioned center so it persists across
          the whole scroll. The user can type their email at any scroll
          position. The fixed `top` is driven by formFixedTop, which is
          measured from the placeholder slot inside the flex column,
          this pins the form at the SAME vertical position it occupied in
          the original single-screen layout. Falls back to 65vh until
          measurement completes (one-frame fallback, then snaps in).
          NO intro-fade ancestor: form's liquid-glass uses backdrop-filter
          which iOS Safari + some Chromium forks break when any ancestor
          has opacity < 1. Visibility-gated instead. */}
      <main
        className="intro-reveal-form fixed inset-x-0 z-30 flex w-full flex-col items-center px-5"
        style={{
          top: formFixedTop !== null ? `${formFixedTop}px` : '65vh',
          visibility: introGlideStarted ? 'visible' : 'hidden',
        }}>
        <div className="flex w-full max-w-xl flex-col items-center text-center">
          <WaitlistForm variant="hero" onStatusChange={setFormStatus} />
          <p
            aria-hidden={!showSocialProof}
            className="mt-2 flex items-center justify-center gap-1.5 text-center text-sm text-white/55 transition-opacity duration-300"
            style={{ opacity: showSocialProof ? 1 : 0 }}>
            <span>Limited early access · 1,200+ already on the list</span>
          </p>
        </div>
      </main>

      {/* Footer -lifted from flex column to fixed bottom so it stays
          anchored throughout the scroll. */}
      <footer
        className="intro-fade-up fixed inset-x-0 bottom-0 z-20 flex items-center justify-between px-2 sm:px-5"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.4rem)',
          paddingLeft: 'max(0.5rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(0.5rem, env(safe-area-inset-right, 0px))',
        }}>
        <span className="nav-link inline-flex min-h-11 items-center px-3">
          Coming Soon.
        </span>
        <span className="nav-link inline-flex min-h-11 items-center px-3">
          Launching in Rome, Fall 2026
        </span>
      </footer>
    </div>
  )
}

/**
 * Cycles through `words` using TextEffect's blur preset. Each word's
 * letters blur+fade in with a per-character stagger; the outgoing word
 * cross-fades out via the wrapper's CSS opacity transition so we don't
 * fight TextEffect's internal AnimatePresence (which choked on combined
 * trigger + children changes and stuck mid-animation on the second word).
 *
 * Pattern: every cycle remounts a fresh TextEffect via `key={index}`.
 * That guarantees clean state per word -no stale AnimatePresence
 * snapshots, no half-finished exit animations leaking into the next
 * mount. The visual softness (no hard cut between words) comes from the
 * brief window where show=false fades the previous word out before the
 * new key value mounts the next one in.
 *
 * Cadence (per word):
 *   HOLD_MS -time the word stays fully visible before fading out
 *   FADE_MS -wrapper opacity fade duration; matches the gap before
 *             the new word's letters begin their blur-in
 *
 * A hidden ghost of the longest word reserves horizontal width so the
 * centered "of [word]" line never reflows mid-cycle.
 */
function CyclingTextEffect({ words }: { words: string[] }) {
  // One-shot delay before the cycle begins. Holds the cycle quiet while
  // the page-level intro fade-in plays so the two animations don't fight
  // for attention. The width-reserving ghost stays mounted throughout so
  // the surrounding "of [word]" line still reserves correct space -only
  // the morphing word itself is gated on this timer.
  const START_DELAY_MS = 1500
  const HOLD_MS = 2000
  const FADE_MS = 100

  const [started, setStarted] = useState(false)
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a), '')

  // One-shot: flip `started` true after the intro fade window. Cleanup
  // handles unmount and React 19 strict-mode double-effect cleanly.
  useEffect(() => {
    const t = window.setTimeout(() => setStarted(true), START_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    // Don't schedule anything until the intro delay has elapsed.
    if (!started) return
    if (visible) {
      // Word is showing -wait HOLD_MS, then start the fade-out.
      const t = window.setTimeout(() => setVisible(false), HOLD_MS)
      return () => window.clearTimeout(t)
    }
    // Word is faded out -wait FADE_MS for the opacity transition to
    // finish, then advance to the next word and fade back in.
    const t = window.setTimeout(() => {
      setIndex((i) => (i + 1) % words.length)
      setVisible(true)
    }, FADE_MS)
    return () => window.clearTimeout(t)
  }, [started, visible, words.length])

  return (
    <span className="relative inline-block whitespace-pre align-baseline font-medium text-white">
      {/* Ghost -invisible, reserves width of the longest word so the
          centered "of [word]" line never reflows mid-transition. */}
      <span aria-hidden className="invisible">
        {longest}
      </span>
      {/* SR-friendly: the live region announces each word once on change.
          The animated chars inside TextEffect are aria-hidden, so AT
          doesn't read the per-letter blur sequence. Stays empty until
          `started` so screen readers don't announce the placeholder
          word during the intro delay. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {started ? words[index] : ''}
      </span>
      {/* whitespace-nowrap is load-bearing: TextEffect renders each char
          as its own inline-block; sub-pixel rounding across 11 boxes can
          push the total just past the absolute container's shrink-to-fit
          width (= ghost width), wrapping the trailing 'g' onto a second
          line. nowrap forces single-line layout -any micro-overflow stays
          invisible because the ghost already reserved comfortable width. */}
      <span
        className="absolute left-0 top-0 inline-block whitespace-nowrap transition-opacity ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transitionDuration: `${FADE_MS}ms`,
        }}
      >
        {/* Gated mount: TextEffect only mounts after START_DELAY_MS so
            the first word's blur-in doesn't race the page intro fade. */}
        {started && (
          <TextEffect key={index} per="char" preset="blur" as="span">
            {words[index]}
          </TextEffect>
        )}
      </span>
    </span>
  )
}

/**
 * Page-2 content. Renders inside an AnimatePresence overlay; appears
 * when `showPage2` flips true (scrollProgressRef crosses 0.4, pins are
 * fully exited). Each item -lead paragraph + 3 step cards -uses the
 * same blur+slide-up spring variant, container/grid stagger them so
 * the lead lands first then the steps cascade in.
 *
 * Content kept tight per spec: a one-line product summary + 3 numbered
 * steps. No comparison table, no trust-score teaser, no founders block.
 */
// Page 2 entry animation -adapted from the AnimatedGroup blur+slide-up
// pattern shared by the user. Container staggers items; each item springs
// in from below with blur fading out. Same variants drive the EXIT (run
// in reverse) when the user scrolls back up and pins re-enter.
const page2ContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.05,
    },
  },
}

const page2ItemVariants: Variants = {
  hidden: {
    opacity: 0,
    filter: 'blur(12px)',
    y: 16,
  },
  visible: {
    opacity: 1,
    filter: 'blur(0px)',
    y: 0,
    transition: {
      type: 'spring',
      bounce: 0.3,
      duration: 0.9,
    },
  },
}

function HowYoovaWorks() {
  return (
    <div className="mx-auto w-full max-w-[22rem] text-center sm:max-w-5xl">
      {/* Single lead - the overall message. Earlier versions had a 3-step
          card grid below; user requested less info on the second page so
          it's just the three lines below, all in one style. */}
      {/* Three lines, identical typography. Inclusive Sans tracked
          tight, super light weight - reads as editorial poster type
          rather than UI copy. text-balance keeps wraps clean on the
          long third line.
          Shimmer timing knobs (per ShimmerText below):
            delay       - first shimmer fires after this many seconds
            duration    - how long ONE shimmer pass takes
            repeatDelay - gap between consecutive passes (LOWER = MORE
                          FREQUENT). Currently 1.2s gap. Drop to 0.4-0.6
                          for nearly-continuous shimmer, raise to 4-5
                          for slow / occasional. */}
      <div className="space-y-3 sm:space-y-5 md:space-y-6">
        {PAGE_2_LINES.map((line, i) => (
          <motion.div
            key={i}
            variants={page2ItemVariants}
            // text-pretty lets the browser pick natural line breaks
            // (avoids orphans) WITHOUT forcing the balanced-line wrap
            // that text-balance does - which was creating awkward
            // 3-line wraps for the long sentences. leading-[1.35]
            // sets the line-height the inner ShimmerText inherits.
            className={`text-pretty text-4xl font-light leading-[1.35] tracking-tight sm:text-4xl md:text-5xl lg:text-6xl${
              line.italic ? ' italic' : ''
            }`}>
            <ShimmerText
              className="text-white"
              shimmerColor="#3ec3a7"
              delay={1 + i * 0.4}
              duration={1.4}
              repeatDelay={1}>
              {line.text}
            </ShimmerText>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// Each line is one continuous string so it wraps as a single text
// flow (no segment-split = no awkward 3-line wraps from inline-block
// chains). Italic on imperatives only.
const PAGE_2_LINES: Array<{ italic: boolean; text: string }> = [
  { italic: false, text: 'A social map of real events.' },
  { italic: true, text: 'Show up.' },
  { italic: true, text: 'Reveal yourself only after meeting.' },
]

/**
 * Inline vector Yoova mark -stripped of the heavy drop-shadow / inner-shadow
 * filter stack that the full /logo.svg carries. Mobile browsers (notably
 * iOS Safari and Chrome Android) rasterize <img src="svg"> assets with
 * complex SVG filters at a low internal DPI, which produced visibly blurry
 * edges on phone even though PC renders them fine. Inlining as real SVG
 * DOM and dropping the filters sidesteps both: pure vector strokes/fills
 * stay crisp at every scale, and there's no filter buffer to be rasterized
 * at low res. The filters contributed no visible polish at 28px anyway.
 */
function YoovaLogoMark() {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 380 379"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="block h-7 w-7 shrink-0"
      style={{ display: 'block' }}>
      <rect x="13" y="5" width="354" height="353" rx="71" fill="#28AA97" />
      <path
        d="M138.613 283.001L123.689 194C123.689 194 114.705 204.746 104.405 209.679C94.1043 214.612 79.9999 214.383 79.9999 214.383L138.613 283.001Z"
        fill="white"
      />
      <path
        d="M240.845 283.001L255.768 194C255.768 194 264.752 204.746 275.053 209.679C285.353 214.612 299.458 214.383 299.458 214.383L240.845 283.001Z"
        fill="white"
      />
      <circle cx="190" cy="96" r="50" fill="white" />
      <path
        d="M190.5 316L224 146C224 146 206.371 157.611 190.5 157.837C174.629 158.063 157 146 157 146L190.5 316Z"
        fill="white"
      />
      <circle cx="190.5" cy="96.5" r="13.5" fill="#28AA97" />
      <circle cx="297" cy="153" r="50" fill="white" />
      <circle cx="297.5" cy="153.5" r="13.5" fill="#28AA97" />
      <circle cx="80" cy="153" r="50" fill="white" />
      <circle cx="80.5" cy="152.5" r="13.5" fill="#28AA97" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
    </svg>
  )
}

function LinkedInIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.75 0H13.5v1.6h.06c.52-.92 1.8-1.9 3.69-1.9 3.95 0 4.68 2.6 4.68 5.98v5.32H18v-4.72c0-1.13-.02-2.58-1.58-2.58-1.58 0-1.82 1.23-1.82 2.5v4.8H9.75v-11Z" />
    </svg>
  )
}
