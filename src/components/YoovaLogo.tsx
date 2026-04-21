interface YoovaLogoProps {
  size?: number
  className?: string
  withWordmark?: boolean
}

/**
 * Yoova brand mark — a teal rounded-square badge containing three map-pin
 * markers arranged in a "Y" constellation. Simplified from the source SVG
 * (filters/drop-shadows stripped) so it renders crisply at small sizes.
 */
export default function YoovaLogo({ size = 32, className, withWordmark = true }: YoovaLogoProps) {
  return (
    <span className={['inline-flex items-center gap-2.5 leading-none', className].filter(Boolean).join(' ')}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 380 379"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true">
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
      {withWordmark && (
        <span className="text-[18px] font-semibold tracking-tight text-white">Yoova</span>
      )}
    </span>
  )
}
