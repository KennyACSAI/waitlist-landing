'use client'

import { motion } from 'framer-motion'
import type { ReactNode, CSSProperties } from 'react'

import { cn } from '../../lib/utils'

interface ShimmerTextProps {
  children: ReactNode
  className?: string
  /** Seconds the shimmer pass takes to traverse the text. */
  duration?: number
  /** Seconds before the FIRST shimmer fires (lets parent entrance
   *  animations play first). Use staggered values across multiple
   *  lines so the shimmer travels through them in sequence. */
  delay?: number
  /** Seconds between repeats once the shimmer has played once. */
  repeatDelay?: number
  /** Color of the shimmer highlight passing through the text. Must
   *  contrast with the parent text color (passed via Tailwind text-*
   *  on the className) - otherwise the shimmer is invisible. Default
   *  is the Yoova brand teal which reads well on white text. */
  shimmerColor?: string
}

/**
 * Renders text with a continuous left-to-right "shimmer" highlight.
 * Color comes from the parent's `currentColor` (set via Tailwind
 * `text-white` / `text-zinc-300` etc.) - so the shimmer respects
 * whatever color you give the wrapping element. Override the highlight
 * color via the `--shimmer-contrast` CSS variable.
 */
export function ShimmerText({
  children,
  className,
  duration = 1.5,
  delay = 1.5,
  repeatDelay = 1.5,
  shimmerColor = '#3ec3a7',
}: ShimmerTextProps) {
  return (
    // Renders as inline-block so multiple ShimmerText instances can sit
    // side by side on the same line (e.g. mixed-color segments). The
    // background-clip:text + transparent text-fill paints the shimmer
    // gradient onto the text glyphs themselves; pair this with a parent
    // that gives enough leading (≥1.1) so descenders aren't cropped by
    // the line-height-sized background area.
    <motion.span
      // - whitespace-pre-wrap: when multiple ShimmerText sit side-by-
      //     side, leading spaces inside each (" up.") would get
      //     collapsed by white-space:normal at the start of inline-
      //     block. pre-wrap preserves them, wrapping still allowed.
      // - pb-[0.3em]: the gradient background is bounded by THIS span's
      //     box (background-clip:text only paints inside the element
      //     bounds). Without bottom padding, descenders (g, y, p) at
      //     the very edge of the line-box don't get filled by the
      //     gradient on WebKit/Chromium and appear as invisible holes
      //     (because text-fill-color is transparent). The 0.3em
      //     padding extends the painted area below the descender line
      //     at every font size. PUTTING THE PADDING ON A WRAPPER
      //     PARENT DOES NOTHING - it has to be on this span.
      className={cn(
        'inline-block whitespace-pre-wrap pb-[0.3em]',
        className,
      )}
      style={
        {
          '--shimmer-contrast': shimmerColor,
          WebkitTextFillColor: 'transparent',
          background:
            'currentColor linear-gradient(to right, currentColor 0%, var(--shimmer-contrast) 40%, var(--shimmer-contrast) 60%, currentColor 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '50% 200%',
        } as CSSProperties
      }
      initial={{ backgroundPositionX: '250%' }}
      animate={{ backgroundPositionX: ['-100%', '250%'] }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        repeatDelay,
        ease: 'linear',
      }}>
      {children}
    </motion.span>
  )
}

export default ShimmerText
