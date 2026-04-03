/**
 * Monster definitions and affix pool.
 * All numbers are base — the engine scales them by floor and encounter type.
 */

export type MonsterAffix =
  | 'extraStrong'
  | 'extraFast'
  | 'fireEnchanted'
  | 'coldEnchanted'
  | 'lightningEnchanted'
  | 'teleporting'
  | 'cursed'
  | 'aura'
  | 'poisonous'

export interface MonsterDef {
  id: string
  name: string
  baseHp: number
  baseDamage: [number, number]
  baseXp: number
  /** Minimum floor this monster appears on */
  minFloor: number
  /** Minimum progression tier (default 1). Use 2+ for Crypt/Hell exclusives. */
  minTier?: number
  /** Monster's natural speed (1 = normal, 2 = fast, 0.5 = slow) */
  speed: number
}

export const MONSTERS: MonsterDef[] = [
  // Floor 1-2: fragile undead — dangerous in packs but manageable solo
  { id: 'skeleton',     name: 'Skeleton',      baseHp: 60,  baseDamage: [6,  12],  baseXp: 10,  minFloor: 1,  speed: 0.8 },
  { id: 'zombie',       name: 'Zombie',        baseHp: 105, baseDamage: [10, 20],  baseXp: 15,  minFloor: 1,  speed: 0.6 },
  { id: 'fallen',       name: 'Fallen',        baseHp: 45,  baseDamage: [8,  16],  baseXp: 8,   minFloor: 1,  speed: 1.2 },
  { id: 'imp',          name: 'Imp',           baseHp: 66,  baseDamage: [12, 24],  baseXp: 18,  minFloor: 2,  speed: 1.4 },
  { id: 'bone_warrior',  name: 'Bone Warrior',  baseHp: 90,  baseDamage: [12, 22],  baseXp: 22,  minFloor: 2,  speed: 0.9 },
  // Floor 3-5: mid-tier — tankier, hit harder
  { id: 'plague_rat',   name: 'Plague Rat',    baseHp: 55,  baseDamage: [14, 24],  baseXp: 30,  minFloor: 3,  speed: 1.6 },
  { id: 'cave_troll',   name: 'Cave Troll',    baseHp: 165, baseDamage: [16, 32],  baseXp: 28,  minFloor: 3,  speed: 0.7 },
  { id: 'dark_shaman',  name: 'Dark Shaman',   baseHp: 90,  baseDamage: [16, 28],  baseXp: 35,  minFloor: 4,  speed: 0.9 },
  { id: 'blood_hawk',   name: 'Blood Hawk',    baseHp: 84,  baseDamage: [20, 36],  baseXp: 30,  minFloor: 5,  speed: 1.5 },
  // Floor 6-8: late-game threats
  { id: 'golem',        name: 'Stone Golem',   baseHp: 240, baseDamage: [24, 44],  baseXp: 50,  minFloor: 6,  speed: 0.5 },
  { id: 'wraith',       name: 'Wraith',        baseHp: 135, baseDamage: [30, 50],  baseXp: 60,  minFloor: 7,  speed: 1.2 },
  // Floor 10: boss-class — requires gear to survive reliably
  { id: 'demon_lord',   name: 'Demon Lord',    baseHp: 360, baseDamage: [40, 70],  baseXp: 100, minFloor: 10, speed: 1.0 },
  // Floor 11-14: post-F10 — late-game entry, gear treadmill begins
  // Base stats ~20% softer than first pass; piecewise floor scaling handles deep scaling.
  { id: 'void_stalker', name: 'Void Stalker',  baseHp: 155, baseDamage: [26, 46],  baseXp: 80,  minFloor: 11, speed: 1.3 },
  { id: 'abyss_shade',  name: 'Abyss Shade',   baseHp: 115, baseDamage: [30, 52],  baseXp: 90,  minFloor: 12, speed: 1.4 },
  { id: 'iron_golem',   name: 'Iron Golem',    baseHp: 300, baseDamage: [28, 48],  baseXp: 95,  minFloor: 12, speed: 0.5 },
  { id: 'cursed_revenant', name: 'Cursed Revenant', baseHp: 205, baseDamage: [34, 56], baseXp: 105, minFloor: 13, speed: 0.9 },
  // Floor 15-19: mid late-game — radiant gem / new runeword tier
  { id: 'infernal_drake', name: 'Infernal Drake', baseHp: 245, baseDamage: [40, 65], baseXp: 130, minFloor: 15, speed: 1.1 },
  { id: 'chaos_knight',   name: 'Chaos Knight',   baseHp: 340, baseDamage: [44, 72], baseXp: 145, minFloor: 16, speed: 0.8 },
  { id: 'void_herald',    name: 'Void Herald',    baseHp: 175, baseDamage: [48, 76], baseXp: 155, minFloor: 18, speed: 1.5 },
  // Floor 20-24: late endgame — Infinity/Eternity runeword tier
  { id: 'abyssal_titan',  name: 'Abyssal Titan',  baseHp: 430, baseDamage: [52, 84], baseXp: 180, minFloor: 20, speed: 0.7 },
  { id: 'soul_devourer',  name: 'Soul Devourer',  baseHp: 220, baseDamage: [56, 92], baseXp: 195, minFloor: 22, speed: 1.2 },
  // Floor 25-29: final gauntlet — Apocalypse runeword tier
  { id: 'ancient_evil',   name: 'Ancient Evil',   baseHp: 380, baseDamage: [64, 104], baseXp: 230, minFloor: 25, speed: 1.0 },
  { id: 'worldstone_guardian', name: 'Worldstone Guardian', baseHp: 560, baseDamage: [72, 116], baseXp: 270, minFloor: 28, speed: 0.6 },
  // ── Tier 2 exclusives (Crypt) ────────────────────────────────────────────────
  { id: 'crypt_fiend',   name: 'Crypt Fiend',   baseHp: 110, baseDamage: [18, 34],  baseXp: 45,  minFloor: 1,  minTier: 2, speed: 1.3 },
  { id: 'hollow_knight', name: 'Hollow Knight', baseHp: 200, baseDamage: [22, 40],  baseXp: 60,  minFloor: 3,  minTier: 2, speed: 0.8 },
  { id: 'grave_warden',  name: 'Grave Warden',  baseHp: 155, baseDamage: [20, 36],  baseXp: 50,  minFloor: 5,  minTier: 2, speed: 0.9 },
  // ── Tier 3+ exclusives (Hell) ───────────────────────────────────────────────
  { id: 'hell_knight',   name: 'Hell Knight',   baseHp: 260, baseDamage: [30, 55],  baseXp: 90,  minFloor: 1,  minTier: 3, speed: 1.0 },
  { id: 'doom_guard',    name: 'Doom Guard',    baseHp: 340, baseDamage: [36, 65],  baseXp: 120, minFloor: 4,  minTier: 3, speed: 0.7 },
  { id: 'soul_reaper',   name: 'Soul Reaper',   baseHp: 190, baseDamage: [35, 60],  baseXp: 110, minFloor: 7,  minTier: 3, speed: 1.2 },
]

