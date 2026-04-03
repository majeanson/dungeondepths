import { fxToBase, type CombatAction, type ActiveEffects, type PlayerCombatStats } from '../combat'
import type { SkillId } from '../../data/skills'

export function buildRogueAction(skillId: SkillId, fx: ActiveEffects, playerStats?: PlayerCombatStats): CombatAction {
  const base = fxToBase(fx)
  switch (skillId) {
    case 'backstab': {
      const boost = playerStats?.skillBoostRogue ?? 0
      // Guaranteed crit at 2× — value is the guarantee, not an inflated multiplier
      return { type: 'skill', skillId, guaranteedCrit: true, critMultiplier: 2.0 + boost * 0.2, ...base }
    }
    case 'shadow_step': {
      // Strike first for 1.5× damage — monster still retaliates but at 55% power
      // Spread base first, then override incomingDamageReduction (stacks with battle_cry if active)
      const baseDmgRed = base.incomingDamageReduction ?? 0
      return { type: 'skill', skillId, ...base, damageMultiplier: 1.5, incomingDamageReduction: Math.min(0.80, baseDmgRed + 0.55) }
    }
    case 'rapid_strike':
      // 3 hits at 60% — average 1.8× with 25% chance of a 4th (~2.05× expected)
      return { type: 'skill', skillId, attackCount: 3, perHitMultiplier: 0.6, bonusHitChance: 25, ...base }
    case 'smoke_bomb':
      // Cast round activates smoke immediately
      return { type: 'skill', skillId, skipPlayerAttack: true, ...base, smokeScreenActive: true }
    default:
      return { type: 'skill', skillId, ...base }
  }
}
