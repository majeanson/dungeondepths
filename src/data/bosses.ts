/**
 * Named boss definitions — one boss per 5-floor milestone.
 * Bosses are MonsterInstances with elevated stats and special mechanics.
 */

import { type Rng } from '../engine/rng'
import type { MonsterInstance, BossMechanic } from '../engine/monsters'

interface BossDef {
  id:            string
  name:          string
  /** Floor milestone this boss first appears (5, 10, 15…). Repeats in cycles. */
  floorKey:      number
  hpMultiplier:  number
  dmgMultiplier: number
  xpMultiplier:  number
  mechanics:     BossMechanic[]
  description:   string
  /** Base HP before multipliers */
  baseHp:        number
  /** Base damage range before multipliers */
  baseDamage:    [number, number]
  baseXp:        number
  /** Fraction of maxHp regenerated each round (only used with 'regen' mechanic). Default 0.03. */
  regenRate?:    number
}

const BOSSES: BossDef[] = [
  {
    id: 'the_warden', name: 'The Warden',
    floorKey: 5,
    baseHp: 300, baseDamage: [22, 40], baseXp: 120,
    hpMultiplier: 1.0, dmgMultiplier: 1.0, xpMultiplier: 3.0,
    mechanics: ['enrage', 'double_strike', 'no_flee'],
    description: 'Guardian of the first gate. Grows furious — then strikes twice.',
  },
  {
    id: 'bonekeeper', name: 'Bonekeeper',
    floorKey: 10,
    baseHp: 500, baseDamage: [32, 55], baseXp: 200,
    hpMultiplier: 1.2, dmgMultiplier: 1.1, xpMultiplier: 3.0,
    mechanics: ['enrage', 'regen', 'no_flee'],
    regenRate: 0.015,   // 1.5% — was 3%, was unwinnable for undergeared players
    description: 'An undying necromancer who mends his wounds mid-battle.',
  },
  {
    id: 'inferno_witch', name: 'Inferno Witch',
    floorKey: 15,
    baseHp: 700, baseDamage: [40, 70], baseXp: 300,
    hpMultiplier: 1.3, dmgMultiplier: 1.2, xpMultiplier: 3.0,
    mechanics: ['enrage', 'immune_round', 'ignition', 'no_flee'],
    description: 'A sorceress consumed by her own flames. Untouchable — yet her fire still burns you.',
  },
  {
    id: 'shadow_stalker', name: 'Shadow Stalker',
    floorKey: 20,
    baseHp: 900, baseDamage: [50, 85], baseXp: 420,
    hpMultiplier: 1.4, dmgMultiplier: 1.25, xpMultiplier: 3.0,
    mechanics: ['enrage', 'regen', 'immune_round', 'double_strike', 'no_flee'],
    regenRate: 0.015,   // 1.5% — same fix as Bonekeeper
    description: 'An assassin of the abyss — regenerating, elusive, and relentless.',
  },
  {
    id: 'iron_colossus', name: 'Iron Colossus',
    floorKey: 25,
    baseHp: 1200, baseDamage: [60, 100], baseXp: 560,
    hpMultiplier: 1.6, dmgMultiplier: 1.3, xpMultiplier: 3.0,
    mechanics: ['enrage', 'double_strike', 'no_flee'],
    description: 'A titan of living metal. When enraged, it hammers twice without pause.',
  },
  {
    id: 'abyssal_one', name: 'The Abyssal One',
    floorKey: 30,
    baseHp: 1500, baseDamage: [75, 120], baseXp: 750,
    hpMultiplier: 1.8, dmgMultiplier: 1.4, xpMultiplier: 3.0,
    mechanics: ['enrage', 'regen', 'immune_round', 'ignition', 'double_strike', 'no_flee'],
    description: 'A rift made flesh. All mechanics converge. The fire still burns when you cannot touch it.',
  },
]

/** Returns the boss def for a given absolute floor (tier × 10 + floor). */
function getBossForFloor(absoluteFloor: number): BossDef {
  // Cycle through bosses: floors 5,10,15,20,25,30+ use index 0-5, then repeat from index 5
  const milestoneIndex = Math.floor(absoluteFloor / 5) - 1  // 0-based
  const idx = Math.min(milestoneIndex, BOSSES.length - 1)
  return BOSSES[idx]
}

/** Spawn a boss MonsterInstance for the given floor + tier. */
export function spawnBoss(absoluteFloor: number, _rng: Rng): MonsterInstance {
  const def       = getBossForFloor(absoluteFloor)
  const floorScale = 1 + (absoluteFloor - 1) * 0.12

  const maxHp = Math.round(def.baseHp * def.hpMultiplier * floorScale)
  const damage: [number, number] = [
    Math.round(def.baseDamage[0] * def.dmgMultiplier * floorScale),
    Math.round(def.baseDamage[1] * def.dmgMultiplier * floorScale),
  ]
  const xp = Math.round(def.baseXp * def.xpMultiplier * floorScale)

  return {
    defId:        def.id,
    name:         def.name,
    displayName:  def.name,
    maxHp,
    currentHp:    maxHp,
    damage,
    speed:        1.0,
    affixes:      [],
    xp,
    tier:         'boss',
    bossMechanics: def.mechanics,
    regenRate:    def.regenRate,  // undefined = use combat.ts default (0.03)
    blockChance:  0,              // bosses use mechanics, not block chance
  }
}
