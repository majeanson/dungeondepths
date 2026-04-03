/**
 * Runeword recipes and their bonus effects.
 * A runeword is activated when the correct rune sequence is inserted
 * into a Normal-quality item with exactly the right number of sockets.
 */

export interface RunewordDef {
  id: string
  name: string
  /** Rune IDs in order, e.g. ['rune_el', 'rune_ith', 'rune_tir'] */
  recipe: string[]
  /** Which base item slots this runeword can be applied to. */
  validSlots: string[]
  minFloor: number
  stats: Record<string, number | [number, number]>
  /** Flavor description shown in tooltip */
  description: string
}

export const RUNEWORDS: RunewordDef[] = [
  {
    id: 'rw_steelstorm',
    name: 'Steelstorm',
    recipe: ['rune_sol', 'rune_el', 'rune_ith'],
    validSlots: ['weapon'],
    minFloor: 7,
    stats: { damage: [20, 35], attackSpeed: 20, critChance: 5 },
    description: 'A blade refined in forge-fire. Better than most rares at this tier.',
  },
  {
    id: 'rw_ancientshield',
    name: 'Ancient Aegis',
    recipe: ['rune_tir', 'rune_eld'],
    validSlots: ['offhand'],
    minFloor: 4,
    stats: { defense: 25, blockChance: 15, life: 20 },
    description: 'Carved with runes of the old world. Stalwart in all conditions.',
  },
  {
    id: 'rw_windwalker',
    name: 'Windwalker',
    recipe: ['rune_el', 'rune_nef'],
    validSlots: ['boots'],
    minFloor: 5,
    stats: { moveSpeed: 30, stamina: 25, dexterity: 8 },
    description: 'Fleet as the wind itself. Stamina troubles fade.',
  },
  {
    id: 'rw_ironfortress',
    name: 'Iron Fortress',
    recipe: ['rune_eld', 'rune_tir', 'rune_nef'],
    validSlots: ['chest'],
    minFloor: 8,
    stats: { defense: 50, life: 40, fireResist: 15, coldResist: 15 },
    description: 'A suit of armor that laughs at lesser blows.',
  },
  {
    id: 'rw_shadowsong',
    name: 'Shadowsong',
    recipe: ['rune_eth', 'rune_ith'],
    validSlots: ['weapon'],
    minFloor: 6,
    stats: { damage: [14, 22], critChance: 10, dexterity: 10 },
    description: 'The blade sings before it strikes. Critics say it hums.',
  },
  {
    id: 'rw_mindspike',
    name: 'Mindspike',
    recipe: ['rune_tir', 'rune_tal'],
    validSlots: ['weapon'],
    minFloor: 9,
    stats: { damage: [10, 18], spellPower: 20, mana: 30 },
    description: 'A staff forged for those who wield both steel and sorcery.',
  },
  {
    id: 'rw_deathcoil',
    name: 'Deathcoil',
    recipe: ['rune_nef', 'rune_shael', 'rune_dol'],
    validSlots: ['weapon'],
    minFloor: 14,
    stats: { damage: [30, 50], critChance: 12, attackSpeed: 25, life: -20 },
    description: 'Tremendous power. A cost in blood.',
  },
  {
    id: 'rw_stormcrown',
    name: 'Stormcrown',
    recipe: ['rune_sol', 'rune_shael'],
    validSlots: ['helmet'],
    minFloor: 11,
    stats: { defense: 20, lightResist: 25, mana: 25, spellPower: 10 },
    description: 'Crackles with barely-contained lightning.',
  },
  // ── Phase 5 runewords ──────────────────────────────────────────────────────
  {
    id: 'rw_stealth',
    name: 'Stealth',
    recipe: ['rune_tal', 'rune_eth'],
    validSlots: ['chest'],
    minFloor: 3,
    stats: { defense: 10, dexterity: 12, moveSpeed: 20, mana: 15 },
    description: 'Move unseen. Strike before heard.',
  },
  {
    id: 'rw_leaf',
    name: 'Leaf',
    recipe: ['rune_tir', 'rune_ral'],
    validSlots: ['weapon'],
    minFloor: 2,
    stats: { damage: [5, 10], fireDamage: 12, mana: 20 },
    description: 'Fire blooms from the tip of this humble staff.',
  },
  {
    id: 'rw_strength',
    name: 'Strength',
    recipe: ['rune_amn', 'rune_tir'],
    validSlots: ['weapon'],
    minFloor: 3,
    stats: { damage: [8, 16], life: 25, defense: 8 },
    description: 'The strength of stone, the speed of the river.',
  },
  {
    id: 'rw_zephyr',
    name: 'Zephyr',
    recipe: ['rune_ort', 'rune_eth'],
    validSlots: ['weapon', 'boots'],
    minFloor: 4,
    stats: { attackSpeed: 25, dexterity: 15, moveSpeed: 15 },
    description: 'As quick as a whisper, as sure as the gale.',
  },
  {
    id: 'rw_lore',
    name: 'Lore',
    recipe: ['rune_ort', 'rune_sol'],
    validSlots: ['helmet'],
    minFloor: 5,
    stats: { spellPower: 15, mana: 30, defense: 12, lightResist: 20 },
    description: 'Ancient knowledge flows through the wearer.',
  },
  {
    id: 'rw_smoke',
    name: 'Smoke',
    recipe: ['rune_nef', 'rune_lum'],
    validSlots: ['chest'],
    minFloor: 7,
    stats: { defense: 30, fireResist: 20, coldResist: 20, lightResist: 20 },
    description: 'Clouds your form from enemy eyes.',
  },
  {
    id: 'rw_malice',
    name: 'Malice',
    recipe: ['rune_ith', 'rune_el', 'rune_eth'],
    validSlots: ['weapon'],
    minFloor: 5,
    stats: { damage: [16, 28], critChance: 8, attackSpeed: 10 },
    description: 'Every blow carries intent to wound.',
  },
  {
    id: 'rw_spirit',
    name: 'Spirit',
    recipe: ['rune_tal', 'rune_thul', 'rune_ort', 'rune_amn'],
    validSlots: ['weapon', 'offhand'],
    minFloor: 12,
    stats: { damage: [10, 20], mana: 60, spellPower: 30, critChance: 6, life: 25 },
    description: 'The four elements bound in a single form.',
  },
  // ── Deep runewords (F15-F22) ───────────────────────────────────────────────
  {
    id: 'rw_perdition',
    name: 'Perdition',
    recipe: ['rune_dol', 'rune_hel'],
    validSlots: ['weapon'],
    minFloor: 15,
    stats: { damage: [35, 60], critChance: 15, lifeSteal: 10 },
    description: 'Condemned by its own hunger. Feeds on the fallen.',
  },
  {
    id: 'rw_enlightenment',
    name: 'Enlightenment',
    recipe: ['rune_lum', 'rune_io'],
    validSlots: ['weapon'],
    minFloor: 16,
    stats: { damage: [15, 28], spellPower: 50, mana: 70, critChance: 8 },
    description: 'Understanding comes at the cost of patience.',
  },
  {
    id: 'rw_veil',
    name: 'Veil',
    recipe: ['rune_ko', 'rune_hel'],
    validSlots: ['helmet', 'chest'],
    minFloor: 17,
    stats: { defense: 55, dexterity: 22, coldResist: 30, moveSpeed: 20 },
    description: 'Wrapped in shadow, protected by speed.',
  },
  {
    id: 'rw_infinity',
    name: 'Infinity',
    recipe: ['rune_lem', 'rune_ko', 'rune_fal'],
    validSlots: ['weapon'],
    minFloor: 18,
    stats: { damage: [45, 80], lightningDamage: 55, attackSpeed: 30, critChance: 10 },
    description: 'Lightning without end. The storm incarnate.',
  },
  {
    id: 'rw_eternity',
    name: 'Eternity',
    recipe: ['rune_amn', 'rune_pul', 'rune_fal', 'rune_sol'],
    validSlots: ['chest'],
    minFloor: 20,
    stats: { defense: 90, life: 80, lifeSteal: 12, fireResist: 25, coldResist: 25 },
    description: 'Neither time nor blade can undo this armor.',
  },
  {
    id: 'rw_apocalypse',
    name: 'Apocalypse',
    recipe: ['rune_mal', 'rune_um', 'rune_pul'],
    validSlots: ['weapon'],
    minFloor: 22,
    stats: { damage: [60, 100], critChance: 20, fireDamage: 40, coldDamage: 40, lightningDamage: 40 },
    description: 'The end of all things, distilled into a blade.',
  },
]

