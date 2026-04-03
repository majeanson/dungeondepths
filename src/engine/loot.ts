/**
 * Item generation pipeline.
 * Takes a floor depth + encounter type → generates a complete Item.
 */

import { type Rng, roll, pick, weightedPick, pickN, makeRng } from './rng'
import { BASE_ITEMS, getBaseItemsForFloor, type BaseItemDef, type ItemSlot } from '../data/items'
import { AFFIXES, getValidAffixes, type AffixDef } from './affixes'
import { matchRuneword, getRunewordById, getRuneBonus, getGemBonus, gemNextTier } from '../data/runewords'
import { getRecipeById } from '../data/recipes'

export type ItemQuality = 'normal' | 'magic' | 'rare' | 'unique'

export interface RolledAffix {
  def: AffixDef
  /** Rolled value for each stat key within the def's range */
  rolledStats: Record<string, number>
}

export interface Item {
  uid: string           // unique instance id
  baseId: string
  baseName: string
  slot: ItemSlot
  size: [number, number]
  quality: ItemQuality
  sockets: number
  insertedRunes: string[]  // rune base item ids in order
  /** null if no runeword active */
  runewordId: string | null
  affixes: RolledAffix[]
  /** Rolled base stats (from the base item's stat ranges) */
  baseStats: Record<string, number>
  /** Effective stats: base + affixes + runeword */
  effectiveStats: Record<string, number>
  /** For display — tooltips, debug */
  displayName: string
  /** False while on the loot screen; true once picked up into the bag */
  identified: boolean
  /** Stack size — potions only. undefined / 1 = single. > 1 = agglomerated stack. */
  quantity?: number
}

let _uidCounter = 0
function nextUid(): string {
  _uidCounter = (_uidCounter + 1) & 0xffffff   // wrap at 16M to stay compact
  return `item_${Date.now().toString(36)}_${_uidCounter.toString(36).padStart(6, '0')}`
}

// ─── Quality Weights ───────────────────────────────────────────────────────

/** Base quality weights. magicFind (0–300%) scales rare/unique up. */
function qualityWeights(floor: number, magicFind = 0): number[] {
  const mfScale    = 1 + magicFind / 100
  const floorBonus = Math.max(0, floor - 1)
  // Unique weight is 0 on floors where no unique can drop — prevents wasted
  // probability mass and avoids the rare fallback path in generateItem.
  const uniqueWeight = floor < UNIQUE_MIN_FLOOR
    ? 0
    : Math.round((20 + floorBonus * 3) * mfScale)
  return [
    Math.max(20, 500 - floorBonus * 10),           // normal
    250 + floorBonus * 5,                           // magic
    Math.round((80 + floorBonus * 8) * mfScale),   // rare
    uniqueWeight,                                   // unique
  ]
}

// ─── Unique Item Definitions ───────────────────────────────────────────────

interface UniqueDef {
  id: string
  name: string
  baseId: string
  minFloor: number
  stats: Record<string, number>
  description: string
  /**
   * Relative drop weight among valid uniques. Higher = drops more often.
   * Selection = thisUnique.rarity / sum(allValid.rarity).
   * Common utility uniques: 200–400. Build-defining or BiS: 20–60.
   * Defaults to 100 if omitted.
   */
  rarity: number
}

