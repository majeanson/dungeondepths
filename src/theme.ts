/**
 * Design system tokens — colors, typography, spacing.
 * Grimdark aesthetic: near-pitch blacks, bone parchment, blood crimson,
 * oxidised gold, plague green, void purple. Morbid. Oppressive. Beautiful.
 */

export const COLORS = {
  // ── Backgrounds — almost lightless ───────────────────────────────────────
  bg:       '#040303',   // void black
  card:     '#070505',   // coffin wood
  surface:  '#0a0707',   // dungeon stone
  surface2: '#0f0b0a',   // torchlit shadow
  border:   '#1c1110',   // dried blood seam
  border2:  '#2a1a18',   // rusted iron

  // ── Text — bone and ash ───────────────────────────────────────────────────
  textPrimary:   '#c8b89a',   // aged parchment       (~11:1 on bg)
  textSecondary: '#908070',   // faded ink            (~5.5:1 on bg)
  textDim:       '#7a6a5a',   // grave dust           (~4:1 on bg)
  textGhost:     '#180f0d',   // shadow whisper — intentionally invisible (locked/decorative)

  // ── Accent ────────────────────────────────────────────────────────────────
  gold:          '#c49a1c',   // tarnished gold
  goldDim:       '#3d2c00',   // buried treasure
  red:           '#c02a2a',   // fresh blood
  redDim:        '#3d0c0c',   // dried gore
  green:         '#3a7a38',   // plague green
  greenDim:      '#0a1808',   // rot
  blue:          '#3a5aaa',   // arcane deep
  blueDim:       '#080a22',   // void depth
  purple:        '#7a3a9a',   // necrotic
  runewordColor: '#c05a10',   // burning rune

  // ── Glow tokens — for animated shadows and auras ─────────────────────────
  glow: {
    blood:  '#c0202055',   // blood aura (55 = ~33% alpha)
    rune:   '#c49a1c66',   // rune gold glow
    void:   '#7a3a9a44',   // necrotic aura
    frost:  '#3a5aaa44',   // arcane shimmer
    bone:   '#c8b89a33',   // pale death glow
    boss:   '#ff000044',   // boss pulse
    exit:   '#1a5a1a66',   // escape light
  },

  // ── Item quality ──────────────────────────────────────────────────────────
  quality: {
    normal: '#6b5a4a',   // bone gray
    magic:  '#3a5aaa',   // arcane blue
    rare:   '#c49a1c',   // tarnished gold
    unique: '#c05a10',   // burning amber
  },

  // ── Class colors ─────────────────────────────────────────────────────────
  class: {
    warrior:  '#c0302a',   // blood warrior
    rogue:    '#3a7a38',   // plague rogue
    sorcerer: '#3a5aaa',   // void sorcerer
  },

  // ── Encounter type colors ─────────────────────────────────────────────────
  encounter: {
    normal:  '#4a3a32',   // grave dirt
    elite:   '#2a4a8a',   // midnight blue
    rare:    '#8a7010',   // old gold
    ancient: '#8a3a18',   // rust and flame
    boss:    '#cc1a1a',   // screaming red
    chest:   '#2a7a3a',   // forest chest
    shrine:  '#5a2a7a',   // void altar
  },

  // ── HP / Mana / Stamina / XP bars ─────────────────────────────────────────
  hpHigh:        '#2a8a3a',   // sickly life green
  hpMid:         '#aa5a10',   // wound amber
  hpLow:         '#cc1a1a',   // death red (flashing)
  manaBar:       '#2a4a9a',   // deep arcane
  staminaBar:    '#2a5a7a',   // iron stamina
  xpBar:         '#8a6a10',   // soul gold
  monsterHpHigh: '#8a2020',   // monster blood high
  monsterHpMid:  '#8a4a10',   // monster wound
  monsterHpLow:  '#aa7010',   // dying monster

  // ── Tile types ────────────────────────────────────────────────────────────
  tile: {
    floor:    '#362819',   // warm unvisited stone — clearly navigable
    wall:     '#111009',   // solid dark stone — distinct from fog
    boss:     '#2a0606',   // blood chamber
    rare:     '#2a2306',   // old gold shimmer
    chest:    '#082010',   // forest chest
    exit:     '#1e1a06',   // stairway torchglow — amber, distinct from chest green
    shrine:   '#160820',   // void altar
    explored: '#1e1612',   // memory of light — visited rooms, clearly dimmer than unvisited
    fog:      '#000000',   // absolute dark — pitch black, undiscovered
  },
} as const

export const FONT = {
  xs:   9,
  sm:   11,
  md:   13,
  lg:   16,
  xl:   20,
  xxl:  26,
  hero: 44,
} as const

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
} as const

/** Returns the appropriate HP bar color for a given HP percentage (0–1). */
export function getHpColor(pct: number): string {
  if (pct > 0.5) return COLORS.hpHigh
  if (pct > 0.25) return COLORS.hpMid
  return COLORS.hpLow
}

/** Returns the appropriate monster HP bar color for a given HP percentage (0–1). */
export function getMonsterHpColor(pct: number): string {
  if (pct > 0.5) return COLORS.monsterHpHigh
  if (pct > 0.25) return COLORS.monsterHpMid
  return COLORS.monsterHpLow
}

export type LogEntryType =
  | 'crit'
  | 'levelUp'
  | 'victory'
  | 'defeat'
  | 'xp'
  | 'scroll'
  | 'heal'
  | 'enraged'
  | 'immune'
  | 'dealt'
  | 'received'
  | 'poison'
  | 'default'

export interface LogEntry {
  text: string
  type: LogEntryType
}

/** Color a combat log entry by its structured type — no string matching. */
export function logEntryColor(type: LogEntryType): string {
  switch (type) {
    case 'crit':     return COLORS.gold
    case 'levelUp':  return COLORS.gold
    case 'victory':  return COLORS.green
    case 'xp':       return COLORS.xpBar
    case 'scroll':   return COLORS.purple
    case 'heal':     return COLORS.hpHigh
    case 'poison':   return COLORS.green
    case 'enraged':  return COLORS.red
    case 'immune':   return COLORS.border2
    case 'dealt':    return COLORS.class.warrior
    case 'defeat':   return COLORS.redDim
    case 'received': return COLORS.redDim
    default:         return COLORS.textDim
  }
}

/** @deprecated use logEntryColor — kept for backwards-compat import */
export const logLineColor = logEntryColor
