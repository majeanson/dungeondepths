/**
 * Shared display helpers for items — quality colors, slot icons, stat summaries.
 * Single source of truth used by all screens and components.
 */

import { COLORS } from '../theme'
import type { Item, ItemQuality } from '../engine/loot'
import type { ItemSlot } from '../data/items'
import type { EquipSlot } from '../engine/inventory'

// ── Quality text colors (sourced from theme) ──────────────────────────────────
export const QUALITY_COLOR: Record<ItemQuality, string> = {
  normal: COLORS.quality.normal,
  magic:  COLORS.quality.magic,
  rare:   COLORS.quality.rare,
  unique: COLORS.quality.unique,
}

// ── Quality dark background tints — grimdark ──────────────────────────────────
export const QUALITY_BG: Record<ItemQuality, string> = {
  normal: '#0a0907',   // near void, very slightly warm
  magic:  '#06080e',   // deep navy darkness
  rare:   '#0d0a01',   // buried gold — nearly black
  unique: '#0e0701',   // ember deep
}

// ── Quality border glow colors — grimdark ─────────────────────────────────────
export const QUALITY_BORDER: Record<ItemQuality, string> = {
  normal: '#3a2e28',   // bone ash
  magic:  '#2a4a8a',   // arcane blue
  rare:   '#8a6a0c',   // tarnished gold
  unique: '#8a4210',   // burnt ember
}

/**
 * Primary display color for an item — respects runeword orange override.
 * Use for item name text and quality badges.
 */
export function getItemColor(item: Item): string {
  if (item.runewordId) return COLORS.runewordColor
  return QUALITY_COLOR[item.quality] ?? COLORS.textSecondary
}

/**
 * Border color for an item card or cell — respects runeword orange override.
 */
export function getItemBorderColor(item: Item): string {
  if (item.runewordId) return COLORS.runewordColor
  return QUALITY_BORDER[item.quality] ?? COLORS.border2
}

// ── Slot emoji glyphs ─────────────────────────────────────────────────────────
export const SLOT_ICON: Record<ItemSlot, string> = {
  weapon:  '⚔',
  offhand: '🛡',
  helmet:  '⛑',
  chest:   '🥼',
  gloves:  '🧤',
  legs:    '👖',
  boots:   '👟',
  ring:    '◉',
  amulet:  '◈',
  charm:   '✦',
  rune:    '◆',
  gem:     '◈',
  potion:  '⬡',
  belt:    '▭',
  circlet: '◯',
}

// ── Item slot → equip slot mapping ───────────────────────────────────────────
const SLOT_TO_EQUIP: Partial<Record<ItemSlot, EquipSlot>> = {
  weapon: 'weapon', offhand: 'offhand', helmet: 'helmet', chest: 'chest',
  gloves: 'gloves', legs: 'legs', boots: 'boots', amulet: 'amulet',
  belt: 'belt', circlet: 'circlet',
}

/** Returns the EquipSlot for an item, or null if not equippable. */
export function itemEquipSlot(item: Item): EquipSlot | null {
  if (item.slot === 'ring') return 'ring1'
  return SLOT_TO_EQUIP[item.slot as ItemSlot] ?? null
}

// ── Compact stat summary (up to 3 key stats) ─────────────────────────────────
export function itemSummary(item: Item): string {
  const s = item.effectiveStats
  const parts: string[] = []
  if (s.damage)          parts.push(`+${s.damage} dmg`)
  if (s.defense)         parts.push(`+${s.defense} def`)
  if (s.life)            parts.push(`+${s.life} hp`)
  if (s.critChance)      parts.push(`+${s.critChance}% crit`)
  if (s.magicFind)       parts.push(`+${s.magicFind}% mf`)
  if (s.fireDamage)      parts.push(`+${s.fireDamage} fire`)
  if (s.coldDamage)      parts.push(`+${s.coldDamage} cold`)
  if (s.lightningDamage) parts.push(`+${s.lightningDamage} ltng`)
  if (s.spellPower)      parts.push(`+${s.spellPower} sp`)
  if (item.sockets > 0)  parts.push(`[${item.sockets}]`)
  return parts.slice(0, 3).join('  ') || item.slot
}