const UNIQUE_ITEMS: UniqueDef[] = [
  // ── Rings & Amulets ────────────────────────────────────────────────────────
  // Emberheart: utility fire ring — common unique, gives players a taste of uniques early
  { id: 'u_emberheart',  name: 'Emberheart Ring',    baseId: 'ring',       minFloor: 4,  rarity: 300, stats: { fireDamage: 15, fireResist: 20, life: 25 },                     description: 'Warm to the touch, hot in battle.' },
  // Fox's Jewel: MF amulet — very common, drives the hunt loop
  { id: 'u_foxjewel',    name: "Fox's Jewel",         baseId: 'amulet',     minFloor: 5,  rarity: 250, stats: { dexterity: 15, magicFind: 25, moveSpeed: 10 },                  description: 'A clever amulet for a clever hunter.' },
  // ── Weapons ────────────────────────────────────────────────────────────────
  // Voidedge: best-in-slot sword — rare. Crit + damage but mana penalty creates tension.
  { id: 'u_voidedge',    name: 'Voidedge',            baseId: 'long_sword', minFloor: 6,  rarity: 40,  stats: { damage: 22, critChance: 15, mana: -10 },                        description: 'Cuts through mind as well as flesh.' },
  // Soulstealer: lifesteal dagger — uncommon, niche but powerful in long fights
  { id: 'u_soulstealer', name: 'Soulstealer',         baseId: 'dagger',     minFloor: 9,  rarity: 60,  stats: { damage: 18, mana: 20, lifeSteal: 8 },                          description: 'Drains spirit with each cut.' },
  // ── Armor ──────────────────────────────────────────────────────────────────
  // Thornmail: mid-tier armor — moderate rarity. Thorn damage is a unique mechanic.
  { id: 'u_thornmail',   name: 'Thornmail',           baseId: 'chain_mail', minFloor: 8,  rarity: 90,  stats: { defense: 30, thornDamage: 20, coldResist: 15 },                 description: 'Those who strike it suffer.' },
  // ── Helmets ────────────────────────────────────────────────────────────────
  // Deathcap: offensive helmet — uncommon. The crit+penalty tradeoff makes it feel discovered.
  { id: 'u_deathcap',    name: 'Deathcap',            baseId: 'war_helm',   minFloor: 10, rarity: 35,  stats: { defense: 20, critChance: 20, life: -15 },                       description: 'Lethal clarity at a cost.' },
  // ── Gloves ─────────────────────────────────────────────────────────────────
  // Iron Will: solid mid-range unique — moderately common, good for new players
  { id: 'u_ironwill',    name: 'Iron Will Gauntlets', baseId: 'gauntlets',  minFloor: 7,  rarity: 150, stats: { defense: 15, strength: 20, blockChance: 10 },                   description: 'Grip like a vice. Will like iron.' },
  // ── Boots ──────────────────────────────────────────────────────────────────
  // Stormboots: move + light resist — moderate rarity. Mostly utility.
  { id: 'u_stormboots',  name: 'Stormboots',          baseId: 'war_boots',  minFloor: 9,  rarity: 120, stats: { moveSpeed: 25, lightResist: 30, stamina: 20 },                  description: 'Crackle with static as you run.' },

  // ── PHASE 5 UNIQUES ────────────────────────────────────────────────────────
  // Weapons
  { id: 'u_skull_cleaver',    name: 'Skull Cleaver',        baseId: 'broad_sword', minFloor: 6,  rarity: 55,  stats: { damage: 28, critChance: 12, defense: -10 },             description: 'Carves through bone and shield alike.' },
  { id: 'u_venom_fang',       name: 'Venom Fang',           baseId: 'dagger',      minFloor: 4,  rarity: 70,  stats: { damage: 14, coldDamage: 18, lightResist: -20 },          description: 'Venom seeps into every cut.' },
  { id: 'u_arcane_wand',      name: 'Arcane Wand',          baseId: 'wand',        minFloor: 5,  rarity: 80,  stats: { damage: 6, spellPower: 35, mana: 45 },                   description: 'Hums with barely-contained energy.' },
  { id: 'u_thunderstrike',    name: 'Thunderstrike',        baseId: 'war_sword',   minFloor: 10, rarity: 40,  stats: { damage: 30, lightningDamage: 40, attackSpeed: 15 },       description: 'Each swing is a thunderclap.' },
  // Armor
  { id: 'u_shadowweave_robe', name: 'Shadowweave Robe',     baseId: 'chain_mail',  minFloor: 7,  rarity: 65,  stats: { defense: 22, dexterity: 18, critChance: 8 },              description: 'Woven from shadow threads.' },
  { id: 'u_titan_plate',      name: 'Titan Plate',          baseId: 'plate_armor', minFloor: 11, rarity: 35,  stats: { defense: 60, life: 50, moveSpeed: -15 },                  description: 'Impenetrable. Immovable.' },
  { id: 'u_windwalker_boots', name: 'Windwalker Boots',     baseId: 'leather_boots', minFloor: 3, rarity: 130, stats: { moveSpeed: 35, stamina: 30, dexterity: 12 },             description: 'Run like the wind breathes for you.' },
  // Shields
  { id: 'u_soulguard',        name: 'Soulguard',            baseId: 'heater_shield', minFloor: 6, rarity: 75,  stats: { defense: 28, blockChance: 20, life: 35, mana: 20 },      description: 'Guards body and soul together.' },
  // Rings & Amulets
  { id: 'u_stone_of_jordan',  name: 'Stone of Jordan',      baseId: 'ring',        minFloor: 8,  rarity: 25,  stats: { mana: 80, spellPower: 25, dexterity: 10 },                description: 'The stone that starts the storm.' },
  { id: 'u_nagelring',        name: 'Nagelring',            baseId: 'ring',        minFloor: 5,  rarity: 90,  stats: { magicFind: 40, life: 15, defense: 8 },                    description: 'Fortune favours the finder.' },
  { id: 'u_manald_heal',      name: 'Manald Heal',          baseId: 'ring',        minFloor: 6,  rarity: 95,  stats: { mana: 30, life: 20, critChance: 5 },                      description: 'Heals both body and spirit.' },
  { id: 'u_mahim_oak',        name: 'Mahim-Oak Curio',      baseId: 'amulet',      minFloor: 7,  rarity: 55,  stats: { defense: 20, life: 30, fireResist: 15, coldResist: 15 },  description: 'Carved from a tree struck by lightning.' },
  // Belts & Gloves
  { id: 'u_goldwrap',         name: 'Goldwrap',             baseId: 'gauntlets',   minFloor: 10, rarity: 60,  stats: { magicFind: 50, defense: 18, attackSpeed: 10 },             description: 'Fortune wraps your hands.' },
  { id: 'u_harlequin_crest',  name: 'Harlequin Crest',      baseId: 'war_helm',    minFloor: 12, rarity: 20,  stats: { defense: 35, life: 40, mana: 40, magicFind: 30, critChance: 5 }, description: 'The jester who laughs last.' },

  // ── Deep uniques (F12-F25) ─────────────────────────────────────────────────
  { id: 'u_shard_visor',    name: 'Shard Visor',          baseId: 'dread_helm',   minFloor: 15, rarity: 50,  stats: { defense: 45, critChance: 18, spellPower: 20 },                           description: 'Shards of broken worlds, fused into a helm.' },
  { id: 'u_ravager_grip',   name: 'Ravager Grip',         baseId: 'gauntlets',    minFloor: 13, rarity: 65,  stats: { damage: 20, attackSpeed: 25, critChance: 12, life: -20 },                description: 'Tears through armor. Tears through flesh.' },
  { id: 'u_voidweave',      name: 'Voidweave',            baseId: 'obsidian_plate',minFloor: 17, rarity: 30, stats: { defense: 75, coldResist: 35, lightResist: 35, mana: 50 },                description: 'Woven between realities. Nothing passes.' },
  { id: 'u_soul_harvest',   name: 'Soul Harvest',         baseId: 'runic_blade',  minFloor: 16, rarity: 25,  stats: { damage: 45, lifeSteal: 15, critChance: 20, mana: -30 },                  description: 'Each kill feeds the next blow.' },
  { id: 'u_eternity_band',  name: 'Eternity Band',        baseId: 'ring',         minFloor: 20, rarity: 15,  stats: { life: 60, mana: 60, fireResist: 20, coldResist: 20, lightResist: 20 },   description: 'Time bends around the wearer.' },
  { id: 'u_doom_gauntlets', name: 'Doom Gauntlets',       baseId: 'gauntlets',    minFloor: 22, rarity: 20,  stats: { damage: 35, defense: 30, fireDamage: 30, critChance: 15 },                description: 'Every strike carries the weight of oblivion.' },
  { id: 'u_worldstone_shard',name:'Worldstone Shard',     baseId: 'amulet',       minFloor: 25, rarity: 10,  stats: { spellPower: 60, mana: 80, life: 50, critChance: 10, defense: 25 },       description: 'A fragment of the axis of creation.' },
]

