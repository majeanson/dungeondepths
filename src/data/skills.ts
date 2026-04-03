import type { ClassId } from './classes'

export type SkillId =
  | 'power_strike' | 'battle_cry' | 'iron_skin' | 'whirlwind'
  | 'backstab' | 'shadow_step' | 'rapid_strike' | 'smoke_bomb'
  | 'fireball' | 'meditate' | 'ice_blast' | 'chain_lightning' | 'mana_shield'
  | 'spark'

export interface SkillDef {
  id: SkillId
  name: string
  classId: ClassId
  levelRequired: number
  manaCost: number
  description: string
  /** Rounds before the skill can be used again after casting (0 or undefined = no cooldown). */
  cooldownRounds?: number
}

export const SKILLS: SkillDef[] = [
  // ── Warrior ────────────────────────────────────────────────────────────────
  {
    id: 'power_strike',
    name: 'Power Strike',
    classId: 'warrior',
    levelRequired: 0,
    manaCost: 8,
    description: 'Deal 2× damage this round',
  },
  {
    id: 'battle_cry',
    name: 'Battle Cry',
    classId: 'warrior',
    levelRequired: 5,
    manaCost: 12,
    description: 'Take 35% less damage for 2 rounds',
  },
  {
    id: 'iron_skin',
    name: 'Iron Skin',
    classId: 'warrior',
    levelRequired: 8,
    manaCost: 0,
    cooldownRounds: 3,
    description: '+30 defense for 2 rounds — monster still attacks',
  },
  {
    id: 'whirlwind',
    name: 'Whirlwind',
    classId: 'warrior',
    levelRequired: 8,
    manaCost: 14,
    description: 'Attack twice this round — second hit always connects',
  },
  // ── Rogue ──────────────────────────────────────────────────────────────────
  {
    id: 'backstab',
    name: 'Backstab',
    classId: 'rogue',
    levelRequired: 0,
    manaCost: 8,
    description: 'Guaranteed crit at 2× — removes all crit RNG for one strike',
  },
  {
    id: 'shadow_step',
    name: 'Shadow Step',
    classId: 'rogue',
    levelRequired: 5,
    manaCost: 14,
    description: 'Strike first for 1.5× damage — monster retaliates at 45% power',
  },
  {
    id: 'rapid_strike',
    name: 'Rapid Strike',
    classId: 'rogue',
    levelRequired: 8,
    manaCost: 14,
    description: '3 hits at 60% damage — 25% chance to trigger a 4th hit',
  },
  {
    id: 'smoke_bomb',
    name: 'Smoke Bomb',
    classId: 'rogue',
    levelRequired: 8,
    manaCost: 0,
    cooldownRounds: 2,
    description: 'Enemy hit chance -55% for 2 rounds — still attacks this round',
  },
  // ── Sorcerer ───────────────────────────────────────────────────────────────
  {
    id: 'fireball',
    name: 'Fireball',
    classId: 'sorcerer',
    levelRequired: 4,
    manaCost: 28,
    description: 'Launch a fireball — 3× spell power as fire damage',
  },
  {
    id: 'spark',
    name: 'Spark',
    classId: 'sorcerer',
    levelRequired: 0,
    manaCost: 10,
    description: '1.5× spell power as lightning — ignores defense, scales with dungeon depth',
  },
  {
    id: 'meditate',
    name: 'Meditate',
    classId: 'sorcerer',
    levelRequired: 0,
    manaCost: 0,
    description: 'Skip attack — regen 20 mana per turn for 3 turns (60 total, monster still attacks)',
  },
  {
    id: 'ice_blast',
    name: 'Ice Blast',
    classId: 'sorcerer',
    levelRequired: 6,
    manaCost: 20,
    description: '2.5× spell power as cold damage — deep freeze halves enemy hit chance',
  },
  {
    id: 'chain_lightning',
    name: 'Chain Lightning',
    classId: 'sorcerer',
    levelRequired: 10,
    manaCost: 25,
    description: '2× spell power as lightning — fully pierces resistance',
  },
  {
    id: 'mana_shield',
    name: 'Mana Shield',
    classId: 'sorcerer',
    levelRequired: 10,
    manaCost: 0,
    description: 'Absorb 72% of incoming damage as mana for 3 rounds',
  },
]

export function getSkillsForClass(classId: ClassId): SkillDef[] {
  return SKILLS.filter(s => s.classId === classId)
}

export const SKILL_GLYPH: Record<SkillId, string> = {
  power_strike:    '⚡',
  battle_cry:      '◉',
  iron_skin:       '◫',
  whirlwind:       '◎',
  backstab:        '†',
  shadow_step:     '◌',
  rapid_strike:    '≫',
  smoke_bomb:      '◦',
  spark:           '⊹',
  fireball:        '◆',
  meditate:        '✦',
  ice_blast:       '❄',
  chain_lightning: '⌁',
  mana_shield:     '◈',
}