export function getRunewordById(id: string): RunewordDef | undefined {
  return RUNEWORDS.find(r => r.id === id)
}

// ── Slot Groups ────────────────────────────────────────────────────────────
// Maps item slot → bonus group for rune/gem bonus lookup.
type SlotGroup = 'weapon' | 'armor' | 'offhand' | 'boots'

function slotToGroup(slot: string): SlotGroup {
  if (slot === 'weapon')  return 'weapon'
  if (slot === 'offhand') return 'offhand'
  if (slot === 'boots')   return 'boots'
  return 'armor'   // helmet, chest, gloves, legs, belt, circlet
}

// ── Individual Rune Bonuses ────────────────────────────────────────────────
// Applied per inserted rune when NO runeword is active.
// Intentionally smaller than the combined runeword payoff — completing a
// runeword always beats stacking individual rune bonuses.
const RUNE_BONUSES: Record<string, Partial<Record<SlotGroup, Record<string, number>>>> = {
  rune_el: {
    weapon:  { damage: 3 },
    armor:   { defense: 5 },
    offhand: { defense: 4, blockChance: 3 },
    boots:   { moveSpeed: 5 },
  },
  rune_eld: {
    weapon:  { damage: 5 },
    armor:   { life: 8 },
    offhand: { defense: 7 },
    boots:   { stamina: 8 },
  },
  rune_tir: {
    weapon:  { damage: 4, mana: 6 },
    armor:   { mana: 12 },
    offhand: { defense: 5, mana: 8 },
    boots:   { stamina: 6, mana: 6 },
  },
  rune_nef: {
    weapon:  { damage: 5, attackSpeed: 5 },
    armor:   { defense: 10 },
    offhand: { defense: 8, blockChance: 6 },
    boots:   { stamina: 10 },
  },
  rune_eth: {
    weapon:  { damage: 7, attackSpeed: 8 },
    armor:   { dexterity: 6 },
    offhand: { dexterity: 5, defense: 7 },
    boots:   { moveSpeed: 10, stamina: 5 },
  },
  rune_ith: {
    weapon:  { damage: 10 },
    armor:   { defense: 12 },
    offhand: { defense: 9 },
    boots:   { moveSpeed: 10 },
  },
  rune_tal: {
    weapon:  { damage: 8, critChance: 4 },
    armor:   { defense: 10, coldResist: 10 },
    offhand: { defense: 8, blockChance: 6 },
    boots:   { stamina: 12 },
  },
  rune_ral: {
    weapon:  { fireDamage: 14 },
    armor:   { fireResist: 20 },
    offhand: { defense: 10, fireResist: 15 },
    boots:   { moveSpeed: 8, fireResist: 15 },
  },
  rune_ort: {
    weapon:  { lightningDamage: 14, attackSpeed: 8 },
    armor:   { lightResist: 20 },
    offhand: { defense: 10, lightResist: 15 },
    boots:   { moveSpeed: 10, lightResist: 15 },
  },
  rune_sol: {
    weapon:  { damage: 12 },
    armor:   { defense: 14, life: 12 },
    offhand: { defense: 14, blockChance: 8 },
    boots:   { stamina: 20 },
  },
  rune_lum: {
    weapon:  { damage: 10, spellPower: 12 },
    armor:   { mana: 25, defense: 10 },
    offhand: { defense: 12, mana: 18 },
    boots:   { moveSpeed: 12, mana: 12 },
  },
  rune_shael: {
    weapon:  { attackSpeed: 20 },
    armor:   { defense: 14, dexterity: 8 },
    offhand: { blockChance: 10, dexterity: 8 },
    boots:   { moveSpeed: 18, stamina: 12 },
  },
  rune_thul: {
    weapon:  { coldDamage: 16 },
    armor:   { coldResist: 25, defense: 12 },
    offhand: { defense: 18, coldResist: 20 },
    boots:   { stamina: 18, coldResist: 20 },
  },
  rune_amn: {
    weapon:  { damage: 14, lifeSteal: 5 },
    armor:   { life: 20, defense: 12 },
    offhand: { defense: 18, life: 15 },
    boots:   { moveSpeed: 18, life: 12 },
  },
  rune_dol: {
    weapon:  { damage: 18, critChance: 8 },
    armor:   { life: 25, defense: 18 },
    offhand: { defense: 20, blockChance: 12 },
    boots:   { moveSpeed: 22, stamina: 18 },
  },
  // ── Deep runes (F15-F22) ──────────────────────────────────────────────────
  rune_hel: {
    weapon:  { damage: 22, attackSpeed: 12 },
    armor:   { defense: 22, life: 20 },
    offhand: { defense: 24, blockChance: 14 },
    boots:   { moveSpeed: 24, stamina: 20 },
  },
  rune_io: {
    weapon:  { damage: 20, spellPower: 18 },
    armor:   { mana: 35, defense: 20 },
    offhand: { defense: 22, mana: 28 },
    boots:   { moveSpeed: 20, mana: 20 },
  },
  rune_ko: {
    weapon:  { damage: 24, critChance: 10 },
    armor:   { defense: 26, dexterity: 12 },
    offhand: { defense: 26, blockChance: 16 },
    boots:   { moveSpeed: 26, dexterity: 12 },
  },
  rune_fal: {
    weapon:  { damage: 26, lifeSteal: 8 },
    armor:   { life: 35, defense: 24 },
    offhand: { defense: 28, life: 25 },
    boots:   { moveSpeed: 28, life: 22 },
  },
  rune_lem: {
    weapon:  { damage: 28, critChance: 12 },
    armor:   { defense: 28, fireResist: 20, coldResist: 20 },
    offhand: { defense: 30, blockChance: 18 },
    boots:   { moveSpeed: 30, stamina: 25 },
  },
  rune_pul: {
    weapon:  { damage: 32, attackSpeed: 18 },
    armor:   { defense: 32, life: 40 },
    offhand: { defense: 35, life: 30 },
    boots:   { moveSpeed: 32, stamina: 30 },
  },
  rune_um: {
    weapon:  { damage: 30, fireDamage: 20, coldDamage: 20 },
    armor:   { fireResist: 30, coldResist: 30, lightResist: 30 },
    offhand: { defense: 38, blockChance: 22 },
    boots:   { moveSpeed: 28, fireResist: 25, coldResist: 25 },
  },
  rune_mal: {
    weapon:  { damage: 38, critChance: 15 },
    armor:   { defense: 40, life: 50 },
    offhand: { defense: 45, blockChance: 25 },
    boots:   { moveSpeed: 35, stamina: 35 },
  },
}

