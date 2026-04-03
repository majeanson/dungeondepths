/**
 * Codex data — static content for the in-game Field Guide (CodexScreen).
 * All arrays and records live here so CodexScreen stays pure presentation.
 */

import { BASE_WEIGHTS } from '../engine/encounter'
import { xpForLevel } from '../engine/stats'
import { COLORS } from '../theme'

// ── Encounter ─────────────────────────────────────────────────────────────────

export interface EncInfo {
  key:         keyof typeof BASE_WEIGHTS
  name:        string
  glyph:       string
  glyphColor:  string
  tileColor:   string
  description: string
  reward:      string
  hpNote?:     string
  affixNote?:  string
  floorNote?:  string
}

export const ENCOUNTERS: EncInfo[] = [
  {
    key: 'normal', name: 'Normal', glyph: '·',  glyphColor: COLORS.textDim,           tileColor: COLORS.tile.floor,
    description: 'Standard enemy. Moderate HP and damage.',
    reward: 'Normal, Magic, or Rare drop (0–1 item)',
  },
  {
    key: 'elite', name: 'Elite',  glyph: '⚔', glyphColor: COLORS.encounter.elite,   tileColor: COLORS.blueDim,
    description: '1.5× HP, 1.25× damage. Rolls 1–2 monster affixes.',
    reward: '1–2 items, at least one Magic quality',
    floorNote: 'Rare on early floors — common by mid-run',
  },
  {
    key: 'rare', name: 'Rare',   glyph: '✦', glyphColor: COLORS.encounter.rare,    tileColor: COLORS.tile.rare,
    description: '3× HP, 1.5× damage. 2–3 monster affixes. A real fight.',
    reward: '1–2 items, guaranteed Rare quality first drop',
    floorNote: 'Low weight on early floors — increases each floor',
  },
  {
    key: 'ancient', name: 'Ancient', glyph: '◈', glyphColor: COLORS.encounter.ancient, tileColor: COLORS.tile.boss,
    description: '5× HP, 2× damage. 3 monster affixes. Boss-tier threat.',
    reward: '2–3 items, guaranteed Unique first drop',
    floorNote: 'Very low weight early — becomes meaningful after floor 5',
  },
  {
    key: 'chest', name: 'Chest',  glyph: '◆', glyphColor: COLORS.encounter.chest,   tileColor: COLORS.tile.chest,
    description: 'No combat — opens directly to loot screen.',
    reward: '1–3 items, quality scales with floor',
  },
  {
    key: 'shrine', name: 'Shrine', glyph: '✺', glyphColor: COLORS.encounter.shrine,  tileColor: COLORS.tile.shrine,
    description: 'Mystical altar — instant free restoration.',
    reward: 'Scaled HP + MP + Stamina (increases with floor and tier)',
  },
]

const TOTAL_W = Object.values(BASE_WEIGHTS).reduce((a, b) => a + b, 0)
export function encPct(key: keyof typeof BASE_WEIGHTS): string {
  return ((BASE_WEIGHTS[key] / TOTAL_W) * 100).toFixed(1)
}

// ── Monster affixes ────────────────────────────────────────────────────────────

export const AFFIX_DETAILS: Record<string, { combat: string; counter: string }> = {
  extraStrong:        { combat: 'Doubles monster physical damage.',         counter: 'Use Battle Cry first round or open with Potion.' },
  extraFast:          { combat: '+50% monster speed → higher hit rate and first-turn advantage.', counter: 'Stack Dexterity gear to maintain hit chance.' },
  fireEnchanted:      { combat: '+40% base damage as fire on every hit.',   counter: 'Equip fire resist. 75% cap negates most of it.' },
  coldEnchanted:      { combat: '+40% base damage as cold on every hit.',   counter: 'Cold resist. Note: Chilled applies TO enemy, not you.' },
  lightningEnchanted: { combat: '+35% base damage as lightning on every hit.', counter: 'Lightning resist is the fastest way to reduce this.' },
  cursed:             { combat: 'Halves your effective defense for the entire fight.',  counter: 'Pop a defense buff (Iron Skin) before engaging, or burst it down fast.' },
  teleporting:        { combat: 'Cannot be cornered — may reset position.', counter: 'Irrelevant in combat; affects grid movement only.' },
  ancient:            { combat: '5× HP, guaranteed Unique drop.',            counter: 'Stock potions before engaging. Use Power Strike / Whirlwind to burst.' },
  aura:               { combat: 'Floor-wide: all monsters on this floor gain +20% HP and damage.', counter: 'Treat every encounter on the floor as slightly stronger than normal.' },
}

