import { useEffect, useRef, useState, FormEvent } from 'react'
import { pushKeystroke, triggerPinForm } from '../three/particleStore'
import { supabase } from '../lib/supabase'

type Status = 'idle' | 'loading' | 'success' | 'error'

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface WaitlistFormProps {
  variant?: 'hero' | 'inline'
  /** Fires whenever the form's internal status changes. Lets the parent
   *  react to success/error — e.g. hide a social-proof line that would
   *  otherwise overlap the absolutely-positioned status message. */
  onStatusChange?: (status: Status) => void
}

/**
 * Maps a DOM element's on-screen center to a world-space point on the z=0
 * plane using the same camera setup as HeroScene (position=[0,0,7.5], fov=55).
 * Kept in sync with HeroScene.tsx — if the camera changes, update this.
 */
function inputCenterToWorld(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const ndcX = (cx / window.innerWidth) * 2 - 1
  const ndcY = -((cy / window.innerHeight) * 2 - 1)
  const halfH = Math.tan(((55 * Math.PI) / 180) / 2) * 7.5
  const halfW = halfH * (window.innerWidth / window.innerHeight)
  return { x: ndcX * halfW, y: ndcY * halfH, z: 0 }
}

export default function WaitlistForm({ variant = 'hero', onStatusChange }: WaitlistFormProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    onStatusChange?.(status)
  }, [status, onStatusChange])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (status === 'loading') return

    if (!emailRegex.test(email)) {
      setStatus('error')
      setMessage('Please enter a valid email address.')
      return
    }

    setStatus('loading')
    setMessage('')
    try {
      const normalized = email.trim().toLowerCase()
      const { error } = await supabase
        .from('waitlist')
        .insert({ email: normalized })

      // 23505 = Postgres unique_violation. Treat duplicates as success
      // so we don't reveal which emails are already on the list.
      if (error && error.code !== '23505') {
        throw error
      }

      setStatus('success')
      setMessage("You're on the list. We'll be in touch.")
      setEmail('')
      triggerPinForm()
    } catch {
      setStatus('error')
      setMessage('Something went wrong. Try again in a moment.')
    }
  }

  const isHero = variant === 'hero'

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Join the waitlist"
      className="group relative mx-auto w-full max-w-md">
      <div
        className={[
          'liquid-glass-apple relative w-full items-center rounded-full p-0.5',
          isHero ? 'shadow-glow-sm' : '',
          status === 'success' ? 'animate-glow-pulse motion-reduce:animate-none' : '',
        ].join(' ')}>
        <div aria-hidden className="liquid-glass-apple__effect" />
        <div aria-hidden className="liquid-glass-apple__tint" />
        <div aria-hidden className="liquid-glass-apple__shine" />
        <div className="liquid-glass-apple__content flex items-stretch">
          <label htmlFor={`email-${variant}`} className="sr-only">
            Email address
          </label>
          <input
            ref={inputRef}
            id={`email-${variant}`}
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="Your Email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (status !== 'idle') setStatus('idle')
              const target = inputRef.current ? inputCenterToWorld(inputRef.current) : undefined
              pushKeystroke(target)
            }}
            disabled={status === 'loading' || status === 'success'}
            className="min-w-0 flex-1 bg-transparent px-5 py-3.5 text-base text-white placeholder:text-white/65 outline-none disabled:opacity-60 sm:text-[15px]"
          />
          <button
            type="submit"
            disabled={status === 'loading' || status === 'success'}
            className="btn-liquid-glass min-w-[108px] rounded-full px-5 text-sm sm:min-w-[128px] sm:px-6 sm:text-base">
            {status === 'loading' && (
              <>
                <Spinner />
                <span>Joining…</span>
              </>
            )}
            {status === 'success' && (
              <>
                <CheckIcon animated />
                <span>Joined</span>
              </>
            )}
            {(status === 'idle' || status === 'error') && <span>Join waitlist</span>}
          </button>
        </div>
      </div>

      {/* Live region for status */}
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={[
          'absolute left-0 right-0 top-full mt-2 flex items-center justify-center gap-1.5 text-center text-sm',
          message ? 'opacity-100' : 'opacity-0 transition-opacity',
          status === 'success' && 'text-brand-300 animate-message-in motion-reduce:animate-none',
          status === 'error' && 'text-rose-400',
        ]
          .filter(Boolean)
          .join(' ')}>
        {status === 'error' && <ErrorIcon />}
        {status === 'success' && <CheckIcon />}
        <span>{message}</span>
      </p>
    </form>
  )
}

function CheckIcon({ animated = false }: { animated?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true">
      <path
        d="M5 12.5 L10 17.5 L19 7.5"
        strokeDasharray={animated ? '24' : undefined}
        className={animated ? 'animate-draw-check motion-reduce:animate-none' : undefined}
      />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7v6" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