export const MONSTER_AFFIXES: Record<MonsterAffix, { name: string; description: string }> = {
  extraStrong:        { name: 'Extra Strong',          description: 'Deals 2× physical damage' },
  extraFast:          { name: 'Extra Fast',             description: 'Always acts before the player' },
  fireEnchanted:      { name: 'Fire Enchanted',         description: '+50% fire damage, +50% fire resistance' },
  coldEnchanted:      { name: 'Cold Enchanted',         description: '+50% cold damage, +50% cold resistance' },
  lightningEnchanted: { name: 'Lightning Enchanted',    description: '+50% lightning damage, +50% lightning resistance' },
  teleporting:        { name: 'Teleporting',            description: 'Repositions randomly each turn' },
  cursed:             { name: 'Cursed',                 description: 'Halves player defense while in combat' },
  aura:               { name: 'Aura',                   description: 'All monsters on this floor gain +20% HP and damage' },
  poisonous:          { name: 'Poisonous',               description: '30% chance to poison on hit — deals ~15% of base damage per round for 3 rounds' },
}

export function getMonstersForFloor(floor: number, tier = 1): MonsterDef[] {
  return MONSTERS.filter(m => m.minFloor <= floor && (m.minTier ?? 1) <= tier)
}

// ── Named variants ─────────────────────────────────────────────────────────
// Recognisable elite archetypes with fixed affix combos. Appear at elite+ tier.

export interface NamedVariant {
  id:            string
  name:          string
  baseId:        string       // references a MonsterDef id
  forcedAffixes: MonsterAffix[]
  minFloor:      number
  /** Minimum progression tier for this variant to appear. */
  minTier?:      number
  /** Extra HP multiplier on top of the normal tier scaling (1.0 = no extra) */
  hpBonus:       number
}