// ── Item tiers ─────────────────────────────────────────────────────────────────

export interface ItemTierInfo {
  name:        string
  color:       string
  affixes:     string
  description: string
  hook:        string
  identify:    string
}

export const ITEM_TIERS: ItemTierInfo[] = [
  {
    name: 'Normal', color: '#cccccc',
    affixes: '0 affixes',
    description: 'Base stats only. The only quality that can have sockets (1–6).',
    hook: 'Key runeword ingredient — a 3-socket Normal sword is worth holding forever.',
    identify: 'Identified at pickup.',
  },
  {
    name: 'Magic', color: '#5599ff',
    affixes: '1–2 affixes (prefix and/or suffix — at least 1)',
    description: 'Light random enhancement. Common from floor 2 onward.',
    hook: 'Consistent minor bonuses. Good early filler for empty slots.',
    identify: 'Appears as "Unidentified [slot]" on loot screen. Identified on pickup.',
  },
  {
    name: 'Rare', color: '#ffdd44',
    affixes: '4–6 affixes (2–3 prefix + 2–3 suffix)',
    description: 'Powerful but random. Can beat Uniques if the right affixes roll.',
    hook: 'Best-in-slot is more often a Rare than a Unique at any given tier.',
    identify: 'Appears unidentified. Identified on pickup.',
  },
  {
    name: 'Unique', color: '#c8a020',
    affixes: 'Fixed stats — same item every drop',
    description: 'Named items with a defined stat package. Predictable power.',
    hook: 'Guaranteed from Ancient monsters. Min-floor requirement per item.',
    identify: 'Appears unidentified. Identified on pickup.',
  },
  {
    name: 'Runeword', color: '#ff8c00',
    affixes: 'Stats from rune sequence (replaces all other stats)',
    description: 'Normal base + correct runes socketed in exact order → named bonus set.',
    hook: 'A good runeword beats almost everything. White item hunting is the endgame meta.',
    identify: 'Always fully identified once completed.',
  },
]

// ── Skill detail annotations ───────────────────────────────────────────────────

