// Tiny class-name combiner used by shadcn-style components. Keeps the
// liquid-text component happy without pulling in clsx/tailwind-merge.
export function cn(...inputs: Array<string | number | null | undefined | false>) {
  return inputs.filter(Boolean).join(' ')
}