/** Lowest floor at which any unique can drop. Items below this fall back to rare. */
const UNIQUE_MIN_FLOOR = Math.min(...UNIQUE_ITEMS.map(u => u.minFloor))

// ─── Affix Rolling ─────────────────────────────────────────────────────────

function rollAffixStats(affix: AffixDef, rng: Rng): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, [min, max]] of Object.entries(affix.stats)) {
    out[key] = roll(rng, min, max)
  }
  return out
}

function rollAffixes(rng: Rng, slot: ItemSlot, floor: number, prefixCount: number, suffixCount: number): RolledAffix[] {
  const prefixes = getValidAffixes(slot, floor, 'prefix')
  const suffixes = getValidAffixes(slot, floor, 'suffix')
  const result: RolledAffix[] = []

  // Weighted pick without replacement — expand each affix by its frequency,
  // then pick N unique defs. Common affixes (life, defense) appear far more
  // often than rare ones (crit, all-resist, MF).
  function weightedPickN(pool: typeof prefixes, count: number): typeof prefixes {
    const selected: typeof prefixes = []
    const remaining = [...pool]
    for (let i = 0; i < Math.min(count, remaining.length); i++) {
      const weights = remaining.map(a => a.frequency ?? 50)
      const total   = weights.reduce((s, w) => s + w, 0)
      let r         = rng() * total
      let idx       = 0
      for (let j = 0; j < weights.length; j++) {
        r -= weights[j]
        if (r <= 0) { idx = j; break }
      }
      selected.push(remaining[idx])
      remaining.splice(idx, 1)
    }
    return selected
  }

  const selectedPrefixes = weightedPickN(prefixes, prefixCount)
  const selectedSuffixes = weightedPickN(suffixes, suffixCount)

  for (const def of [...selectedPrefixes, ...selectedSuffixes]) {
    result.push({ def, rolledStats: rollAffixStats(def, rng) })
  }
  return result
}