export const NAMED_VARIANTS: NamedVariant[] = [
  { id: 'plagueborn_zombie',  name: 'Plagueborn Zombie',  baseId: 'zombie',       forcedAffixes: ['coldEnchanted', 'cursed'],              minFloor: 4,  hpBonus: 1.20 },
  { id: 'charnel_fiend',      name: 'Charnel Fiend',      baseId: 'crypt_fiend',  forcedAffixes: ['extraFast', 'poisonous'],                minFloor: 3,  minTier: 2, hpBonus: 1.15 },
  { id: 'infernal_knight',    name: 'Infernal Knight',    baseId: 'hell_knight',  forcedAffixes: ['fireEnchanted', 'extraStrong'],          minFloor: 4,  minTier: 3, hpBonus: 1.20 },
  { id: 'venomfang_rat',      name: 'Venomfang Rat',      baseId: 'plague_rat',   forcedAffixes: ['poisonous', 'extraFast'],                minFloor: 3,  hpBonus: 1.10 },
  { id: 'soulfire_imp',       name: 'Soulfire Imp',       baseId: 'imp',          forcedAffixes: ['fireEnchanted', 'teleporting'],          minFloor: 4,  hpBonus: 1.10 },
  { id: 'voidborn_fallen',    name: 'Voidborn Fallen',    baseId: 'fallen',       forcedAffixes: ['lightningEnchanted', 'extraFast'],       minFloor: 5,  hpBonus: 1.15 },
  { id: 'ironbone_warrior',   name: 'Ironbone Warrior',   baseId: 'bone_warrior', forcedAffixes: ['extraStrong', 'aura'],                   minFloor: 5,  hpBonus: 1.25 },
  { id: 'bloodrage_hawk',     name: 'Bloodrage Hawk',     baseId: 'blood_hawk',   forcedAffixes: ['extraFast', 'extraStrong'],              minFloor: 6,  hpBonus: 1.20 },
  { id: 'blighted_shaman',    name: 'Blighted Shaman',    baseId: 'dark_shaman',  forcedAffixes: ['cursed', 'coldEnchanted'],               minFloor: 7,  hpBonus: 1.30 },
  { id: 'stone_sentinel',     name: 'Stone Sentinel',     baseId: 'golem',        forcedAffixes: ['aura', 'extraStrong'],                   minFloor: 8,  hpBonus: 1.30 },
  { id: 'void_wraith',        name: 'Void Wraith',        baseId: 'wraith',       forcedAffixes: ['teleporting', 'cursed'],                 minFloor: 9,  hpBonus: 1.25 },
  // Deep floor named variants (F11+)
  { id: 'eclipse_stalker',   name: 'Eclipse Stalker',    baseId: 'void_stalker', forcedAffixes: ['extraFast', 'cursed'],                   minFloor: 12, hpBonus: 1.20 },
  { id: 'molten_golem',      name: 'Molten Golem',       baseId: 'iron_golem',   forcedAffixes: ['fireEnchanted', 'extraStrong'],          minFloor: 13, hpBonus: 1.30 },
  { id: 'dread_revenant',    name: 'Dread Revenant',     baseId: 'cursed_revenant', forcedAffixes: ['aura', 'cursed'],                    minFloor: 14, hpBonus: 1.25 },
  { id: 'serpent_drake',     name: 'Serpent Drake',      baseId: 'infernal_drake', forcedAffixes: ['lightningEnchanted', 'poisonous'],    minFloor: 16, hpBonus: 1.15 },
  { id: 'abyssal_knight',    name: 'Abyssal Knight',     baseId: 'chaos_knight', forcedAffixes: ['extraStrong', 'aura'],                  minFloor: 18, hpBonus: 1.35 },
  { id: 'rift_herald',       name: 'Rift Herald',        baseId: 'void_herald',  forcedAffixes: ['teleporting', 'lightningEnchanted'],    minFloor: 20, hpBonus: 1.20 },
  { id: 'colossus_titan',    name: 'Colossus Titan',     baseId: 'abyssal_titan',forcedAffixes: ['extraStrong', 'coldEnchanted'],         minFloor: 22, hpBonus: 1.30 },
  { id: 'soul_tyrant',       name: 'Soul Tyrant',        baseId: 'soul_devourer',forcedAffixes: ['cursed', 'aura'],                       minFloor: 24, hpBonus: 1.40 },
  { id: 'primordial_evil',   name: 'Primordial Evil',    baseId: 'ancient_evil', forcedAffixes: ['extraStrong', 'fireEnchanted', 'aura'], minFloor: 27, hpBonus: 1.50 },
]

export function getNamedVariantsForFloor(floor: number, tier = 1): NamedVariant[] {
  return NAMED_VARIANTS.filter(v => v.minFloor <= floor && (v.minTier ?? 1) <= tier)
}
