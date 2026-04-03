/**
 * Base item definitions.
 * Slot, physical inventory size, socket range, base stat range.
 * Tech-agnostic — no React, no UI.
 */

export type ItemSlot = 'weapon' | 'offhand' | 'helmet' | 'chest' | 'gloves' | 'legs' | 'boots' | 'ring' | 'amulet' | 'charm' | 'rune' | 'gem' | 'potion' | 'belt' | 'circlet'

export type ItemSize = [width: number, height: number]

export interface BaseItemDef {
  id: string
  name: string
  slot: ItemSlot
  size: ItemSize
  /** [min, max] sockets this base can roll. 0 = no sockets. */
  socketRange: [number, number]
  /** Minimum floor depth this item starts appearing. */
  minFloor: number
  /** Base stat ranges: key → [min, max] */
  baseStats: Record<string, [number, number]>
}

export const BASE_ITEMS: BaseItemDef[] = [
  // ── Weapons ────────────────────────────────────────────────────
  { id: 'dagger',       name: 'Dagger',        slot: 'weapon', size: [1, 2], socketRange: [0, 2], minFloor: 1,  baseStats: { damage: [3, 8] } },
  { id: 'short_sword',  name: 'Short Sword',   slot: 'weapon', size: [1, 3], socketRange: [0, 3], minFloor: 1,  baseStats: { damage: [5, 12] } },
  { id: 'long_sword',   name: 'Long Sword',    slot: 'weapon', size: [1, 3], socketRange: [0, 4], minFloor: 3,  baseStats: { damage: [8, 18] } },
  { id: 'broad_sword',  name: 'Broad Sword',   slot: 'weapon', size: [2, 3], socketRange: [0, 4], minFloor: 5,  baseStats: { damage: [12, 24] } },
  { id: 'war_sword',    name: 'War Sword',     slot: 'weapon', size: [2, 3], socketRange: [0, 5], minFloor: 8,  baseStats: { damage: [18, 32] } },
  { id: 'great_sword',  name: 'Great Sword',   slot: 'weapon', size: [2, 4], socketRange: [0, 6], minFloor: 12, baseStats: { damage: [25, 45] } },
  { id: 'two_handed_sword', name: 'Two-Handed Sword', slot: 'weapon', size: [2, 4], socketRange: [0, 5], minFloor: 7, baseStats: { damage: [20, 38] } },
  { id: 'battle_axe',  name: 'Battle Axe',    slot: 'weapon', size: [2, 3], socketRange: [0, 4], minFloor: 6,  baseStats: { damage: [16, 30] } },
  { id: 'war_axe',     name: 'War Axe',       slot: 'weapon', size: [2, 3], socketRange: [0, 5], minFloor: 10, baseStats: { damage: [22, 40] } },
  { id: 'hand_axe',    name: 'Hand Axe',      slot: 'weapon', size: [1, 3], socketRange: [0, 3], minFloor: 2,  baseStats: { damage: [6, 14] } },
  { id: 'short_bow',   name: 'Short Bow',     slot: 'weapon', size: [2, 3], socketRange: [0, 3], minFloor: 3,  baseStats: { damage: [7, 15], dexterity: [2, 5] } },
  { id: 'long_bow',    name: 'Long Bow',      slot: 'weapon', size: [2, 4], socketRange: [0, 4], minFloor: 7,  baseStats: { damage: [12, 25], dexterity: [4, 8] } },
  { id: 'throwing_knife', name: 'Throwing Knife', slot: 'weapon', size: [1, 2], socketRange: [0, 2], minFloor: 4, baseStats: { damage: [8, 16], critChance: [2, 5] } },
  { id: 'wand',         name: 'Wand',          slot: 'weapon', size: [1, 2], socketRange: [0, 2], minFloor: 2,  baseStats: { damage: [4, 10], spellPower: [1, 5] } },
  { id: 'staff',        name: 'Staff',         slot: 'weapon', size: [2, 3], socketRange: [0, 3], minFloor: 4,  baseStats: { damage: [8, 16], spellPower: [3, 10] } },
  // ── Off-hand ───────────────────────────────────────────────────
  { id: 'buckler',      name: 'Buckler',       slot: 'offhand', size: [2, 2], socketRange: [0, 2], minFloor: 1,  baseStats: { defense: [4, 10], blockChance: [5, 12] } },
  { id: 'heater_shield',name: 'Heater Shield', slot: 'offhand', size: [2, 3], socketRange: [0, 4], minFloor: 4,  baseStats: { defense: [10, 22], blockChance: [10, 20] } },
  { id: 'tower_shield', name: 'Tower Shield',  slot: 'offhand', size: [2, 3], socketRange: [0, 4], minFloor: 8,  baseStats: { defense: [18, 35], blockChance: [15, 28] } },
  // ── Helmets ────────────────────────────────────────────────────
  { id: 'cap',          name: 'Cap',           slot: 'helmet', size: [2, 2], socketRange: [0, 2], minFloor: 1,  baseStats: { defense: [2, 6] } },
  { id: 'iron_helm',    name: 'Iron Helm',     slot: 'helmet', size: [2, 2], socketRange: [0, 3], minFloor: 3,  baseStats: { defense: [6, 14] } },
  { id: 'war_helm',     name: 'War Helm',      slot: 'helmet', size: [2, 2], socketRange: [0, 4], minFloor: 8,  baseStats: { defense: [14, 28] } },
  // ── Chest ──────────────────────────────────────────────────────
  { id: 'ragged_armor', name: 'Ragged Armor',  slot: 'chest',  size: [2, 3], socketRange: [0, 3], minFloor: 1,  baseStats: { defense: [6, 14] } },
  { id: 'chain_mail',   name: 'Chain Mail',    slot: 'chest',  size: [2, 3], socketRange: [0, 4], minFloor: 4,  baseStats: { defense: [16, 28] } },
  { id: 'plate_armor',  name: 'Plate Armor',   slot: 'chest',  size: [2, 3], socketRange: [0, 6], minFloor: 10, baseStats: { defense: [30, 50] } },
  // ── Gloves ─────────────────────────────────────────────────────
  { id: 'leather_gloves',name: 'Leather Gloves',slot: 'gloves', size: [2, 2], socketRange: [0, 2], minFloor: 1, baseStats: { defense: [2, 5] } },
  { id: 'gauntlets',    name: 'Gauntlets',     slot: 'gloves', size: [2, 2], socketRange: [0, 3], minFloor: 5,  baseStats: { defense: [6, 12] } },
  // ── Legs ───────────────────────────────────────────────────────
  { id: 'leather_pants',name: 'Leather Pants', slot: 'legs',   size: [2, 3], socketRange: [0, 2], minFloor: 1,  baseStats: { defense: [3, 8] } },
  { id: 'chain_legs',   name: 'Chain Legs',    slot: 'legs',   size: [2, 3], socketRange: [0, 4], minFloor: 5,  baseStats: { defense: [10, 22] } },
  // ── Boots ──────────────────────────────────────────────────────
  { id: 'leather_boots',name: 'Leather Boots', slot: 'boots',  size: [2, 2], socketRange: [0, 2], minFloor: 1,  baseStats: { defense: [2, 6], moveSpeed: [3, 8] } },
  { id: 'war_boots',    name: 'War Boots',     slot: 'boots',  size: [2, 2], socketRange: [0, 3], minFloor: 6,  baseStats: { defense: [8, 16], moveSpeed: [5, 12] } },
  // ── Belt (2×2 utility slot) ───────────────────────────────────────
  { id: 'sash',         name: 'Sash',          slot: 'belt',   size: [2, 2], socketRange: [0, 0], minFloor: 1,  baseStats: { defense: [2, 5] } },
  { id: 'leather_belt', name: 'Leather Belt',  slot: 'belt',   size: [2, 2], socketRange: [0, 2], minFloor: 3,  baseStats: { defense: [5, 10], life: [5, 15] } },
  { id: 'war_belt',     name: 'War Belt',      slot: 'belt',   size: [2, 2], socketRange: [0, 3], minFloor: 8,  baseStats: { defense: [12, 22], life: [10, 25] } },
  // ── Circlet (helmet variant, magic focus) ───────────────────────
  { id: 'circlet',      name: 'Circlet',       slot: 'circlet', size: [2, 2], socketRange: [0, 3], minFloor: 5, baseStats: { defense: [4, 10], mana: [5, 15] } },
  { id: 'coronet',      name: 'Coronet',       slot: 'circlet', size: [2, 2], socketRange: [0, 3], minFloor: 7, baseStats: { defense: [6, 14], mana: [8, 20], critChance: [1, 3] } },
  { id: 'tiara',        name: 'Tiara',         slot: 'circlet', size: [2, 2], socketRange: [0, 4], minFloor: 10, baseStats: { defense: [8, 18], mana: [10, 25], spellPower: [2, 6] } },
  // ── Rings & Amulets ────────────────────────────────────────────
  { id: 'ring',         name: 'Ring',          slot: 'ring',   size: [1, 1], socketRange: [0, 0], minFloor: 2,  baseStats: {} },
  { id: 'amulet',       name: 'Amulet',        slot: 'amulet', size: [1, 1], socketRange: [0, 0], minFloor: 3,  baseStats: {} },
  // ── Charms (passive bonuses while in inventory) ────────────────
  { id: 'small_charm',  name: 'Small Charm',   slot: 'charm',  size: [1, 1], socketRange: [0, 0], minFloor: 3,  baseStats: {} },
  { id: 'large_charm',  name: 'Large Charm',   slot: 'charm',  size: [1, 2], socketRange: [0, 0], minFloor: 6,  baseStats: {} },
  { id: 'grand_charm',  name: 'Grand Charm',   slot: 'charm',  size: [1, 3], socketRange: [0, 0], minFloor: 10, baseStats: {} },
  // ── Runes (1×1 — inserted into sockets) ───────────────────────
  // ── Consumables (1×1, go into bag, used in combat or inventory) ─────────────
  { id: 'hp_potion',      name: 'Health Potion',  slot: 'potion', size: [1, 1], socketRange: [0, 0], minFloor: 1, baseStats: {} },
  { id: 'mana_potion',   name: 'Mana Vial',      slot: 'potion', size: [1, 1], socketRange: [0, 0], minFloor: 1, baseStats: {} },
  { id: 'stamina_potion', name: 'Stamina Flask',  slot: 'potion', size: [1, 1], socketRange: [0, 0], minFloor: 1, baseStats: {} },
  // ── Runes (1×1 — inserted into sockets) ───────────────────────
  // ── Gems (1×1 — inserted into sockets; active regardless of runeword) ────────
  { id: 'gem_ruby_chipped',     name: 'Chipped Ruby',     slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 1,  baseStats: {} },
  { id: 'gem_ruby_flawed',      name: 'Flawed Ruby',      slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 6,  baseStats: {} },
  { id: 'gem_ruby_perfect',     name: 'Perfect Ruby',     slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 11, baseStats: {} },
  { id: 'gem_sapphire_chipped', name: 'Chipped Sapphire', slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 1,  baseStats: {} },
  { id: 'gem_sapphire_flawed',  name: 'Flawed Sapphire',  slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 6,  baseStats: {} },
  { id: 'gem_sapphire_perfect', name: 'Perfect Sapphire', slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 11, baseStats: {} },
  { id: 'gem_topaz_chipped',    name: 'Chipped Topaz',    slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 1,  baseStats: {} },
  { id: 'gem_topaz_flawed',     name: 'Flawed Topaz',     slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 6,  baseStats: {} },
  { id: 'gem_topaz_perfect',    name: 'Perfect Topaz',    slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 11, baseStats: {} },
  { id: 'gem_emerald_chipped',  name: 'Chipped Emerald',  slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 1,  baseStats: {} },
  { id: 'gem_emerald_flawed',   name: 'Flawed Emerald',   slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 6,  baseStats: {} },
  { id: 'gem_emerald_perfect',  name: 'Perfect Emerald',  slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 11, baseStats: {} },
  { id: 'gem_diamond_chipped',  name: 'Chipped Diamond',  slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 3,  baseStats: {} },
  { id: 'gem_diamond_flawed',   name: 'Flawed Diamond',   slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 7,  baseStats: {} },
  { id: 'gem_diamond_perfect',  name: 'Perfect Diamond',  slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 12, baseStats: {} },
  // ── Runes (1×1 — inserted into sockets) ───────────────────────
  { id: 'rune_el',  name: 'El Rune',   slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 2,  baseStats: {} },
  { id: 'rune_eld', name: 'Eld Rune',  slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 3,  baseStats: {} },
  { id: 'rune_tir', name: 'Tir Rune',  slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 4,  baseStats: {} },
  { id: 'rune_nef', name: 'Nef Rune',  slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 5,  baseStats: {} },
  { id: 'rune_eth', name: 'Eth Rune',  slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 6,  baseStats: {} },
  { id: 'rune_ith', name: 'Ith Rune',  slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 7,  baseStats: {} },
  { id: 'rune_tal', name: 'Tal Rune',  slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 8,  baseStats: {} },
  { id: 'rune_ral', name: 'Ral Rune',  slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 9,  baseStats: {} },
  { id: 'rune_ort', name: 'Ort Rune',  slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 9,  baseStats: {} },
  { id: 'rune_sol', name: 'Sol Rune',  slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 10, baseStats: {} },
  { id: 'rune_lum', name: 'Lum Rune',  slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 11, baseStats: {} },
  { id: 'rune_shael',name:'Shael Rune',slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 12, baseStats: {} },
  { id: 'rune_thul', name: 'Thul Rune', slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 13, baseStats: {} },
  { id: 'rune_amn', name: 'Amn Rune',  slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 13, baseStats: {} },
  { id: 'rune_dol', name: 'Dol Rune',  slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 14, baseStats: {} },
  // ── Deep runes (F15-F22) ───────────────────────────────────────────────────
  { id: 'rune_hel', name: 'Hel Rune',  slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 15, baseStats: {} },
  { id: 'rune_io',  name: 'Io Rune',   slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 16, baseStats: {} },
  { id: 'rune_ko',  name: 'Ko Rune',   slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 17, baseStats: {} },
  { id: 'rune_fal', name: 'Fal Rune',  slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 18, baseStats: {} },
  { id: 'rune_lem', name: 'Lem Rune',  slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 19, baseStats: {} },
  { id: 'rune_pul', name: 'Pul Rune',  slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 20, baseStats: {} },
  { id: 'rune_um',  name: 'Um Rune',   slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 21, baseStats: {} },
  { id: 'rune_mal', name: 'Mal Rune',  slot: 'rune', size: [1, 1], socketRange: [0, 0], minFloor: 22, baseStats: {} },
  // ── Radiant gems (F16+) — stronger than perfect, ~60% bonus increase ──────
  { id: 'gem_ruby_radiant',     name: 'Radiant Ruby',     slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 16, baseStats: {} },
  { id: 'gem_sapphire_radiant', name: 'Radiant Sapphire', slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 16, baseStats: {} },
  { id: 'gem_topaz_radiant',    name: 'Radiant Topaz',    slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 16, baseStats: {} },
  { id: 'gem_emerald_radiant',  name: 'Radiant Emerald',  slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 16, baseStats: {} },
  { id: 'gem_diamond_radiant',  name: 'Radiant Diamond',  slot: 'gem', size: [1, 1], socketRange: [0, 0], minFloor: 17, baseStats: {} },
]

