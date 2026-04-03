/** Returns the atmospheric name for a given tier number. */
export function tierName(tier: number): string {
  if (tier === 1) return 'THE OUTER DARK'
  if (tier === 2) return 'THE SUNKEN HALLS'
  if (tier === 3) return 'THE ABYSSAL GATE'
  return `THE VOID — DEPTH ${tier}`
}