// ─── Effective Stats ───────────────────────────────────────────────────────

function computeEffectiveStats(
  baseStats: Record<string, number>,
  affixes: RolledAffix[],
  runewordId: string | null,
  insertedSocketables: string[] = [],
  slot = '',
): Record<string, number> {
  const stats = { ...baseStats }

  if (runewordId) {
    // Runeword active: use runeword stats (replaces affix + individual rune bonuses)
    const rw = getRunewordById(runewordId)
    if (rw) {
      for (const [key, val] of Object.entries(rw.stats)) {
        const v = Array.isArray(val) ? (val[0] + val[1]) / 2 : (val as number)
        stats[key] = (stats[key] ?? 0) + v
      }
    }
  } else {
    // No runeword: apply affix bonuses + individual rune bonuses
    for (const affix of affixes) {
      for (const [key, val] of Object.entries(affix.rolledStats)) {
        stats[key] = (stats[key] ?? 0) + val
      }
    }
    if (slot) {
      for (const socketableId of insertedSocketables) {
        if (socketableId.startsWith('rune_')) {
          const bonus = getRuneBonus(socketableId, slot)
          for (const [key, val] of Object.entries(bonus)) {
            stats[key] = (stats[key] ?? 0) + val
          }
        }
      }
    }
  }

  // Gems always apply regardless of runeword state
  if (slot) {
    for (const socketableId of insertedSocketables) {
      if (socketableId.startsWith('gem_')) {
        const bonus = getGemBonus(socketableId, slot)
        for (const [key, val] of Object.entries(bonus)) {
          stats[key] = (stats[key] ?? 0) + val
        }
      }
    }
  }

  return stats
}

// ─── Display Name ──────────────────────────────────────────────────────────

function buildDisplayName(base: BaseItemDef, quality: ItemQuality, affixes: RolledAffix[], runewordName?: string): string {
  if (runewordName) return runewordName
  if (quality === 'normal') return base.name
  const prefixes = affixes.filter(a => a.def.type === 'prefix').map(a => a.def.name)
  const suffixes = affixes.filter(a => a.def.type === 'suffix').map(a => a.def.name)
  const parts = [...prefixes, base.name, ...suffixes]
  return parts.join(' ')
}

// ─── Main Generator ────────────────────────────────────────────────────────

export interface GenerateOptions {
  floor?: number
  magicFind?: number
  /** Force a specific quality. */
  forceQuality?: ItemQuality
  /** Force a specific slot. */
  slot?: ItemSlot
  /** Force a specific base item id (e.g. 'dagger', 'short_sword'). */
  forceBaseId?: string
}