/** Returns per-slot bonus stats for an individual rune (not part of a runeword). */
export function getRuneBonus(runeId: string, slot: string): Record<string, number> {
  return RUNE_BONUSES[runeId]?.[slotToGroup(slot)] ?? {}
}

// ── Gem Bonuses ────────────────────────────────────────────────────────────
// Gems always apply their bonus (even inside a completed runeword).
// Design: gems focus on elemental/utility stats that runes don't cover as well.
// Three tiers: chipped (floor 1-5) → flawed (floor 6-10) → perfect (floor 11+).
const GEM_BONUSES: Record<string, Partial<Record<SlotGroup, Record<string, number>>>> = {
  // ── Ruby: fire damage / fire resist / stamina ──────────────────────────────
  gem_ruby_chipped: {
    weapon:  { fireDamage: 10 },
    armor:   { fireResist: 15 },
    offhand: { fireResist: 12, defense: 8 },
    boots:   { fireResist: 12, stamina: 10 },
  },
  gem_ruby_flawed: {
    weapon:  { fireDamage: 20 },
    armor:   { fireResist: 25 },
    offhand: { fireResist: 20, defense: 15 },
    boots:   { fireResist: 20, stamina: 15 },
  },
  gem_ruby_perfect: {
    weapon:  { fireDamage: 35 },
    armor:   { fireResist: 40 },
    offhand: { fireResist: 35, defense: 25 },
    boots:   { fireResist: 35, stamina: 25 },
  },
  // ── Sapphire: cold damage / cold resist / mana ────────────────────────────
  gem_sapphire_chipped: {
    weapon:  { coldDamage: 10 },
    armor:   { coldResist: 15, mana: 10 },
    offhand: { coldResist: 12, blockChance: 8 },
    boots:   { coldResist: 12, moveSpeed: 8 },
  },
  gem_sapphire_flawed: {
    weapon:  { coldDamage: 20 },
    armor:   { coldResist: 25, mana: 20 },
    offhand: { coldResist: 20, blockChance: 12 },
    boots:   { coldResist: 20, moveSpeed: 12 },
  },
  gem_sapphire_perfect: {
    weapon:  { coldDamage: 35 },
    armor:   { coldResist: 40, mana: 35 },
    offhand: { coldResist: 35, blockChance: 20 },
    boots:   { coldResist: 35, moveSpeed: 20 },
  },
  // ── Topaz: lightning damage / light resist / magic find ───────────────────
  gem_topaz_chipped: {
    weapon:  { lightningDamage: 10 },
    armor:   { lightResist: 15, magicFind: 10 },
    offhand: { lightResist: 12, defense: 8 },
    boots:   { lightResist: 12 },
  },
  gem_topaz_flawed: {
    weapon:  { lightningDamage: 20 },
    armor:   { lightResist: 25, magicFind: 20 },
    offhand: { lightResist: 20, defense: 15 },
    boots:   { lightResist: 20 },
  },
  gem_topaz_perfect: {
    weapon:  { lightningDamage: 35 },
    armor:   { lightResist: 40, magicFind: 35 },
    offhand: { lightResist: 35, defense: 25 },
    boots:   { lightResist: 35 },
  },
  // ── Emerald: crit / dexterity / life / block ──────────────────────────────
  gem_emerald_chipped: {
    weapon:  { critChance: 4, dexterity: 6 },
    armor:   { life: 15, defense: 8 },
    offhand: { blockChance: 8, life: 12 },
    boots:   { stamina: 15, moveSpeed: 8 },
  },
  gem_emerald_flawed: {
    weapon:  { critChance: 7, dexterity: 10 },
    armor:   { life: 25, defense: 15 },
    offhand: { blockChance: 12, life: 20 },
    boots:   { stamina: 25, moveSpeed: 12 },
  },
  gem_emerald_perfect: {
    weapon:  { critChance: 12, dexterity: 15 },
    armor:   { life: 40, defense: 25 },
    offhand: { blockChance: 18, life: 35 },
    boots:   { stamina: 40, moveSpeed: 20 },
  },
  // ── Diamond: all-resist / damage / attack speed ───────────────────────────
  gem_diamond_chipped: {
    weapon:  { damage: 8, attackSpeed: 8 },
    armor:   { fireResist: 8, coldResist: 8, lightResist: 8 },
    offhand: { blockChance: 6, defense: 10 },
    boots:   { moveSpeed: 10, stamina: 10 },
  },
  gem_diamond_flawed: {
    weapon:  { damage: 15, attackSpeed: 12 },
    armor:   { fireResist: 15, coldResist: 15, lightResist: 15 },
    offhand: { blockChance: 10, defense: 18 },
    boots:   { moveSpeed: 15, stamina: 18 },
  },
  gem_diamond_perfect: {
    weapon:  { damage: 25, attackSpeed: 18 },
    armor:   { fireResist: 25, coldResist: 25, lightResist: 25 },
    offhand: { blockChance: 15, defense: 30 },
    boots:   { moveSpeed: 25, stamina: 30 },
  },
  // ── Radiant tier (F16+) — ~60% stronger than perfect ─────────────────────
  gem_ruby_radiant: {
    weapon:  { fireDamage: 55 },
    armor:   { fireResist: 62 },
    offhand: { fireResist: 55, defense: 40 },
    boots:   { fireResist: 55, stamina: 40 },
  },
  gem_sapphire_radiant: {
    weapon:  { coldDamage: 55 },
    armor:   { coldResist: 62, mana: 55 },
    offhand: { coldResist: 55, blockChance: 32 },
    boots:   { coldResist: 55, moveSpeed: 32 },
  },
  gem_topaz_radiant: {
    weapon:  { lightningDamage: 55 },
    armor:   { lightResist: 62, magicFind: 55 },
    offhand: { lightResist: 55, defense: 40 },
    boots:   { lightResist: 55 },
  },
  gem_emerald_radiant: {
    weapon:  { critChance: 18, dexterity: 24 },
    armor:   { life: 62, defense: 40 },
    offhand: { blockChance: 28, life: 55 },
    boots:   { stamina: 62, moveSpeed: 32 },
  },
  gem_diamond_radiant: {
    weapon:  { damage: 40, attackSpeed: 28 },
    armor:   { fireResist: 40, coldResist: 40, lightResist: 40 },
    offhand: { blockChance: 24, defense: 48 },
    boots:   { moveSpeed: 40, stamina: 48 },
  },
}

