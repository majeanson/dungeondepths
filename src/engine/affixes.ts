/**
 * Affix pools for Magic and Rare items.
 * Each affix is a prefix OR suffix and applies to specific slots.
 */

import type { ItemSlot } from '../data/items'

export type AffixType = 'prefix' | 'suffix'

export interface AffixDef {
  id: string
  type: AffixType
  /** Display name fragment, e.g. "Cruel" → "Cruel [item name]" */
  name: string
  /** Which slots this affix can roll on. Empty = all slots. */
  slots: ItemSlot[]
  /** Minimum floor before this affix appears. */
  minFloor: number
  /** Stat bonuses: key → [min, max] flat bonus */
  stats: Record<string, [number, number]>
  /**
   * Relative drop weight (higher = appears more often).
   * Bread-and-butter affixes (life, defense) get 100+.
   * Powerful or rare affixes (crit, elemental) get 10–30.
   * Defaults to 50 if omitted.
   */
  frequency: number
}

export const AFFIXES: AffixDef[] = [
  // ── Prefixes (weapon damage) ─────────────────────────────────────────────
  // Sharp/Jagged: workhouse damage prefixes — show up constantly
  { id: 'pre_sharp',     type: 'prefix', name: 'Sharp',     slots: ['weapon'], minFloor: 1,  frequency: 120, stats: { damage: [2, 5] } },
  { id: 'pre_jagged',    type: 'prefix', name: 'Jagged',    slots: ['weapon'], minFloor: 1,  frequency: 100, stats: { damage: [4, 8] } },
  // Cruel: strong but not rare — mid-game common
  { id: 'pre_cruel',     type: 'prefix', name: 'Cruel',     slots: ['weapon'], minFloor: 5,  frequency: 40,  stats: { damage: [8, 16] } },
  // Godly: endgame — uncommon even on late floors
  { id: 'pre_godly',     type: 'prefix', name: 'Godly',     slots: ['weapon'], minFloor: 12, frequency: 15,  stats: { damage: [16, 30] } },
  // Elemental: mid-frequency — powerful due to status effects
  { id: 'pre_flaming',   type: 'prefix', name: 'Flaming',   slots: ['weapon'], minFloor: 3,  frequency: 35,  stats: { fireDamage: [3, 10] } },
  { id: 'pre_freezing',  type: 'prefix', name: 'Freezing',  slots: ['weapon'], minFloor: 4,  frequency: 35,  stats: { coldDamage: [3, 10] } },
  { id: 'pre_shocking',  type: 'prefix', name: 'Shocking',  slots: ['weapon'], minFloor: 4,  frequency: 30,  stats: { lightDamage: [2, 14] } },
  // Vicious: rare — crit is the slot's best affix
  { id: 'pre_vicious',   type: 'prefix', name: 'Vicious',   slots: ['weapon'], minFloor: 6,  frequency: 12,  stats: { critChance: [3, 8] } },
  // ── Prefixes (defense) ───────────────────────────────────────────────────
  { id: 'pre_sturdy',    type: 'prefix', name: 'Sturdy',    slots: ['chest','helmet','legs','offhand'], minFloor: 1, frequency: 130, stats: { defense: [4, 10] } },
  { id: 'pre_strong',    type: 'prefix', name: 'Strong',    slots: ['chest','helmet','legs','offhand'], minFloor: 3, frequency: 80,  stats: { defense: [8, 18] } },
  { id: 'pre_glorious',  type: 'prefix', name: 'Glorious',  slots: ['chest','helmet','legs','offhand'], minFloor: 8, frequency: 30,  stats: { defense: [16, 32] } },
  // ── Prefixes (life) ──────────────────────────────────────────────────────
  // Life is the most common affix in the game — on everything
  { id: 'pre_amber',     type: 'prefix', name: 'Amber',     slots: [], minFloor: 1,  frequency: 150, stats: { life: [5, 15] } },
  { id: 'pre_ruby',      type: 'prefix', name: 'Ruby',      slots: [], minFloor: 5,  frequency: 70,  stats: { life: [15, 30] } },
  { id: 'pre_crimson',   type: 'prefix', name: 'Crimson',   slots: [], minFloor: 10, frequency: 25,  stats: { life: [30, 50] } },
  // ── Prefixes (magic find) ────────────────────────────────────────────────
  // MF: uncommon — finding +MF gear is part of the hunt
  { id: 'pre_lucky',     type: 'prefix', name: 'Lucky',     slots: [], minFloor: 3,  frequency: 25,  stats: { magicFind: [5, 15] } },
  { id: 'pre_fortunate', type: 'prefix', name: 'Fortunate', slots: [], minFloor: 8,  frequency: 10,  stats: { magicFind: [15, 30] } },
  // ── Suffixes (attack speed) ──────────────────────────────────────────────
  { id: 'suf_speed',     type: 'suffix', name: 'of Speed',     slots: ['weapon','boots','gloves'], minFloor: 2, frequency: 60,  stats: { attackSpeed: [5, 15] } },
  { id: 'suf_quickness', type: 'suffix', name: 'of Quickness', slots: ['weapon','boots','gloves'], minFloor: 6, frequency: 20,  stats: { attackSpeed: [15, 30] } },
  // ── Suffixes (resistances) ───────────────────────────────────────────────
  // Single resists: common — players always need them
  { id: 'suf_fire_res',  type: 'suffix', name: 'of the Flame',  slots: [], minFloor: 2, frequency: 90, stats: { fireResist: [5, 15] } },
  { id: 'suf_cold_res',  type: 'suffix', name: 'of the Tundra', slots: [], minFloor: 2, frequency: 90, stats: { coldResist: [5, 15] } },
  { id: 'suf_light_res', type: 'suffix', name: 'of the Storm',  slots: [], minFloor: 2, frequency: 90, stats: { lightResist: [5, 15] } },
  // All-resist: rare and coveted — the best suffix in the game
  { id: 'suf_all_res',   type: 'suffix', name: 'of Warding',    slots: [], minFloor: 8, frequency: 8,  stats: { fireResist: [5, 10], coldResist: [5, 10], lightResist: [5, 10] } },
  // ── Suffixes (strength / dex) ────────────────────────────────────────────
  { id: 'suf_strength',  type: 'suffix', name: 'of Strength',  slots: [], minFloor: 1, frequency: 80, stats: { strength: [3, 8] } },
  { id: 'suf_dexterity', type: 'suffix', name: 'of Dexterity', slots: [], minFloor: 1, frequency: 80, stats: { dexterity: [3, 8] } },
  // ── Suffixes (mana) ──────────────────────────────────────────────────────
  { id: 'suf_the_mind', type: 'suffix', name: 'of the Mind', slots: [], minFloor: 3, frequency: 60, stats: { mana: [5, 15] } },
  // Sorcery: rare — dual stat
  { id: 'suf_sorcery',  type: 'suffix', name: 'of Sorcery',  slots: [], minFloor: 7, frequency: 12, stats: { mana: [15, 30], spellPower: [3, 8] } },
  // ── Suffixes (stamina) ───────────────────────────────────────────────────
  { id: 'suf_endurance', type: 'suffix', name: 'of Endurance', slots: ['boots','legs','chest'], minFloor: 2, frequency: 70, stats: { stamina: [10, 25] } },
  { id: 'suf_the_ox',    type: 'suffix', name: 'of the Ox',    slots: ['boots','legs','chest'], minFloor: 6, frequency: 25, stats: { stamina: [25, 50] } },
  // ── Suffixes (block) ─────────────────────────────────────────────────────
  // Block is offhand-only — uncommon but meaningful
  { id: 'suf_blocking', type: 'suffix', name: 'of Blocking', slots: ['offhand'], minFloor: 3, frequency: 50, stats: { blockChance: [5, 12] } },
  // ── Charm-specific affixes ───────────────────────────────────────────────
  { id: 'chr_life', type: 'prefix', name: 'Amber',      slots: ['charm'], minFloor: 3, frequency: 100, stats: { life: [3, 10] } },
  { id: 'chr_res',  type: 'suffix', name: 'of Warding', slots: ['charm'], minFloor: 5, frequency: 50,  stats: { fireResist: [3, 7], coldResist: [3, 7] } },
  { id: 'chr_mf',   type: 'prefix', name: 'Lucky',      slots: ['charm'], minFloor: 4, frequency: 30,  stats: { magicFind: [3, 8] } },
  { id: 'chr_dmg',  type: 'prefix', name: 'Toxic',      slots: ['charm'], minFloor: 6, frequency: 40,  stats: { damage: [2, 6] } },
  // ── Skill-boost suffixes (class-specific) ────────────────────────────────
  // +1-2 to a class signature skill — rare, meaningful at any stage
  { id: 'suf_power_strike', type: 'suffix', name: 'of Power',   slots: ['weapon','chest','helmet'], minFloor: 4,  frequency: 12, stats: { skillBoostWarrior:  [1, 2] } },
  { id: 'suf_backstab',     type: 'suffix', name: 'of Shadows', slots: ['weapon','chest','boots'],  minFloor: 4,  frequency: 12, stats: { skillBoostRogue:    [1, 2] } },
  { id: 'suf_fireball',     type: 'suffix', name: 'of Flames',  slots: ['weapon','chest','helmet'], minFloor: 4,  frequency: 12, stats: { skillBoostSorcerer: [1, 2] } },
]

/** Get affixes valid for a given slot and floor depth. */
export function getValidAffixes(slot: ItemSlot, floor: number, type: AffixType): AffixDef[] {
  return AFFIXES.filter(a =>
    a.type === type &&
    a.minFloor <= floor &&
    (a.slots.length === 0 || a.slots.includes(slot))
  )
}