export function generateItem(rng: Rng, opts: GenerateOptions = {}): Item {
  const floor = opts.floor ?? 1
  const magicFind = opts.magicFind ?? 0

  // 1. Pick base item
  const validBases = getBaseItemsForFloor(floor).filter(b =>
    b.slot !== 'rune'    && // runes drop separately via generateRune
    b.slot !== 'potion'  && // potions drop separately via generateManaPotion
    (!opts.slot || b.slot === opts.slot) &&
    (!opts.forceBaseId || b.id === opts.forceBaseId)
  )
  const base = validBases.length > 0 ? pick(rng, validBases) : pick(rng, getBaseItemsForFloor(floor).filter(b => b.slot !== 'rune' && b.slot !== 'potion'))

  // 2. Roll quality
  const qualities: ItemQuality[] = ['normal', 'magic', 'rare', 'unique']
  const quality = opts.forceQuality ?? weightedPick(rng, qualities, qualityWeights(floor, magicFind))

  // 3. Roll base stats
  const baseStats: Record<string, number> = {}
  for (const [key, [min, max]] of Object.entries(base.baseStats)) {
    baseStats[key] = roll(rng, min, max)
  }

  // 4. Roll sockets — normal gets full range; magic gets 0–1 (25% chance); rare gets 0–1 (15% chance)
  let sockets = 0
  if (quality === 'normal') {
    sockets = roll(rng, base.socketRange[0], base.socketRange[1])
  } else if (quality === 'magic' && base.socketRange[1] > 0) {
    sockets = rng() < 0.25 ? 1 : 0
  } else if (quality === 'rare' && base.socketRange[1] > 0) {
    sockets = rng() < 0.15 ? 1 : 0
  }

  // 5. Roll affixes based on quality
  let affixes: RolledAffix[] = []
  if (quality === 'magic') {
    const prefixCount = roll(rng, 0, 1)
    // If no prefix, force a suffix so the item always has at least 1 affix
    const suffixCount = prefixCount === 0 ? 1 : roll(rng, 0, 1)
    affixes = rollAffixes(rng, base.slot, floor, prefixCount, suffixCount)
  } else if (quality === 'rare') {
    const prefixCount = roll(rng, 2, 3)
    const suffixCount = roll(rng, 2, 3)
    affixes = rollAffixes(rng, base.slot, floor, prefixCount, suffixCount)
  }

  // 6. Unique items: override affixes with fixed stats, selected by rarity weight
  let uniqueDef: UniqueDef | undefined
  let resolvedQuality = quality
  if (quality === 'unique') {
    const validUniques = UNIQUE_ITEMS.filter(u => u.minFloor <= floor && u.baseId === base.id)
    if (validUniques.length > 0) {
      // Weighted selection: rarer uniques (low rarity value) drop far less often
      uniqueDef = weightedPick(rng, validUniques, validUniques.map(u => u.rarity ?? 100))
    } else {
      // No unique for this base — roll as rare instead
      resolvedQuality = 'rare'
      const prefixCount = roll(rng, 2, 3)
      const suffixCount = roll(rng, 2, 3)
      affixes = rollAffixes(rng, base.slot, floor, prefixCount, suffixCount)
    }
  }

  const effectiveStats = uniqueDef
    ? { ...baseStats, ...uniqueDef.stats }
    : computeEffectiveStats(baseStats, affixes, null, [], base.slot)

  const displayName = uniqueDef
    ? uniqueDef.name
    : buildDisplayName(base, quality, affixes)

  return {
    uid: nextUid(),
    baseId: base.id,
    baseName: base.name,
    slot: base.slot,
    size: base.size,
    quality: uniqueDef ? 'unique' : resolvedQuality,
    sockets,
    insertedRunes: [],
    runewordId: null,
    affixes,
    baseStats,
    effectiveStats,
    displayName,
    identified: false,
  }
}

/** Generate a rune drop for the given floor. Higher floors → better runes. */
export function generateRune(rng: Rng, floor: number): Item {
  const allRunes = BASE_ITEMS.filter(i => i.slot === 'rune')
  const runes = allRunes.filter(i => i.minFloor <= floor)
  // Fall back to lowest rune if floor is too low for any rune
  const pool = runes.length > 0 ? runes : allRunes.slice(0, 1)
  // Weight toward lower runes (more common)
  const weights = pool.map((_, idx) => Math.max(1, pool.length - idx))
  const base = weightedPick(rng, pool, weights)
  return {
    uid: nextUid(),
    baseId: base.id,
    baseName: base.name,
    slot: 'rune',
    size: [1, 1],
    quality: 'normal',
    sockets: 0,
    insertedRunes: [],
    runewordId: null,
    affixes: [],
    baseStats: {},
    effectiveStats: {},
    displayName: base.name,
    identified: true,  // runes are always identified — no mystery
  }
}

/** Insert a rune or gem into an item. Returns updated item (or original if invalid). */
export function insertRune(item: Item, runeBaseId: string): Item {
  if (item.quality !== 'normal') return item
  if (item.insertedRunes.length >= item.sockets) return item

  const newSocketables = [...item.insertedRunes, runeBaseId]
  // Only actual runes (not gems) participate in runeword matching
  const runesOnly = newSocketables.filter(id => !id.startsWith('gem_'))
  const rw = matchRuneword(runesOnly, item.slot)

  return {
    ...item,
    insertedRunes: newSocketables,
    runewordId: rw?.id ?? null,
    displayName: rw ? rw.name : item.displayName,
    effectiveStats: computeEffectiveStats(item.baseStats, item.affixes, rw?.id ?? null, newSocketables, item.slot),
    identified: true,
  }
}

