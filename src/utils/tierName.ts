import { COLORS } from '../theme'

/** Returns the atmospheric name for a given tier number. */
export function tierName(tier: number): string {
  if (tier === 1) return 'THE OUTER DARK'
  if (tier === 2) return 'THE SUNKEN HALLS'
  if (tier === 3) return 'THE ABYSSAL GATE'
  return `THE VOID — DEPTH ${tier}`
}

/**
 * Returns the explicit difficulty label for a tier (D2-style naming), or null for Normal.
 * Normal (tier 1): no label shown — the atmospheric name is enough.
 * Nightmare (tier 2): NIGHTMARE in blue.
 * Hell (tier 3+): HELL in red.
 */
export function difficultyLabel(tier: number): string | null {
  if (tier === 1) return null
  if (tier === 2) return 'NIGHTMARE'
  return 'HELL'
}

/** Returns the accent color for a difficulty tier (matches difficultyLabel). Null = Normal (no accent). */
export function difficultyColor(tier: number): string | null {
  if (tier === 1) return null
  if (tier === 2) return COLORS.blue     // arcane deep — #3a5aaa
  return COLORS.red                      // fresh blood — #c02a2a
}