// ── Deep base items (F15+) ─────────────────────────────────────────────────
// Appended separately for clarity — all have minFloor 15+
const DEEP_BASE_ITEMS: BaseItemDef[] = [
  // Weapons
  { id: 'runic_blade',    name: 'Runic Blade',    slot: 'weapon',  size: [2, 4], socketRange: [0, 6], minFloor: 15, baseStats: { damage: [30, 55] } },
  { id: 'void_staff',     name: 'Void Staff',      slot: 'weapon',  size: [2, 4], socketRange: [0, 4], minFloor: 15, baseStats: { damage: [18, 32], spellPower: [15, 28] } },
  { id: 'chaos_blade',    name: 'Chaos Blade',     slot: 'weapon',  size: [2, 4], socketRange: [0, 6], minFloor: 20, baseStats: { damage: [40, 70] } },
  // Armor
  { id: 'obsidian_plate', name: 'Obsidian Plate',  slot: 'chest',   size: [2, 3], socketRange: [0, 6], minFloor: 16, baseStats: { defense: [45, 75] } },
  { id: 'abyssal_shield', name: 'Abyssal Shield',  slot: 'offhand', size: [2, 3], socketRange: [0, 4], minFloor: 17, baseStats: { defense: [28, 50], blockChance: [20, 35] } },
  { id: 'dread_helm',     name: 'Dread Helm',      slot: 'helmet',  size: [2, 2], socketRange: [0, 4], minFloor: 15, baseStats: { defense: [20, 38] } },
  { id: 'void_circlet',   name: 'Void Circlet',    slot: 'circlet', size: [2, 2], socketRange: [0, 4], minFloor: 18, baseStats: { defense: [12, 24], mana: [20, 45], spellPower: [8, 16] } },
]

const ALL_BASE_ITEMS = [...BASE_ITEMS, ...DEEP_BASE_ITEMS]

export function getBaseItemsForFloor(floor: number): BaseItemDef[] {
  // Exclude gems/runes — they have dedicated drop mechanics in rollLoot
  return ALL_BASE_ITEMS.filter(i => i.minFloor <= floor && i.slot !== 'gem' && i.slot !== 'rune')
}

export function getBaseItemsBySlot(slot: ItemSlot): BaseItemDef[] {
  return ALL_BASE_ITEMS.filter(i => i.slot === slot)
}

export function getBaseItemById(id: string): BaseItemDef | undefined {
  return ALL_BASE_ITEMS.find(i => i.id === id)
}
