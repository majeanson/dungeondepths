/**
 * Seeded PRNG — mulberry32
 * All game randomness flows through this. Every run is reproducible by seed.
 */

export type Rng = () => number

/** Create a seeded RNG. Returns values in [0, 1). */
export function makeRng(seed: number): Rng {
  let s = seed >>> 0
  return function () {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000
  }
}

/** Integer in [min, max] inclusive. */
export function roll(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

/** Pick a random element from an array. */
export function pick<T>(rng: Rng, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

/** Shuffle array in place (Fisher-Yates). Returns the array. */
export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Weighted random pick. weights must match arr length, values are relative. */
export function weightedPick<T>(rng: Rng, arr: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rng() * total
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i]
    if (r <= 0) return arr[i]
  }
  return arr[arr.length - 1]
}

/** Returns true with probability p (0–1). */
export function chance(rng: Rng, p: number): boolean {
  return rng() < p
}

/**
 * Pick N unique items from array without replacement.
 * If n > arr.length, returns all elements (shuffled) — never throws.
 */
export function pickN<T>(rng: Rng, arr: T[], n: number): T[] {
  const copy = [...arr]
  shuffle(rng, copy)
  return copy.slice(0, Math.min(n, copy.length))
}
