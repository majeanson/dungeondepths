import { type Rng, weightedPick } from './rng'

export enum EncounterType {
  Empty = 'empty',
  Normal = 'normal',
  Elite = 'elite',
  Rare = 'rare',
  Chest = 'chest',
  Shrine = 'shrine',
  Ancient = 'ancient',
  Boss = 'boss',
}

export interface EncounterWeights {
  empty: number
  normal: number
  elite: number
  rare: number
  chest: number
  shrine: number
  ancient: number
}

/** Base encounter weights. Tuned to match the plan's probability table. */
export const BASE_WEIGHTS: EncounterWeights = {
  empty: 600,
  normal: 250,
  elite: 100,
  rare: 30,
  chest: 10,
  shrine: 5,
  ancient: 5,
}

const TYPES = [
  EncounterType.Empty,
  EncounterType.Normal,
  EncounterType.Elite,
  EncounterType.Rare,
  EncounterType.Chest,
  EncounterType.Shrine,
  EncounterType.Ancient,
] as const

/** Returns true if this floor hosts a boss encounter (every 5 floors). */
export function isBossFloor(floor: number): boolean {
  return floor > 0 && floor % 5 === 0
}

/**
 * Floors that start with a guaranteed Full Rejuvenation shrine at the entrance.
 *
 * Chosen based on sim data:
 *   F3  — biggest death spike (23-31% of all deaths occur here; players arrive at 64% HP avg)
 *   F6  — mid-dungeon checkpoint (survivor morale / stamina reset before the hard half)
 *   F8  — late-game stamina check (8-9% of deaths, rewards players who made it this far)
 *   F13 — deep entry checkpoint (gear treadmill extends here; first late-game barrier)
 *   F18 — mid late-game reset (monster HP explodes around F17-19; stamina cliff)
 *   F23 — penultimate checkpoint (last safe breath before the endgame gauntlet)
 *   F28 — boss-approach buffer (pre-F30 final boss corridor — mirror of F8→F10 pattern)
 *
 * The shrine fully restores HP and mana before the floor's tile loop begins.
 * Effect in gameplay: a glowing shrine room visible on floor entry — cannot be skipped.
 */
export const FULL_REJUV_FLOORS: ReadonlySet<number> = new Set([3, 6, 8, 13, 18, 23, 28])

/** Returns true if this floor grants a guaranteed Full Rejuvenation shrine at its entrance. */
export function isFullRejuvFloor(floor: number): boolean {
  return FULL_REJUV_FLOORS.has(floor)
}

/**
 * Return weight overrides based on where this floor sits within its 5-floor cycle.
 * Creates a warmup → pressure → prep-for-boss pacing rhythm players learn to feel.
 *
 * Cycle (floor % 5):
 *   1,2 — early warmup  : lighter enemies, more chests/shrines
 *   3   — normal        : base weights
 *   4   — pre-boss      : guaranteed buffer — heavy chest/shrine boost
 *   0   — boss floor    : gridStore forces boss; rollEncounter is not called
 */
export function floorPacingWeights(floor: number): EncounterWeights {
  const pos = floor % 5  // 1=early, 2=early, 3=mid, 4=pre-boss, 0=boss
  if (pos === 1 || pos === 2) {
    // Warmup: fewer elites/rares, more breathing room
    return { ...BASE_WEIGHTS, empty: 700, normal: 220, elite: 55, rare: 15, chest: 8, shrine: 3, ancient: 2 }
  }
  if (pos === 4) {
    // Pre-boss buffer: strongly favour chest and shrine to let player prep
    return { ...BASE_WEIGHTS, empty: 300, normal: 150, elite: 60, rare: 20, chest: 80, shrine: 60, ancient: 5 }
  }
  return BASE_WEIGHTS  // pos === 3: normal mid-floor weights
}

/**
 * Roll an encounter type for a new tile step.
 * @param floor Higher floors shift weights toward harder encounters.
 */
export function rollEncounter(rng: Rng, floor = 1, weights = BASE_WEIGHTS): EncounterType {
  const floorBonus = Math.max(0, floor - 1)
  const adjusted = {
    empty:   Math.max(100, weights.empty  - floorBonus * 5),
    normal:  Math.max(50,  weights.normal - floorBonus * 2),
    elite:   weights.elite   + floorBonus * 3,
    rare:    weights.rare    + floorBonus * 2,
    chest:   weights.chest,
    shrine:  weights.shrine,
    ancient: weights.ancient + floorBonus,
  }
  const w = [
    adjusted.empty,
    adjusted.normal,
    adjusted.elite,
    adjusted.rare,
    adjusted.chest,
    adjusted.shrine,
    adjusted.ancient,
  ]
  return weightedPick(rng, TYPES as unknown as EncounterType[], w)
}

/** Run N rolls and return the frequency of each encounter type. */
export function sampleEncounterRates(rng: Rng, n: number, floor = 1): Record<EncounterType, number> {
  const counts: Record<string, number> = {}
  for (const t of TYPES) counts[t] = 0
  const weights = floorPacingWeights(floor)
  for (let i = 0; i < n; i++) counts[rollEncounter(rng, floor, weights)]++
  return counts as Record<EncounterType, number>
}

/** Get approximate % rates from base weights. */
export function getBaseRates(): Record<EncounterType, number> {
  const total = Object.values(BASE_WEIGHTS).reduce((a, b) => a + b, 0)
  return Object.fromEntries(
    TYPES.map(t => [t, BASE_WEIGHTS[t] / total])
  ) as Record<EncounterType, number>
}
