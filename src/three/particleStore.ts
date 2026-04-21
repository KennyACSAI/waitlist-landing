/**
 * A tiny module-level store for particle "mood". Writers are DOM-side
 * (keystrokes in the email input, form submit) and the reader is the
 * ParticleField's useFrame loop. We intentionally skip React subscriptions —
 * these values change often and drive uniforms, not render output, so plain
 * refs are ideal.
 */

export interface Vec3Like {
  x: number
  y: number
  z: number
}

export const particleMood = {
  // Target the typing-excite effect pulls particles toward (world-space
  // center of the email input).
  exciteTarget: { x: 0, y: -1.8, z: 0 } as Vec3Like,
  // Last keystroke timestamp (ms). Shader derives a decaying envelope from this.
  lastKeystrokeMs: -Infinity,
  // Timestamp of the pin-formation trigger. Ramps up then holds permanently.
  pinFormStartMs: -Infinity,
}

export const EXCITE_DECAY_MS = 1600
export const PIN_DELAY_MS = 200
export const PIN_FORM_MS = 4000

export function pushKeystroke(target?: Vec3Like) {
  particleMood.lastKeystrokeMs = performance.now()
  if (target) {
    particleMood.exciteTarget.x = target.x
    particleMood.exciteTarget.y = target.y
    particleMood.exciteTarget.z = target.z
  }
}

export function triggerPinForm() {
  particleMood.pinFormStartMs = performance.now()
}
