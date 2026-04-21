import YoovaLogo from './components/YoovaLogo'
import WaitlistForm from './components/WaitlistForm'
import HeroScene from './three/HeroScene'

export default function App() {
  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col bg-radial-vignette font-sans">
      {/* Decorative 3D backdrop — fixed so keyboard/scroll never moves it */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <HeroScene />
      </div>
      <div className="noise pointer-events-none fixed inset-0 z-[1]" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[2] h-32 bg-gradient-to-b from-ink-950/80 to-transparent sm:h-40"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[2] h-40 bg-gradient-to-t from-ink-950/90 to-transparent sm:h-56"
      />

      {/* Header */}
      <header
        className="relative z-20 flex items-center justify-between px-5 sm:px-10"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.1rem)',
          paddingLeft: 'max(1.25rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1.25rem, env(safe-area-inset-right, 0px))',
        }}>
        <YoovaLogo size={28} />
        <span className="liquid-glass hidden items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-zinc-200 sm:inline-flex">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-brand/60" />
            <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-brand" />
          </span>
          Launching in Rome · 2025
        </span>
      </header>

      {/* Main */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-5 py-10 sm:py-16">
        <div className="flex w-full max-w-3xl flex-col items-center text-center">
          <h1 className="text-balance text-[28px] font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl md:text-[56px]">
            Moments, not swipes.
          </h1>

          <p className="mt-4 max-w-xl text-[14px] font-light leading-relaxed text-zinc-400 sm:mt-5 sm:text-base">
            Connection starts where you are.
          </p>

          <div className="mt-6 w-full sm:mt-7">
            <WaitlistForm variant="hero" />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        className="relative z-20 flex flex-col items-center gap-2 text-[11px] text-zinc-500 sm:flex-row sm:justify-between sm:gap-0 sm:text-xs"
        style={{
          paddingTop: '0.75rem',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
          paddingLeft: 'max(1.25rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1.25rem, env(safe-area-inset-right, 0px))',
        }}>
        <span className="order-3 sm:order-1">© {new Date().getFullYear()} Yoova</span>
        <a
          href="#"
          className="order-1 rounded-full px-3 py-1 text-zinc-400 transition-colors hover:text-white sm:order-2">
          Terms & Privacy
        </a>
        <div className="order-2 flex items-center gap-3 sm:order-3">
          <SocialIconLink label="Instagram">
            <InstagramIcon />
          </SocialIconLink>
          <SocialIconLink label="LinkedIn">
            <LinkedInIcon />
          </SocialIconLink>
        </div>
      </footer>
    </div>
  )
}

function SocialIconLink({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <a
      href="#"
      aria-label={label}
      className="liquid-glass inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 transition-colors hover:text-white">
      {children}
    </a>
  )
}

function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
