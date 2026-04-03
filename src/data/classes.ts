/**
 * Class definitions — Warrior, Rogue, Sorcerer.
 * Pure data: no React, no store imports.
 */

import type { SkillId } from './skills'
import { COLORS } from '../theme'

export type ClassId = 'warrior' | 'rogue' | 'sorcerer'

export interface ClassDef {
  id: ClassId
  name: string
  description: string
  flavor: string
  color: string
  /** Flat HP added on top of base maxHp formula */
  bonusHp: number
  /** Defense added per player level */
  defensePerLevel: number
  /** Bonus crit chance (absolute %) */
  bonusCritChance: number
  /** Bonus dexterity (hit chance + evasion) */
  bonusDex: number
  /** Base mana (replaces default 40) */
  baseMana: number
  /** Mana gained per level (replaces default 8) */
  manaPerLevel: number
  /** Base spell power at level 0 (Sorcerer: functional from day 1) */
  baseSpellPower: number
  /** Spell power per floor (Sorcerer elemental scaling) */
  spellPowerPerFloor: number
  /** Spell power per player level */
  spellPowerPerLevel: number
  /** Skill IDs available to this class (in unlock order) */
  skillIds: SkillId[]
  /**
   * Passive bonuses applied automatically per level above 10.
   * Each level past 10 stacks one copy of these bonuses.
   * Used to keep deep-floor (F11-F30) progression meaningful.
   */
  passivePerLevel: Partial<{
    hp: number
    defense: number
    damage: number
    critChance: number
    dexterity: number
    spellPower: number
    mana: number
  }>
}

export const CLASSES: ClassDef[] = [
  {
    id: 'warrior',
    name: 'Warrior',
    description: 'Armored juggernaut. Highest HP and defense. Skills hit hard and absorb punishment — endurance wins.',
    flavor: '"Steel over sorcery."',
    color: COLORS.class.warrior,
    bonusHp: 40,
    defensePerLevel: 5,
    bonusCritChance: 0,
    bonusDex: 0,
    baseMana: 50,
    manaPerLevel: 5,
    baseSpellPower: 0,
    spellPowerPerFloor: 0,
    spellPowerPerLevel: 0,
    skillIds: ['power_strike', 'battle_cry', 'iron_skin', 'whirlwind'],
    passivePerLevel: { hp: 25, defense: 10, damage: 6 },
  },
  {
    id: 'rogue',
    name: 'Rogue',
    description: 'Swift assassin. High crit and evasion. Burst damage and smoke tricks let you dictate the fight.',
    flavor: '"Strike first. Strike fast. Vanish."',
    color: COLORS.class.rogue,
    bonusHp: -10,
    defensePerLevel: 0,
    bonusCritChance: 10,
    bonusDex: 8,
    baseMana: 60,
    manaPerLevel: 6,
    baseSpellPower: 0,
    spellPowerPerFloor: 0,
    spellPowerPerLevel: 0,
    skillIds: ['backstab', 'shadow_step', 'rapid_strike', 'smoke_bomb'],
    passivePerLevel: { critChance: 2, dexterity: 4, damage: 5 },
  },
  {
    id: 'sorcerer',
    name: 'Sorcerer',
    description: 'Arcane caster. Fragile but deadly. Elemental spells scale with level — earn XP, earn power.',
    flavor: '"Power is borrowed. Mastery is earned."',
    color: COLORS.class.sorcerer,
    bonusHp: 5,
    defensePerLevel: 0,
    bonusCritChance: 0,
    bonusDex: 0,
    baseMana: 60,
    manaPerLevel: 6,
    baseSpellPower: 10,
    spellPowerPerFloor: 0,
    spellPowerPerLevel: 7,
    skillIds: ['spark', 'meditate', 'fireball', 'ice_blast', 'chain_lightning', 'mana_shield'],
    passivePerLevel: { spellPower: 10, mana: 8, hp: 20 },
  },
]

export function getClassDef(id: ClassId): ClassDef {
  const def = CLASSES.find(c => c.id === id)
  if (!def) throw new Error(`Unknown class: ${id}`)
  return def
}