/** Generate a gem drop for the given floor. Higher floors → better gems. */
export function generateGem(rng: Rng, floor: number): Item {
  const gemTypes = ['ruby', 'sapphire', 'topaz', 'emerald', 'diamond']
  // Diamond only available from floor 3+
  const availableTypes = floor >= 3 ? gemTypes : gemTypes.slice(0, 4)
  const gemType = pick(rng, availableTypes)

  // Tier weights: chipped most common, radiant rarest. Better tiers unlock at higher floors.
  type Tier = { id: string; minFloor: number; weight: number }
  const tiers: Tier[] = [
    { id: `gem_${gemType}_chipped`,  minFloor: 1,  weight: 60 },
    { id: `gem_${gemType}_flawed`,   minFloor: 6,  weight: 30 },
    { id: `gem_${gemType}_perfect`,  minFloor: 11, weight: 10 },
    { id: `gem_${gemType}_radiant`,  minFloor: 16, weight: 5  },
  ]
  const validTiers = tiers.filter(t => t.minFloor <= floor)
  const chosen = weightedPick(rng, validTiers, validTiers.map(t => t.weight))

  // Find base item def for display name — scan both BASE_ITEMS and deep gems
  const allGems = BASE_ITEMS.filter(i => i.slot === 'gem')
  const base = allGems.find(i => i.id === chosen.id)
  const displayName = base?.name ?? chosen.id

  return {
    uid: nextUid(),
    baseId: chosen.id,
    baseName: displayName,
    slot: 'gem',
    size: [1, 1],
    quality: 'normal',
    sockets: 0,
    insertedRunes: [],
    runewordId: null,
    affixes: [],
    baseStats: {},
    effectiveStats: {},
    displayName,
    identified: true,
  }
}

/** Generate an HP potion. Heal amount scales with floor depth.
 *  F1-3: 60 HP  | F4-6: 100 HP  | F7-9: 160 HP
 *  F10-14: 220 HP | F15-19: 300 HP | F20+: 400 HP
 *  Keeps potions ~50-60% effective regardless of player max HP at depth. */
export function generateHpPotion(floor = 1): Item {
  const heal = floor >= 20 ? 400 : floor >= 15 ? 300 : floor >= 10 ? 220 : floor >= 7 ? 160 : floor >= 4 ? 100 : 60
  const displayName = heal >= 400 ? 'Elixir of Life' : heal >= 300 ? 'Mega Rejuvenation' : heal >= 220 ? 'Full Rejuvenation' : heal >= 160 ? 'Superior Health Potion' : heal >= 100 ? 'Greater Health Potion' : 'Healing Potion'
  return {
    uid:            nextUid(),
    baseId:         'hp_potion',
    baseName:       'Health Potion',
    slot:           'potion',
    size:           [1, 1],
    quality:        'normal',
    sockets:        0,
    insertedRunes:  [],
    runewordId:     null,
    affixes:        [],
    baseStats:      {},
    effectiveStats: { heal },
    displayName,
    identified:     true,
  }
}

export function generateStaminaPotion(floor = 1): Item {
  const restore = floor >= 7 ? 60 : 40
  const displayName = restore >= 60 ? 'Stamina Elixir' : 'Stamina Flask'
  return {
    uid:            nextUid(),
    baseId:         'stamina_potion',
    baseName:       'Stamina Flask',
    slot:           'potion',
    size:           [1, 1],
    quality:        'normal',
    sockets:        0,
    insertedRunes:  [],
    runewordId:     null,
    affixes:        [],
    baseStats:      {},
    effectiveStats: { restore },
    displayName,
    identified:     true,
  }
}

export function generateManaPotion(floor = 1): Item {
  const restore = floor >= 10 ? 120 : floor >= 7 ? 80 : floor >= 4 ? 55 : 40
  const displayName = restore >= 120 ? 'Elixir of Clarity' : restore >= 80 ? 'Superior Mana Vial' : restore >= 55 ? 'Greater Mana Vial' : 'Mana Vial'
  return {
    uid:            nextUid(),
    baseId:         'mana_potion',
    baseName:       'Mana Vial',
    slot:           'potion',
    size:           [1, 1],
    quality:        'normal',
    sockets:        0,
    insertedRunes:  [],
    runewordId:     null,
    affixes:        [],
    baseStats:      {},
    effectiveStats: { restore },
    displayName,
    identified:     true,
  }
}

export function generateTownPortalScroll(): Item {
  return {
    uid:            nextUid(),
    baseId:         'town_portal_scroll',
    baseName:       'Town Portal Scroll',
    slot:           'potion',
    size:           [1, 1],
    quality:        'normal',
    sockets:        0,
    insertedRunes:  [],
    runewordId:     null,
    affixes:        [],
    baseStats:      {},
    effectiveStats: {},
    displayName:    'TP Scroll',
    identified:     true,
  }
}

