import { fxToBase, type CombatAction, type ActiveEffects, type PlayerCombatStats } from '../combat'
import type { SkillId } from '../../data/skills'

export function buildSorcererAction(skillId: SkillId, fx: ActiveEffects, playerStats?: PlayerCombatStats): CombatAction {
  const base = fxToBase(fx)
  switch (skillId) {
    case 'fireball': {
      const boost = playerStats?.skillBoostSorcerer ?? 0
      return { type: 'skill', skillId, fireSpellMult: 3.0 + boost * 0.5, ...base }
    }
    case 'spark':
      // 1.5× spell power — beats physical at depth, costs only 6 mp
      return { type: 'skill', skillId, lightningSpellMult: 1.5, spellVarianceFlat: 6, ...base }
    case 'meditate':
      // Mana-only: 30 mana restored per turn for 3 turns (no HP heal), tracked in store
      return { type: 'skill', skillId, skipPlayerAttack: true, ...base }
    case 'ice_blast':
      return { type: 'skill', skillId, coldSpellMult: 2.5, hardChill: true, ...base }
    case 'chain_lightning':
      return { type: 'skill', skillId, lightningSpellMult: 2.0, ...base }
    case 'mana_shield':
      // Cast round activates shield immediately
      return { type: 'skill', skillId, skipPlayerAttack: true, ...base, manaShieldActive: true }
    default:
      return { type: 'skill', skillId, ...base }
  }
}