/** Returns bonus stats for a gem in a given item slot. Always applies (even inside runewords). */
export function getGemBonus(gemId: string, slot: string): Record<string, number> {
  return GEM_BONUSES[gemId]?.[slotToGroup(slot)] ?? {}
}

/** Display color for a gem ID — used in socket rendering. */
export function gemColor(gemId: string): string {
  if (gemId.includes('ruby'))     return '#cc3333'
  if (gemId.includes('sapphire')) return '#3366cc'
  if (gemId.includes('topaz'))    return '#ccaa22'
  if (gemId.includes('emerald'))  return '#22aa44'
  if (gemId.includes('diamond'))  return '#aaaacc'
  return '#888888'
}

/** Tier label for gem upgrade recipe display. */
export function gemNextTier(gemId: string): string | null {
  if (gemId.includes('_chipped'))  return gemId.replace('_chipped', '_flawed')
  if (gemId.includes('_flawed'))   return gemId.replace('_flawed', '_perfect')
  if (gemId.includes('_perfect'))  return gemId.replace('_perfect', '_radiant')
  return null  // radiant — no upgrade
}

/** Check if a sequence of rune IDs + slot matches any runeword. */
export function matchRuneword(runeIds: string[], slot: string): RunewordDef | null {
  for (const rw of RUNEWORDS) {
    if (
      rw.validSlots.includes(slot) &&
      rw.recipe.length === runeIds.length &&
      rw.recipe.every((r, i) => r === runeIds[i])
    ) {
      return rw
    }
  }
  return null
}