// ─── Class Starting Gear ──────────────────────────────────────────────────
// Fixed seeds per class so starting items are deterministic across reinstalls.
const CLASS_SEEDS: Record<string, number> = {
  warrior:  0xca1101,
  rogue:    0xca1102,
  sorcerer: 0xca1103,
}

/**
 * Generate class-appropriate starting items for the first run.
 * Returns a weapon + 2 potions tailored to each class identity.
 */
export function generateStartingItems(classId: string): Item[] {
  const rng   = makeRng(CLASS_SEEDS[classId] ?? 0xca1100)
  const items: Item[] = []

  if (classId === 'warrior') {
    items.push(generateItem(rng, { floor: 1, forceQuality: 'magic', forceBaseId: 'short_sword' }))
    items.push(generateHpPotion(1))
    items.push(generateHpPotion(1))
  } else if (classId === 'rogue') {
    items.push(generateItem(rng, { floor: 1, forceQuality: 'magic', forceBaseId: 'dagger' }))
    items.push(generateHpPotion(1))
    items.push(generateHpPotion(1))
  } else if (classId === 'sorcerer') {
    items.push(generateItem(rng, { floor: 1, forceQuality: 'magic', forceBaseId: 'short_sword' }))
    items.push(generateHpPotion(1))
    items.push(generateManaPotion(1))
    items.push(generateManaPotion(1))
  }

  return items
}

// ─── Cube Transmute ────────────────────────────────────────────────────────

export interface TransmuteResult {
  success: boolean
  item: Item | null
  message: string
}

/**
 * Execute a cube recipe given the input items.
 * Returns the crafted item (or null on failure).
 */
export function transmute(rng: Rng, recipeId: string, inputs: Item[], floor: number): TransmuteResult {
  const recipe = getRecipeById(recipeId)
  if (!recipe) return { success: false, item: null, message: 'Unknown recipe.' }

  switch (recipeId) {
    case 'recipe_normal_to_magic': {
      const base = inputs[0]
      const item = generateItem(rng, { floor, forceQuality: 'magic', slot: base.slot })
      return { success: true, item, message: `Imbued: ${item.displayName}` }
    }
    case 'recipe_magic_to_rare': {
      const item = generateItem(rng, { floor, forceQuality: 'rare' })
      return { success: true, item, message: `Reforged: ${item.displayName}` }
    }
    case 'recipe_rune_upgrade': {
      // All 3 inputs are the same rune — produce the next rune in tier order
      const RUNE_ORDER = [
        'rune_el', 'rune_eld', 'rune_tir', 'rune_nef', 'rune_eth',
        'rune_ith', 'rune_tal', 'rune_ral', 'rune_ort', 'rune_sol',
        'rune_lum', 'rune_shael', 'rune_thul', 'rune_amn', 'rune_dol',
      ]
      const inputRuneId = inputs[0]?.baseId
      const idx = RUNE_ORDER.indexOf(inputRuneId)
      const nextRuneId = idx >= 0 && idx < RUNE_ORDER.length - 1 ? RUNE_ORDER[idx + 1] : null
      if (!nextRuneId) return { success: false, item: null, message: 'No higher rune exists.' }
      const nextBase = BASE_ITEMS.find(b => b.id === nextRuneId)
      if (!nextBase) return { success: false, item: null, message: 'Rune data missing.' }
      const item: Item = {
        uid: nextUid(), baseId: nextBase.id, baseName: nextBase.name,
        slot: 'rune', size: [1, 1], quality: 'normal',
        sockets: 0, insertedRunes: [], runewordId: null,
        affixes: [], baseStats: {}, effectiveStats: {},
        displayName: nextBase.name, identified: true,
      }
      return { success: true, item, message: `Fused: ${item.displayName}` }
    }
    case 'recipe_identify_rare': {
      const rareInput = inputs.find(i => i.quality === 'rare')
      if (!rareInput) return { success: false, item: null, message: 'No rare item found.' }
      const item = generateItem(rng, { floor: floor + 2, forceQuality: 'rare', slot: rareInput.slot })
      return { success: true, item, message: `Empowered: ${item.displayName}` }
    }
    case 'recipe_potion_upgrade': {
      const item = generateManaPotion(floor)
      return { success: true, item, message: 'Concentrated into Mana Vial' }
    }
    case 'recipe_rare_to_unique': {
      const rareInput = inputs.find(i => i.quality === 'rare')
      if (!rareInput) return { success: false, item: null, message: 'No rare item found.' }
      if (rng() < 0.30) {
        const item = generateItem(rng, { floor, forceQuality: 'unique', slot: rareInput.slot })
        return { success: true, item, message: `Soul Forged: ${item.displayName}` }
      }
      return { success: false, item: null, message: 'The soul refused to bind. (30% chance — try again)' }
    }
    case 'recipe_floor_push': {
      const magicInput = inputs.find(i => i.quality === 'magic')
      if (!magicInput) return { success: false, item: null, message: 'No magic item found.' }
      const item = generateItem(rng, { floor: floor + 3, forceQuality: 'magic', slot: magicInput.slot })
      return { success: true, item, message: `Infused: ${item.displayName}` }
    }
    case 'recipe_gem_upgrade': {
      const gemInput = inputs[0]
      const nextTierId = gemNextTier(gemInput.baseId)
      if (!nextTierId) return { success: false, item: null, message: 'Already at perfect tier.' }
      const allGems = BASE_ITEMS.filter(i => i.slot === 'gem')
      const base = allGems.find(i => i.id === nextTierId)
      const displayName = base?.name ?? nextTierId
      const item: Item = {
        uid: nextUid(),
        baseId: nextTierId,
        baseName: displayName,
        slot: 'gem',
        size: [1, 1],
        quality: 'normal',
        sockets: 0,
        insertedRunes: [],
        runewordId: null,
        affixes: [],
        baseStats: {},
        effectiveStats: {},
        displayName,
        identified: true,
      }
      return { success: true, item, message: `Polished: ${displayName}` }
    }
    default:
      return { success: false, item: null, message: 'Recipe not implemented.' }
  }
}

