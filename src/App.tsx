import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import WaitlistForm from './components/WaitlistForm'
import type { PinMeasurement } from './three/YoovaPin'

// Code-split the R3F scene: the 10MB glb + three.js chunk only downloads
// after first paint, so text/header/form appear instantly on cold loads.
const HeroScene = lazy(() => import('./three/HeroScene'))

// Must match HeroScene's <Canvas camera={...}>.
const CAM_Z = 7.5
const FOV_DEG = 55
const VISIBLE_WORLD_H = 2 * CAM_Z * Math.tan((FOV_DEG * Math.PI) / 360)

// ============================================================================
// PC GAP SINGLE-KNOB — changes ALL FOUR gaps in lockstep on desktop (≥640px).
//   header → [A] → headline → [B] → pins → [C] → form → [D] → footer
// Edit this one number and every PC gap resizes by the same amount, so the
// four distances stay mathematically equal without hand-syncing four
// spacer divs. Mobile uses its own per-spacer weights (unchanged).
//   Bigger value (e.g. 20) → bigger equal gaps → cluster pushed further down
//   Smaller value (e.g. 5) → smaller equal gaps → cluster pulled up
// ============================================================================
const PC_SPACER_FLEX = 10

// ============================================================================
// MAP BACKDROP TUNING — Rome map layer (z-0). Two sets of knobs: one for
// desktop, one for mobile (≤640px). Edit either object and hot reload picks
// it up instantly. All four controls work together; start with `size`, then
// `position`, then `opacity`, then optionally `filter`.
//
//   size     — 'cover' | 'contain' | '100%' | '150%' | '200%' | '200% auto'
//              Higher % = zoomed IN more, less of the map shows per viewport.
//              'cover'   fills viewport, may crop edges
//              'contain' shows whole image, may leave bands
//              '200%'    = 2x zoom relative to viewport width
//              '200% auto' = width 2x, height scales proportionally
//
//   position — 'center' | '50% 50%' | '30% 70%' | 'center 40%' | 'left top'
//              First value = horizontal, second = vertical.
//              0% = left/top edge, 100% = right/bottom edge.
//              Change this to shift which part of Rome sits behind the pin.
//
//   opacity  — 0 invisible → 1 fully visible. Current values keep it subtle.
//
//   filter   — '' (empty = no filter) OR a CSS filter string such as
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
 *   z-1  R3F Canvas — big teal pin in front, canvas transparent so the
 *        serif reads around the pin silhouette
 *   z-2  Subtle noise grain
 *   z-3  Top + bottom vignette gradients for edge falloff
 *   z-10 Main content column — body copy + form
 *   z-20 Header nav + footer
 */
