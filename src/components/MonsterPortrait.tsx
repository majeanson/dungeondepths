/**
 * MonsterPortrait — stone-framed portrait panel for any monster or boss.
 *
 * Currently uses Unicode glyph fallbacks. To use real pixel-art assets,
 * pass an `image` prop:
 *   import skeletonPng from '../assets/monsters/skeleton.png'
 *   <MonsterPortrait ... image={skeletonPng} />
 * The component handles the switch automatically — no other changes needed.
 */
import React from 'react'
import { View, Text, StyleSheet, Image, type ImageSourcePropType } from 'react-native'
import { EncounterType } from '../engine/encounter'
import { getMonsterHpColor, COLORS } from '../theme'
import { MONSTER_PORTRAITS } from '../assets/portraits'

// ── Portrait fallback glyphs — one per monster/boss defId ─────────────────────
// Replace individual entries with require('../assets/monsters/<id>.png') calls
// once pixel-art assets exist.
export const PORTRAIT_CHAR: Record<string, string> = {
  // Regular monsters
  skeleton:      '💀',
  zombie:        '🧟',
  fallen:        '👹',
  imp:           '👿',
  bone_warrior:  '☠',
  plague_rat:    '🐀',
  cave_troll:    '👾',
  dark_shaman:   '🔮',
  blood_hawk:    '🦅',
  golem:         '🗿',
  wraith:        '👻',
  demon_lord:    '😈',
  // Bosses
  the_warden:    '⚔',
  bonekeeper:    '💀',
  inferno_witch: '🔥',
  shadow_stalker:'🗡',
  iron_colossus: '⚙',
  abyssal_one:   '🌑',
}

// ── One-line lore per monster — shown in EncounterSplash ──────────────────────
export const MONSTER_LORE: Record<string, string> = {
  skeleton:      'The dead do not tire.',
  zombie:        'It smells of rot and old rain.',
  fallen:        'Small, fast, and utterly fearless.',
  imp:           'Chaos wrapped in leathery skin.',
  bone_warrior:  'Armor and hatred, nothing else.',
  plague_rat:    'Carries a dozen deaths in its teeth.',
  cave_troll:    'The cave formed around it over centuries.',
  dark_shaman:   'It knows your name.',
  blood_hawk:    'Strikes before you see the shadow.',
  golem:         'Stone given purpose it does not question.',
  wraith:        'What remains when grief outlives the body.',
  demon_lord:    'This is why the dungeon was sealed.',
  // Bosses
  the_warden:    'Guardian of the first gate. It has never lost.',
  bonekeeper:    'He has died a hundred times. It did not take.',
  inferno_witch: 'She burned the city. Then she burned herself.',
  shadow_stalker:'You will not hear it until it is too late.',
  iron_colossus: 'Built by a civilization that feared death.',
  abyssal_one:   'The rift does not stop. It does not rest.',
}

// ── Frame color per encounter type ───────────────────────────────────────────
const FRAME_COLOR: Partial<Record<EncounterType, string>> = {
  [EncounterType.Normal]:  COLORS.border2,
  [EncounterType.Elite]:   COLORS.blue,
  [EncounterType.Rare]:    COLORS.gold,
  [EncounterType.Ancient]: COLORS.runewordColor,
  [EncounterType.Boss]:    COLORS.red,
}

const SIZE_PX = { sm: 52, md: 68, lg: 96 } as const

interface Props {
  monsterId:     string
  encounterType: EncounterType
  hpPct:         number
  size?:         keyof typeof SIZE_PX
  image?:        ImageSourcePropType
}

export function MonsterPortrait({ monsterId, encounterType, hpPct, size = 'md', image: imageProp }: Props) {
  const px         = SIZE_PX[size]
  const frameColor = FRAME_COLOR[encounterType] ?? COLORS.border2
  const hpColor    = getMonsterHpColor(hpPct)
  const charSize   = size === 'sm' ? 22 : size === 'md' ? 30 : 42
  const char       = PORTRAIT_CHAR[monsterId] ?? '◉'
  // Use explicit prop if provided, else look up registry, else fall back to glyph
  const image      = imageProp ?? MONSTER_PORTRAITS[monsterId] ?? null

  return (
    <View style={{ alignItems: 'center' }}>
      {/* Outer stone frame */}
      <View style={[styles.frameOuter, { width: px, height: px, borderColor: frameColor + '99' }]}>
        {/* Inner decorative border */}
        <View style={[styles.frameInner, { borderColor: frameColor + '44' }]}>
          {image !== null ? (
            <Image
              source={image}
              style={{ width: px - 8, height: px - 8 }}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.glyphBg, { backgroundColor: frameColor + '0d' }]}>
              <Text style={[styles.glyph, { fontSize: charSize }]}>{char}</Text>
            </View>
          )}
        </View>

        {/* Corner rivets */}
        <View style={[styles.rivet, styles.rivetTL, { backgroundColor: frameColor + '66' }]} />
        <View style={[styles.rivet, styles.rivetTR, { backgroundColor: frameColor + '66' }]} />
        <View style={[styles.rivet, styles.rivetBL, { backgroundColor: frameColor + '66' }]} />
        <View style={[styles.rivet, styles.rivetBR, { backgroundColor: frameColor + '66' }]} />
      </View>

      {/* HP bar pinned below frame */}
      <View style={[styles.hpTrack, { width: px }]}>
        <View style={[styles.hpFill, { width: `${Math.max(0, hpPct) * 100}%`, backgroundColor: hpColor }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  frameOuter: {
    borderWidth: 2,
    backgroundColor: COLORS.card,
  },
  frameInner: {
    flex: 1,
    margin: 1,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  glyphBg: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  glyph: {
    textAlign: 'center',
    includeFontPadding: false,
  },
  rivet: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 1,
  },
  rivetTL: { top: 1,    left: 1  },
  rivetTR: { top: 1,    right: 1 },
  rivetBL: { bottom: 1, left: 1  },
  rivetBR: { bottom: 1, right: 1 },
  hpTrack: {
    height: 4,
    backgroundColor: COLORS.surface2,
  },
  hpFill: {
    height: '100%',
  },
})