/** Roll loot from an encounter. Returns array of items (0–N). */
export function rollLoot(rng: Rng, encounterType: string, floor: number, magicFind = 0, noPotions = false): Item[] {
  const drops: Item[] = []

  const dropTable: Record<string, {
    items: [number, number]
    runeChance: number
    gemChance: number
    manaPotionChance: number
    forceQuality?: ItemQuality
  }> = {
    normal:  { items: [0, 1], runeChance: 0.03, gemChance: 0.02, manaPotionChance: 0.20 },
    elite:   { items: [1, 2], runeChance: 0.07, gemChance: 0.04, manaPotionChance: 0.35 },
    rare:    { items: [1, 2], runeChance: 0.12, gemChance: 0.07, manaPotionChance: 0.50, forceQuality: 'rare' },
    chest:   { items: [1, 3], runeChance: 0.18, gemChance: 0.12, manaPotionChance: 0.80 },
    ancient: { items: [2, 3], runeChance: 0.22, gemChance: 0.15, manaPotionChance: 0.70, forceQuality: 'unique' },
    // Boss: guaranteed rare + 30% unique chance + 3-5 drops + 2 runes
    boss:    { items: [3, 5], runeChance: 0.40, gemChance: 0.25, manaPotionChance: 0.90, forceQuality: 'rare' },
  }

  const table = dropTable[encounterType]
  if (!table) return drops

  const count = roll(rng, table.items[0], table.items[1])
  for (let i = 0; i < count; i++) {
    const forceQuality = i === 0 ? table.forceQuality : undefined
    drops.push(generateItem(rng, { floor, magicFind, forceQuality }))
  }
  // Boss: 30% chance for a bonus unique item on top
  if (encounterType === 'boss' && rng() < 0.30) {
    drops.push(generateItem(rng, { floor, magicFind, forceQuality: 'unique' }))
  }

  // Chest: guaranteed HP potion so there's always something tangible
  if (encounterType === 'chest' && !noPotions) {
    drops.push(generateHpPotion(floor))
  }

  // Rune drop chance
  if (rng() < table.runeChance) {
    drops.push(generateRune(rng, floor))
  }

  // Gem drop chance
  if (rng() < table.gemChance) {
    drops.push(generateGem(rng, floor))
  }

  // Mana potion drop chance — consumable, goes into bag
  if (!noPotions && rng() < table.manaPotionChance) {
    drops.push(generateManaPotion(floor))
  }

  // Stamina potion drop chance — elites/rares/boss have a small chance
  const staminaPotChance = encounterType === 'boss' ? 0.30 : encounterType === 'ancient' ? 0.25 : encounterType === 'rare' ? 0.15 : encounterType === 'elite' ? 0.08 : 0
  if (!noPotions && staminaPotChance > 0 && rng() < staminaPotChance) {
    drops.push(generateStaminaPotion(floor))
  }

  return drops
}
