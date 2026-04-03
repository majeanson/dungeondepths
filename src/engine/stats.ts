/**
 * Pure stat functions — no React, no Zustand.
 * Safe to import from tests, stores, and engine code.
 */

import { type ClassId, getClassDef } from '../data/classes'
import type { PlayerCombatStats } from './combat'
import type { EquipSlot } from './inventory'
import type { Item } from './loot'

const BASE_HP      = 80
const HP_PER_FLOOR = 5

/** Maximum elemental resistance, as a percentage (0–100). Shared with combat.ts. */
export const RESIST_CAP_PCT = 75

export function maxHpForFloor(floor: number, level = 0, classId?: ClassId | null): number {
  const classDef   = classId ? getClassDef(classId) : null
  const classBonus = classDef?.bonusHp ?? 0
  return BASE_HP + floor * HP_PER_FLOOR + level * 5 + classBonus
}

export function maxManaForLevel(level: number, classId?: ClassId | null): number {
  const classDef      = classId ? getClassDef(classId) : null
  const base          = classDef?.baseMana     ?? 40
  const perLevel      = classDef?.manaPerLevel ?? 8
  const passiveLevels = Math.max(0, level - 10)
  const passiveMana   = (classDef?.passivePerLevel?.mana ?? 0) * passiveLevels
  return base + level * perLevel + passiveMana
}

/** Total XP required to reach level N (cumulative, not incremental). */
export function xpForLevel(level: number): number {
  return level * (level + 1) / 2 * 100
}

export function levelFromXp(xp: number): number {
  let level = 0
  while (xpForLevel(level + 1) <= xp) level++
  return level
}

export function xpToNextLevel(xp: number): { current: number; needed: number; level: number } {
  const level = levelFromXp(xp)
  const base  = xpForLevel(level)
  const next  = xpForLevel(level + 1)
  return { current: xp - base, needed: next - base, level }
}

/** Build full player combat stats from floor + level + equipped items + class.
 *  ghostCharm — if set, 25% of its effectiveStats are merged in (Ghost Echo mechanic). */
export function buildPlayerStats(
  floor: number,
  level = 0,
  equipped: Partial<Record<EquipSlot, Item>> = {},
  classId?: ClassId | null,
  ghostCharm?: Item | null,
): PlayerCombatStats {
  const eq: Record<string, number> = {}
  const hasOffhand = !!equipped.offhand
  for (const item of Object.values(equipped)) {
    if (!item) continue
    for (const [k, v] of Object.entries(item.effectiveStats)) {
      eq[k] = (eq[k] ?? 0) + (v as number)
    }
  }
  // Ghost Echo: 25% of lost item stats bleed through
  if (ghostCharm) {
    for (const [k, v] of Object.entries(ghostCharm.effectiveStats)) {
      const bonus = Math.floor((v as number) * 0.25)
      if (bonus !== 0) eq[k] = (eq[k] ?? 0) + bonus
    }
  }

  const classDef = classId ? getClassDef(classId) : null
  const lvl      = level

  // Passive bonuses — one stack per level above 10 (late-game scaling driver)
  const passiveLevels = Math.max(0, lvl - 10)
  const p = classDef?.passivePerLevel ?? {}
  const passiveHp      = (p.hp      ?? 0) * passiveLevels
  const passiveDef     = (p.defense ?? 0) * passiveLevels
  const passiveDmg     = (p.damage  ?? 0) * passiveLevels
  const passiveCrit    = (p.critChance  ?? 0) * passiveLevels
  const passiveDex     = (p.dexterity  ?? 0) * passiveLevels
  const passiveSp      = (p.spellPower ?? 0) * passiveLevels
  const passiveMana    = (p.mana ?? 0) * passiveLevels

  const baseHp = BASE_HP + floor * HP_PER_FLOOR + lvl * 5 + (classDef?.bonusHp ?? 0) + (eq.life ?? 0) + passiveHp

  return {
    hp:    baseHp,
    maxHp: baseHp,
    damage: [
      8  + floor * 2 + lvl + (eq.damage ?? 0) + passiveDmg,
      16 + floor * 3 + lvl + (eq.damage ?? 0) + passiveDmg,
    ],
    defense:         5 + floor * 2 + lvl + (classDef?.defensePerLevel ?? 0) * lvl + (eq.defense ?? 0) + (eq.armor ?? 0) + passiveDef,
    critChance:      10 + (classDef?.bonusCritChance ?? 0) + Math.floor(lvl / 5) * 2 + (eq.critChance ?? 0) + passiveCrit,
    attackSpeed:     60 + (eq.attackSpeed ?? 0),
    stamina:         100,
    dexterity:       (classDef?.bonusDex ?? 0) + (eq.dexterity ?? 0) + passiveDex,
    blockChance:     Math.min(75, (hasOffhand ? 10 : 0) + (eq.blockChance ?? 0)),
    fireDamage:      eq.fireDamage ?? 0,
    coldDamage:      eq.coldDamage ?? 0,
    lightningDamage: eq.lightningDamage ?? 0,
    fireResist:      Math.min(RESIST_CAP_PCT, (eq.fireResist ?? 0) + (eq.resistFire ?? 0)),
    coldResist:      Math.min(RESIST_CAP_PCT, (eq.coldResist ?? 0) + (eq.resistCold ?? 0)),
    lightResist:     Math.min(RESIST_CAP_PCT, (eq.lightResist ?? 0) + (eq.resistLightning ?? 0)),
    spellPower:         (classDef ? (classDef.baseSpellPower ?? 0) + floor * classDef.spellPowerPerFloor + lvl * classDef.spellPowerPerLevel : 0) + (eq.spellPower ?? 0) + passiveSp,
    skillBoostWarrior:  eq.skillBoostWarrior  ?? 0,
    skillBoostRogue:    eq.skillBoostRogue    ?? 0,
    skillBoostSorcerer: eq.skillBoostSorcerer ?? 0,
  }
}

/** Extra mana from late-game passives (levels above 10). */
export function passiveManaBonus(level: number, classId?: ClassId | null): number {
  const classDef = classId ? getClassDef(classId) : null
  const passiveLevels = Math.max(0, level - 10)
  return (classDef?.passivePerLevel?.mana ?? 0) * passiveLevels
}