export default function App() {
  const pinPlaceholderRef = useRef<HTMLDivElement>(null)
  const [pinMeasurement, setPinMeasurement] = useState<PinMeasurement | null>(null)
  const [pinScreenH, setPinScreenH] = useState(() =>
    typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.35) : 300,
  )
  const [pinPositionY, setPinPositionY] = useState(-0.6)

  // Form status is lifted here so the social-proof line under the pill can
  // fade out when the absolute-positioned status message ("You're on the
  // list…") appears — otherwise they stack on the same Y and the success
  // message reads as overlapping the scarcity text.
  const [formStatus, setFormStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const showSocialProof = formStatus === 'idle' || formStatus === 'loading'

  // Reactive mobile check for MAP_TUNING — re-fires on rotate/resize so the
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
  // glide) — no intermediate stop. That eliminates the abrupt transition
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
    // motion is always visible — on narrow phones the resting headline
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
    // would commit to DOM in the SAME paint as the pending state —
    // meaning no "before" paint for the transition to interpolate
    // from. Chrome/Safari tolerate this (they fire transitions on
    // computed-style changes even without intervening paints). Yandex
    // and some Chromium forks don't — they need the pending state
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
        // No stop-start — scale carries continuous motion across the
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
  // (pin finishing load, window resize) — but only while the intro is in
  // its enter phase, where the wrapper's translate transition is disabled
  // so these updates land instantly without smear-animating. We clear the
  // WRAPPER's transform (the translate) to read the resting Y, then
  // restore it. The inner h1's scale is preserved — scale around
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
  // hold phase (when the wrapper's translate transition is disabled —
  // the re-measure effect above picks up the resulting flex layout
  // shift and snaps delta to the new resting spot instantly). Once
  // introDone flips, pinScreenH freezes: the glide is in motion and
  // any spacer redistribution would move the landing target mid-flight
  // → visible jump. Because the freeze happens BEFORE the glide
  // rather than 1.6s after it, the post-landing "stretching" layout
  // shift is gone — layout is final by the time the text arrives at
  // its resting position.
  useLayoutEffect(() => {
    if (!pinMeasurement) return
    if (introDone) return
    const ph = (pinMeasurement.worldHeight / VISIBLE_WORLD_H) * window.innerHeight
    setPinScreenH(ph)
  }, [pinMeasurement, introDone])

  // Resize handling runs independently of the intro gate — once
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
  useLayoutEffect(() => {
    if (!pinMeasurement) return
    let raf = 0
    const recompute = () => {
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
    ro.observe(document.body)
    if (pinPlaceholderRef.current) ro.observe(pinPlaceholderRef.current)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [pinMeasurement, pinScreenH])

  const introState = introReady ? (introDone ? 'done' : 'enter') : 'pending'
  // Split into two transforms so translate and scale can run on different
  // timelines. Wrapper carries translate: held at delta during pending/
  // enter, glides to 0 over 1600ms during done. H1 carries scale: fixed
  // at headlineStartScale during pending, transitions to 1 over the full
  // 2500ms intro duration as soon as introReady flips. There's no
  // intermediate scale value — the scale motion is one single continuous
  // ease from "oversized" to "final", which crosses the hold→glide
  // boundary without stopping, keeping the overall motion smooth.
  const headlineWrapTransform = introGlideStarted
    ? 'translateY(0)'
    : `translateY(${headlineDelta}px)`
  const currentHeadlineScale = introReady ? 1 : headlineStartScale

  return (
    <div
      data-intro={introState}
      className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-ink-950 font-sans"
      style={{ '--pc-spacer-flex': String(PC_SPACER_FLEX) } as CSSProperties}>
      {/* Layer 0 — faint Rome street map backdrop.
          All tunable values live in MAP_TUNING at the top of this file.
          Edit MAP_TUNING.desktop for ≥640px viewports, MAP_TUNING.mobile
          for phones. Values below are just plumbing. */}
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

      {/* Layer 1 — 3D pin + starfield */}
      <div className="intro-fade pointer-events-none fixed inset-0 z-[1]">
        <Suspense fallback={null}>
          <HeroScene pinPositionY={pinPositionY} onPinMeasured={handlePinMeasured} />
        </Suspense>
      </div>

      {/* Layer 2 — noise */}
      <div className="intro-fade noise pointer-events-none fixed inset-0 z-[2]" />

      {/* Layer 3 — edge vignettes */}
      <div
        aria-hidden
        className="intro-fade pointer-events-none fixed inset-x-0 top-0 z-[3] h-24 bg-gradient-to-b from-ink-950/70 to-transparent sm:h-32"
      />
      <div
        aria-hidden
        className="intro-fade pointer-events-none fixed inset-x-0 bottom-0 z-[3] h-40 bg-gradient-to-t from-ink-950/85 to-transparent sm:h-56"
      />

      {/* Header — edge-to-edge liquid-glass bar. Visibility-gated (NOT
          opacity-faded) for the same reason as the form in <main>: any
          ancestor with opacity < 1 kills the backdrop-filter in iOS Safari
          and some Chromium forks, so the glass would disappear for the
          whole 1400ms fade and snap back. Visibility toggle sidesteps that
          — the bar either isn't rendered or is fully composited with a
          correct backdrop-filter. Snaps in on introGlideStarted, same
          beat as the form. */}
      <header
        className="intro-reveal-header relative z-20"
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
              aria-label="Yoova — home"
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-1 sm:gap-2.5 sm:px-2">
              <YoovaLogoMark />
              <span
                className="text-sm font-semibold tracking-tight text-white sm:text-base"
                style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
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

      {/*
       * Four flex-grow spacers distribute free vertical space between:
       *   header → [A] → headline → [B] → pin slot → [C] → form → [D] → footer
       * The pin slot is an invisible placeholder whose height matches the
       * pin's projected on-screen footprint; a layout effect pushes the 3D
       * pin to the placeholder's center so the visible pin sits inside it.
       *
       * VERTICAL LAYOUT TUNING — change the flex-[N] values on each spacer
       * below to shift the headline, pins, and form up or down:
       *   Bigger spacer B (headline → pin) = pins and form sit LOWER
       *   Smaller spacer D (form → footer) = frees the space that B claimed
       *   Bigger spacer C (pin → form) = form sits lower without moving pins
       *   Bigger spacer A (header → headline) = whole stack shifts down
       * Currently weighted 1 : 1.8 : 1 : 0.5 so the pins + form hang lower
       * than the visual midpoint. Flip back to all `flex-1` for the old
       * evenly-spaced layout.
       */}
      {/* Spacer A — header → headline.
          Mobile: flex-1. Desktop: pulled from PC_SPACER_FLEX at the top of
          this file via the `pc-spacer-equal` class + CSS variable, so all
          four spacers share one knob. */}
      <div aria-hidden className="pc-spacer-equal relative z-10 min-h-0 flex-1" />

      <section className="relative z-10 flex flex-col items-center px-5 text-center">
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
          <CyclingWord words={['Socializing', 'Discovering', 'Connecting']} />
        </p>
      </section>

      {/* Spacer B — headline → pin slot.
          Shares PC_SPACER_FLEX via `pc-spacer-equal`. */}
      <div aria-hidden className="pc-spacer-equal relative z-10 min-h-0 flex-1" />

      <div
        ref={pinPlaceholderRef}
        aria-hidden
        className="pin-placeholder relative z-10 w-full shrink-0"
        style={{ height: `${pinScreenH}px` }}
      />

      {/* Spacer C — pin slot → form.
          Shares PC_SPACER_FLEX via `pc-spacer-equal`. */}
      <div aria-hidden className="pc-spacer-equal relative z-10 min-h-0 flex-1" />

      {/* NO intro-fade on main. The form's .liquid-glass-apple uses
          backdrop-filter (blur + SVG distortion) and ANY ancestor with
          opacity < 1 causes iOS Safari and some Chromium forks to
          either skip the filter entirely or render it at drastically
          reduced precision — the visible symptom is the glass effect
          disappearing for the full 1400ms fade and snapping back at
          the end. Gate the form via visibility instead: it's either
          fully excluded from rendering (hidden) or fully composited
          with correct backdrop-filter (visible). No intermediate
          ancestor-opacity state, no bug. Snaps in as the headline
          starts gliding up, which reads as a natural reveal. */}
      <main
        className="intro-reveal-form relative z-10 flex w-full flex-col items-center px-5"
        style={{ visibility: introGlideStarted ? 'visible' : 'hidden' }}>
        <div className="flex w-full max-w-xl flex-col items-center text-center">
          <WaitlistForm variant="hero" onStatusChange={setFormStatus} />
          {/* Social proof + scarcity line. Edit the two halves independently:
              left half = scarcity, right half = count. Middle dot ('·') is
              the editorial separator used elsewhere on the page.
              Hidden (and its vertical space preserved via opacity-only fade)
              whenever the form's absolute status message is visible — stops
              the success/error row from reading as overlapping text. */}
          {/* Matches the WaitlistForm status message exactly — same top
              offset (mt-2), same text-sm, same flex-center layout — so the
              two swap in place pixel-for-pixel. Only color differs (muted
              white here vs. brand-teal for success, rose for error). */}
          <p
            aria-hidden={!showSocialProof}
            className="mt-2 flex items-center justify-center gap-1.5 text-center text-sm text-white/55 transition-opacity duration-300"
            style={{ opacity: showSocialProof ? 1 : 0 }}>
            <span>Limited early access · 1,200+ already on the list</span>
          </p>
        </div>
      </main>

      {/* Spacer D — form → footer.
          Mobile: flex-[0.5] (tight so the form doesn't float far from the
                              footer on phones).
          Desktop: shares PC_SPACER_FLEX via `pc-spacer-equal`. */}
      <div aria-hidden className="pc-spacer-equal relative z-10 min-h-0 flex-[0.5]" />

      {/* Footer — minimal, editorial */}
      <footer
        className="intro-fade-up relative z-20 flex items-center justify-between px-2 sm:px-5"
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
 * Cycles through `words` with per-character stagger. Letters rise + fade
 * in left-to-right on entry, then fall + fade out right-to-left on exit.
 * A 3-phase state machine (in → hold → out → next) guarantees the exit
 * fully plays before the next word starts entering — a React key swap
 * alone would cut the exit short.
 *
 * Hidden ghost of the longest word reserves horizontal width so the
 * centered line doesn't reflow. Reduced-motion users get a simple
 * opacity fade on the whole word.
 */
function CyclingWord({ words }: { words: string[] }) {
  // 21st.dev vertical spring slide: active word sits at y:0, older words
  // get pushed up (-150), newer ones wait below (+150). Swap every 2s.
  const HOLD_MS = 2000

  const [index, setIndex] = useState(0)
  const memoWords = useMemo(() => words, [words])

  useEffect(() => {
    const t = window.setTimeout(() => {
      setIndex((n) => (n === memoWords.length - 1 ? 0 : n + 1))
    }, HOLD_MS)
    return () => clearTimeout(t)
  }, [index, memoWords])

  const longest = memoWords.reduce((a, b) => (b.length > a.length ? b : a), '')

  return (
    <span className="relative inline-block text-left align-baseline">
      {/* Invisible ghost reserves width of the longest word so the
          containing line doesn't reflow as words swap. */}
      <span aria-hidden className="invisible whitespace-pre">
        {longest}
      </span>
      {/* SR announces the full word once per swap; animated words are
          aria-hidden so assistive tech doesn't read the slide sequence. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {memoWords[index]}
      </span>
      {memoWords.map((word, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute left-0 top-0 whitespace-pre font-medium text-white"
          initial={{ opacity: 0, y: '-100' }}
          transition={{ type: 'spring', stiffness: 50 }}
          animate={
            index === i
              ? { y: 0, opacity: 1 }
              : { y: index > i ? -150 : 150, opacity: 0 }
          }>
          {word}
        </motion.span>
      ))}
    </span>
  )
}

/**
 * Inline vector Yoova mark — stripped of the heavy drop-shadow / inner-shadow
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
      width="16"
      height="16"
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.75 0H13.5v1.6h.06c.52-.92 1.8-1.9 3.69-1.9 3.95 0 4.68 2.6 4.68 5.98v5.32H18v-4.72c0-1.13-.02-2.58-1.58-2.58-1.58 0-1.82 1.23-1.82 2.5v4.8H9.75v-11Z" />
    </svg>
  )
}
