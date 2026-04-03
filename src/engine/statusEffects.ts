import type { SkillId } from '../data/skills'
import type { ActiveEffects } from './combat'

export interface StatusCounters {
  battleCryRoundsLeft:   number
  ironSkinRoundsLeft:    number
  smokeScreenRoundsLeft: number
  manaShieldRoundsLeft:  number
  meditateRoundsLeft:    number
  /** Rounds until iron_skin can be used again (counts down each round). */
  ironSkinCooldown:      number
  /** Rounds until smoke_bomb can be used again (counts down each round). */
  smokeBombCooldown:     number
  /** Rounds of poison remaining on the player (set by poisonous monsters). */
  poisonRoundsLeft:      number
  /** Flat damage dealt per poison round. */
  poisonDmgPerRound:     number
}

export const ZERO_COUNTERS: StatusCounters = {
  battleCryRoundsLeft:   0,
  ironSkinRoundsLeft:    0,
  smokeScreenRoundsLeft: 0,
  manaShieldRoundsLeft:  0,
  meditateRoundsLeft:    0,
  ironSkinCooldown:      0,
  smokeBombCooldown:     0,
  poisonRoundsLeft:      0,
  poisonDmgPerRound:     0,
}

/** Decrement all active status effect counters by 1 (called every round). */
export function tickCounters(c: StatusCounters): StatusCounters {
  return {
    battleCryRoundsLeft:   Math.max(0, c.battleCryRoundsLeft - 1),
    ironSkinRoundsLeft:    Math.max(0, c.ironSkinRoundsLeft - 1),
    smokeScreenRoundsLeft: Math.max(0, c.smokeScreenRoundsLeft - 1),
    manaShieldRoundsLeft:  Math.max(0, c.manaShieldRoundsLeft - 1),
    meditateRoundsLeft:    Math.max(0, c.meditateRoundsLeft - 1),
    ironSkinCooldown:      Math.max(0, c.ironSkinCooldown - 1),
    smokeBombCooldown:     Math.max(0, c.smokeBombCooldown - 1),
    poisonRoundsLeft:      Math.max(0, c.poisonRoundsLeft - 1),
    poisonDmgPerRound:     c.poisonRoundsLeft > 1 ? c.poisonDmgPerRound : 0,
  }
}

/** Build ActiveEffects from current status counters — used by combatStore before each action. */
export function buildActiveEffects(c: StatusCounters): ActiveEffects {
  return {
    dmgReduction: c.battleCryRoundsLeft  > 0 ? 0.35 : undefined,
    ironBonus:    c.ironSkinRoundsLeft    > 0 ? 30   : undefined,
    smokeActive:  c.smokeScreenRoundsLeft > 0,
    shieldActive: c.manaShieldRoundsLeft  > 0,
  }
}

/**
 * Apply the counter change for a freshly cast skill.
 * Skills that grant multi-round buffs set their counter to 2
 * (cast-round is turn 0; 2 more ticks follow).
 * All other counters are ticked down normally.
 */
export function applySkillCounters(skillId: SkillId, c: StatusCounters): StatusCounters {
  const next = tickCounters(c)
  switch (skillId) {
    case 'battle_cry':  return { ...next, battleCryRoundsLeft:   2 }
    case 'iron_skin':   return { ...next, ironSkinRoundsLeft:    2, ironSkinCooldown:  3 }
    case 'smoke_bomb':  return { ...next, smokeScreenRoundsLeft: 2, smokeBombCooldown: 3 }
    case 'mana_shield': return { ...next, manaShieldRoundsLeft:  2 }
    case 'meditate':    return { ...next, meditateRoundsLeft:    2 }
    default:            return next
  }
}