export const SKILL_DETAIL: Record<string, { effect: string; detail: string; tip: string }> = {
  power_strike: {
    effect: '2× physical damage this round.',
    detail: 'Crits still apply on top of the ×2 multiplier (so a crit Power Strike is 3.5× base damage). Monster retaliates normally.',
    tip: 'Use to finish a low-HP enemy or burst a tank you cannot outlast.',
  },
  battle_cry: {
    effect: 'Take 35% less physical damage for 2 rounds (including cast round).',
    detail: 'Activates immediately — the monster\'s retaliation on the cast round already benefits from the reduction. Stacks with block chance. Lasts 2 rounds then expires.',
    tip: 'Open with Battle Cry against Extra Strong or Ancient monsters to absorb the burst.',
  },
  iron_skin: {
    effect: '+30 defense for 2 rounds. Monster retaliates.',
    detail: 'Applies on the cast round immediately. No mana cost — always available once unlocked. Defense bonus is flat, stacks with gear defense. 3-round cooldown after use.',
    tip: 'Best used proactively vs. Elite/Ancient encounters. Combine with Battle Cry for near-impenetrable rounds.',
  },
  whirlwind: {
    effect: 'Attack twice in one round — both rolls are independent.',
    detail: 'Each hit independently rolls damage, crit, and hit chance. Elemental damage only applies on the first hit. Monster retaliates once after both hits.',
    tip: 'Best DPS skill when mana allows. Against a near-dead enemy it guarantees the kill.',
  },
  backstab: {
    effect: 'Guaranteed critical hit at 3× crit multiplier.',
    detail: 'Bypasses the normal crit roll — always a critical hit. The 3× multiplier replaces the normal 1.5× crit. Rogue\'s +10% crit bonus is irrelevant here since it\'s always guaranteed.',
    tip: 'Best opener vs. high-HP elites. Pairs well with Shadow Step — step to avoid retaliation, then backstab for burst.',
  },
  shadow_step: {
    effect: 'Monster cannot retaliate this round.',
    detail: 'You still attack (or deal 0 damage if you choose). The monster\'s retaliation is skipped entirely — not a miss, a skip. Elemental and physical damage both apply normally.',
    tip: 'Use on rounds when you know the monster will one-shot you, or to safely use potions while dealing damage.',
  },
  rapid_strike: {
    effect: '3 hits at 70% damage each = 2.1× effective damage with no crit variance.',
    detail: 'Each strike rolls hit/miss independently. Against high-defense enemies, all 3 may miss. Elemental damage applies on the first hit only. Expected DPS is higher than a normal attack.',
    tip: 'Ideal mid-game damage skill. Less swingy than Power Strike — good when crit chance is low.',
  },
  smoke_bomb: {
    effect: 'Monster hit chance −50% for 2 rounds (including cast round). No attack.',
    detail: 'Does not deal damage — the round is spent setting the bomb. Monster misses roughly every other hit for the next 2 rounds. No mana cost. 3-round cooldown after use.',
    tip: 'Use when low HP to buy 2 semi-safe rounds. Stack with evasion gear for near-untouchable turns.',
  },
  fireball: {
    effect: '3× spell power as fire damage. Bypasses hit check.',
    detail: 'Pure spell — no physical damage roll. Spell power = Floor × 8 + Level × 1 (+ gear). At floor 5, level 1: 41 SP → 123 fire damage. At floor 10: 80 SP → 240 fire damage. Fire also inflicts Burning (−15% monster physical attack this round).',
    tip: 'Bread-and-butter Sorcerer damage skill. Scales strongly with floor depth. Burning is a free defensive bonus every cast.',
  },
  meditate: {
    effect: 'Skip attack — regen +30 mana per turn for 3 turns (90 mana total). Monster still attacks each round.',
    detail: 'Zero mana cost — always available once unlocked. No HP heal — mana only. Monster hits you all 3 rounds. Best used to top off mana between skill uses.',
    tip: 'Stack with Iron Skin or Mana Shield to survive the 3 undefended rounds. Avoid vs high-damage monsters without a damage buffer active.',
  },
  ice_blast: {
    effect: '2.5× spell power as cold damage. Applies deep freeze (monster hit chance −50%).',
    detail: 'Applies Frozen status, which halves the monster\'s hit chance on their retaliation this round. Stronger freeze than normal cold — full 50% vs. the usual 20% chill.',
    tip: 'Best defensive Sorcerer spell. Use when you need to both damage and protect in one action.',
  },
  chain_lightning: {
    effect: '2× spell power as lightning damage. No hit check, no status effect.',
    detail: 'Pure spell damage — bypasses hit roll. Ignores player lightning resist on the monster, except Lightning Enchanted monsters still halve it (50% resist). No status effect — raw single-target DPS.',
    tip: 'Late-game primary damage spell. At floor 10+, 80 SP × 2 = 160 lightning damage per cast beats Fireball on non-fire-enchanted targets.',
  },
  mana_shield: {
    effect: 'Absorb 50% of incoming damage as mana for 2 rounds (including cast round).',
    detail: 'When damage would reduce HP, 50% is unconditionally redirected to mana drain — no mana balance check. If mana drops to 0, it just bottoms out; the shield still absorbs its half.',
    tip: 'Use proactively before taking a big hit. Synergizes with Chain Lightning (high mana usage means you keep absorbing).',
  },
}

// ── Progression tables ─────────────────────────────────────────────────────────

export const XP_ROWS = Array.from({ length: 12 }, (_, i) => i + 1).map(lvl => ({
  lvl,
  totalXp: xpForLevel(lvl),
  needed:  xpForLevel(lvl) - xpForLevel(lvl - 1),
  hpBonus: lvl * 5,
}))

export const TIER_ROWS = [1, 2, 3, 4, 5, 8, 10].map(t => ({
  tier:    t,
  hp:      (1 + Math.min(t - 1, 10) * 0.40).toFixed(1),
  dmg:     (1 + Math.min(t - 1, 10) * 0.28).toFixed(2),
  mfBonus: (t - 1) * 20,
}))
