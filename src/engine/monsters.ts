/**
 * Monster instance creation and affix rolling.
 * Scales base stats by floor depth + encounter type.
 */

import { type Rng, pick, pickN, roll } from './rng'
import { MONSTERS, MONSTER_AFFIXES, getMonstersForFloor, getNamedVariantsForFloor, type MonsterAffix, type MonsterDef } from '../data/monsters'
import { useGameStore } from '../store/gameStore'

export type EncounterTier = 'normal' | 'elite' | 'rare' | 'ancient' | 'boss'
export type BossMechanic = 'enrage' | 'regen' | 'immune_round' | 'no_flee' | 'double_strike' | 'ignition'

export interface MonsterInstance {
  defId: string
  name: string
  displayName: string
  maxHp: number
  currentHp: number
  damage: [number, number]
  speed: number
  affixes: MonsterAffix[]
  xp: number
  tier: EncounterTier
  bossMechanics?: BossMechanic[]
  /** Fraction of maxHp regenerated per round (boss regen mechanic). Default 0.03 if absent. */
  regenRate?: number
  /** 0–100% chance to block player attacks (elites/ancients/bosses only). */
  blockChance: number
}

const TIER_HP: Record<EncounterTier, number> = {
  normal: 1,
  elite: 1.5,
  rare: 3,
  ancient: 5,
  boss: 5,
}

/** Block chance (0–100) granted to monsters per tier. Normal monsters never block. */
const TIER_BLOCK: Record<EncounterTier, number> = {
  normal:  0,
  elite:   12,
  rare:    20,
  ancient: 28,
  boss:    0,   // bosses have mechanics instead of block chance
}

const TIER_DMG: Record<EncounterTier, number> = {
  normal: 1,
  elite: 1.25,
  rare: 1.5,
  ancient: 2,
  boss: 2.5,
}

const TIER_XP: Record<EncounterTier, number> = {
  normal: 1,
  elite: 2,
  rare: 4,
  ancient: 8,
  boss: 15,
}

/** Max affixes per tier */
const TIER_AFFIXES: Record<EncounterTier, [number, number]> = {
  normal: [0, 0],
  elite: [1, 2],
  rare: [2, 3],
  ancient: [3, 3],
  boss: [0, 0],
}

function buildDisplayName(base: MonsterDef, affixes: MonsterAffix[]): string {
  if (affixes.length === 0) return base.name
  return `${base.name} (${affixes.map(a => MONSTER_AFFIXES[a].name).join(', ')})`
}

/** Apply affix modifiers to a monster instance. */
function applyAffixModifiers(instance: MonsterInstance, affixes: MonsterAffix[]): MonsterInstance {
  let m = { ...instance }
  for (const affix of affixes) {
    if (affix === 'extraStrong') {
      m.damage = [Math.round(m.damage[0] * 1.5), Math.round(m.damage[1] * 1.5)]
    }
    if (affix === 'extraFast') {
      m.speed = m.speed * 1.5
    }
    // Elemental affixes add bonus elemental damage in combat — no physical boost needed
  }
  return m
}

export function spawnMonster(rng: Rng, floor: number, tier: EncounterTier, diffTier = 1): MonsterInstance {
  // Piecewise scaling: +10%/floor for F1-10, then +3%/floor after F10.
  // F10 = 1.90×, F20 = 2.20×, F30 = 2.50× (vs 3.90× if we kept +10% all the way).
  // Gentler post-F10 ramp lets passives + new gear stay relevant through F25.
  const floorScale = floor <= 10
    ? 1 + (floor - 1) * 0.10
    : 1.90 + (floor - 10) * 0.03
  const hpScale    = TIER_HP[tier]  * floorScale
  const dmgScale   = TIER_DMG[tier] * floorScale

  // ── Named variant: 20% chance for elite+ tiers ───────────────────────────
  const eligibleVariants = tier !== 'normal' ? getNamedVariantsForFloor(floor, diffTier) : []
  let def: MonsterDef
  let affixes: MonsterAffix[]
  let displayName: string
  let extraHpMult = 1

  if (eligibleVariants.length > 0 && rng() < 0.20) {
    const variant  = pick(rng, eligibleVariants)
    const baseDef  = MONSTERS.find(m => m.id === variant.baseId)!
    def            = baseDef
    affixes        = variant.forcedAffixes
    displayName    = variant.name
    extraHpMult    = variant.hpBonus
  } else {
    const pool       = getMonstersForFloor(floor, diffTier)
    def              = pick(rng, pool)
    const [affixMin, affixMax] = TIER_AFFIXES[tier]
    const affixCount = roll(rng, affixMin, affixMax)
    const allAffixes = Object.keys(MONSTER_AFFIXES) as MonsterAffix[]
    affixes          = affixCount > 0 ? pickN(rng, allAffixes, affixCount) : []
    displayName      = buildDisplayName(def, affixes)
  }

  const maxHp = Math.round(def.baseHp * hpScale * extraHpMult)
  const damage: [number, number] = [
    Math.round(def.baseDamage[0] * dmgScale),
    Math.round(def.baseDamage[1] * dmgScale),
  ]

  let instance: MonsterInstance = {
    defId: def.id,
    name: def.name,
    displayName,
    maxHp,
    currentHp: maxHp,
    damage,
    speed: def.speed,
    affixes,
    xp: Math.round(def.baseXp * TIER_XP[tier] * floorScale),
    tier,
    blockChance: TIER_BLOCK[tier],
  }

  instance = applyAffixModifiers(instance, affixes)

  // Pact of Suffering: all monsters gain Cursed affix
  if (useGameStore.getState().activePact === 'suffering' && !instance.affixes.includes('cursed')) {
    instance.affixes = [...instance.affixes, 'cursed']
    if (!instance.displayName.includes('Cursed')) {
      instance.displayName = `${instance.displayName} (Cursed)`
    }
  }

  return instance
}


/** Scale a monster's HP and damage by difficulty tier (2nd run+). Tier 1 = no scaling.
 *  Capped at tier 11 equivalent to prevent one-shot territory at very high tiers. */
export function applyTierScaling(monster: MonsterInstance, diffTier: number): MonsterInstance {
  if (diffTier <= 1) return monster
  // Decoupled NM / Hell tuning — diffTransitionSim target zones:
  //   NM A1  : 10-35% survival with Normal-cleared gear (~820 score)
  //   Hell A1: 5-25% survival with NM-cleared gear
  // Each tier tuned independently so low-HP classes (rogue, sorc) aren't spiked
  // while warrior still feels the pressure.
  let hpMult:  number
  let dmgMult: number
  if (diffTier === 2) {
    hpMult  = 2.5   // NM: tighter cold-start — warrior A1 was 40% (too easy), now ~27%
    dmgMult = 1.80  // NM: +80% damage — manageable with Normal gear + defense
  } else {
    hpMult  = 3.1   // Hell: slight relief from 3.4 — sorc/rogue A5 was 15/20%, target 20%+
    dmgMult = 2.0   // Hell: +100% damage — lower than HP scaling so spike deaths are reduced
  }
  const scaledHp = Math.round(monster.maxHp * hpMult)
  return {
    ...monster,
    maxHp:     scaledHp,
    currentHp: scaledHp,
    damage: [
      Math.round(monster.damage[0] * dmgMult),
      Math.round(monster.damage[1] * dmgMult),
    ],
    // blockChance preserved from original instance — tier scaling doesn't change it
  }
}
