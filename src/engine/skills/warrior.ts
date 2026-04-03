import { fxToBase, type CombatAction, type ActiveEffects, type PlayerCombatStats } from '../combat'
import type { SkillId } from '../../data/skills'

export function buildWarriorAction(skillId: SkillId, fx: ActiveEffects, playerStats?: PlayerCombatStats): CombatAction {
  const base = fxToBase(fx)
  switch (skillId) {
    case 'power_strike': {
      const boost = playerStats?.skillBoostWarrior ?? 0
      return { type: 'skill', skillId, damageMultiplier: 2.0 + boost * 0.3, ...base }
    }
    case 'battle_cry':
      // Cast round always applies 0.35 reduction regardless of prior effect
      return { type: 'skill', skillId, skipPlayerAttack: true, ...base, incomingDamageReduction: 0.35 }
    case 'iron_skin':
      // Cast round always applies 30 iron bonus
      return { type: 'skill', skillId, skipPlayerAttack: true, ...base, ironSkinBonus: 30 }
    case 'whirlwind':
      return { type: 'skill', skillId, attackTwice: true, ...base }
    default:
      return { type: 'skill', skillId, ...base }
  }
}
