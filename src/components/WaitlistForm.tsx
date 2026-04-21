import { useRef, useState, FormEvent } from 'react'
import { pushKeystroke, triggerPinForm } from '../three/particleStore'

type Status = 'idle' | 'loading' | 'success' | 'error'

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface WaitlistFormProps {
  variant?: 'hero' | 'inline'
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

export default function WaitlistForm({ variant = 'hero' }: WaitlistFormProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

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
      // Replace with real API call
      await new Promise((res) => setTimeout(res, 900))
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
      className={[
        'liquid-glass-ios group relative mx-auto flex w-full max-w-md items-center gap-2 rounded-full p-1.5',
        isHero ? 'shadow-glow-sm' : '',
      ].join(' ')}>
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
        placeholder="you@example.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          if (status !== 'idle') setStatus('idle')
          const target = inputRef.current ? inputCenterToWorld(inputRef.current) : undefined
          pushKeystroke(target)
        }}
        disabled={status === 'loading' || status === 'success'}
        className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base text-white placeholder:text-zinc-500 outline-none disabled:opacity-60 sm:text-[15px]"
      />
      <button
        type="submit"
        disabled={status === 'loading' || status === 'success'}
        className="btn-liquid-glass min-w-[108px] rounded-full px-3 py-2.5 text-sm sm:min-w-[128px] sm:px-4 sm:text-base">
        {status === 'loading' && (
          <span className="flex items-center gap-2">
            <Spinner />
            <span>Joining…</span>
          </span>
        )}
        {status === 'success' && (
          <span className="flex items-center gap-1.5">
            <CheckIcon />
            <span>Joined</span>
          </span>
        )}
        {(status === 'idle' || status === 'error') && <span>Join waitlist</span>}
      </button>

      {/* Live region for status */}
      <p
        aria-live="polite"
        className={[
          'absolute left-0 right-0 top-full mt-2 text-center text-sm transition-opacity',
          message ? 'opacity-100' : 'opacity-0',
          status === 'error' && 'text-rose-400',
          status === 'success' && 'text-brand-300',
        ]
          .filter(Boolean)
          .join(' ')}>
        {message}
      </p>
    </form>
  )
}

function CheckIcon() {
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
      <path d="M5 12.5 L10 17.5 L19 7.5" />
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
