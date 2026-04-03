/**
 * EncounterSplash — full-screen interstitial when the player steps into a monster.
 * Gothic stone-frame aesthetic with monster portrait, horizontal rules,
 * and sharp (0-radius) borders throughout.
 */
import React, { useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native'
import { EncounterType } from '../engine/encounter'
import { MONSTER_AFFIXES, type MonsterAffix } from '../data/monsters'
import type { MonsterInstance } from '../engine/monsters'
import { MonsterPortrait, MONSTER_LORE } from './MonsterPortrait'
import { COLORS } from '../theme'

export interface EncounterSplashData {
  monsterName: string
  affixes:     MonsterAffix[]
  monster:     MonsterInstance
  type:        EncounterType
}

interface Props {
  splash:  EncounterSplashData
  onFight: () => void
}

const TYPE_COLOR: Partial<Record<EncounterType, string>> = {
  [EncounterType.Normal]:  COLORS.textSecondary,
  [EncounterType.Elite]:   COLORS.blue,
  [EncounterType.Rare]:    COLORS.gold,
  [EncounterType.Ancient]: COLORS.runewordColor,
  [EncounterType.Boss]:    COLORS.red,
}
const TYPE_BG: Partial<Record<EncounterType, string>> = {
  [EncounterType.Normal]:  COLORS.card,
  [EncounterType.Elite]:   COLORS.blueDim,
  [EncounterType.Rare]:    COLORS.goldDim,
  [EncounterType.Ancient]: COLORS.card,
  [EncounterType.Boss]:    COLORS.redDim,
}
const TYPE_LABEL: Partial<Record<EncounterType, string>> = {
  [EncounterType.Normal]:  'ENCOUNTER',
  [EncounterType.Elite]:   '⚡  ELITE',
  [EncounterType.Rare]:    '★  RARE',
  [EncounterType.Ancient]: '🔥  ANCIENT',
  [EncounterType.Boss]:    '☠  BOSS',
}

export function EncounterSplash({ splash, onFight }: Props) {
  const isBoss     = splash.type === EncounterType.Boss
  const typeColor  = TYPE_COLOR[splash.type] ?? COLORS.textSecondary
  const typeBg     = TYPE_BG[splash.type]    ?? COLORS.card
  const lore       = MONSTER_LORE[splash.monster.defId]

  // Entrance — slide up + fade
  const enterY    = useRef(new Animated.Value(32)).current
  const enterFade = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.parallel([
      Animated.timing(enterFade, { toValue: 1, duration: isBoss ? 340 : 220, useNativeDriver: true }),
      Animated.spring(enterY,    { toValue: 0, tension: isBoss ? 55 : 90, friction: 8, useNativeDriver: true }),
    ]).start()
  }, [])

  // Pulsing border for boss / ancient / rare
  const pulseTier    = isBoss || splash.type === EncounterType.Ancient || splash.type === EncounterType.Rare
  const pulseOpacity = useRef(new Animated.Value(0.5)).current
  useEffect(() => {
    if (!pulseTier) return
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [pulseTier])

  return (
    <Animated.View style={[styles.overlay, { opacity: enterFade }]}>
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: typeBg },
          pulseTier && { opacity: pulseOpacity },
          { transform: [{ translateY: enterY }] },
        ]}
      >
        {/* ── Outer border ───────────────────────────────────────────── */}
        <View style={[styles.outerBorder, { borderColor: typeColor + '88' }]}>
          <View style={[styles.innerBorder, { borderColor: typeColor + '33' }]}>

            {/* Corner rivets */}
            <View style={[styles.rivet, styles.rivetTL, { backgroundColor: typeColor + '66' }]} />
            <View style={[styles.rivet, styles.rivetTR, { backgroundColor: typeColor + '66' }]} />
            <View style={[styles.rivet, styles.rivetBL, { backgroundColor: typeColor + '66' }]} />
            <View style={[styles.rivet, styles.rivetBR, { backgroundColor: typeColor + '66' }]} />

            <View style={styles.content}>
              {/* Monster portrait — center, large */}
              <MonsterPortrait
                monsterId={splash.monster.defId}
                encounterType={splash.type}
                hpPct={1}
                size={isBoss ? 'lg' : 'md'}
              />

              {/* Horizontal rule */}
              <View style={[styles.rule, { backgroundColor: typeColor + '44' }]} />

              {/* Eyebrow — encounter type */}
              <Text style={[styles.eyebrow, { color: typeColor }]}>
                {TYPE_LABEL[splash.type] ?? 'ENCOUNTER'}
              </Text>

              {/* Monster name */}
              <Text style={[
                styles.name,
                { color: typeColor },
                isBoss && styles.bossName,
              ]}>
                {splash.monsterName.toUpperCase()}
              </Text>

              {/* Lore flavor line */}
              {lore && (
                <Text style={styles.lore}>"{lore}"</Text>
              )}

              {/* Horizontal rule */}
              <View style={[styles.rule, { backgroundColor: typeColor + '44' }]} />

              {/* Affixes */}
              {splash.affixes.length > 0 && (
                <View style={styles.affixes}>
                  {splash.affixes.map(a => (
                    <View key={a} style={[styles.affixBadge, { borderColor: typeColor + '55', backgroundColor: typeColor + '11' }]}>
                      <Text style={[styles.affixText, { color: typeColor }]}>{MONSTER_AFFIXES[a].name.toUpperCase()}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Boss mechanics */}
              {isBoss && splash.monster.bossMechanics && splash.monster.bossMechanics.length > 0 && (
                <View style={styles.affixes}>
                  {splash.monster.bossMechanics.map((m: string) => (
                    <View key={m} style={[styles.mechBadge, { borderColor: typeColor + '55' }]}>
                      <Text style={[styles.mechText, { color: typeColor }]}>
                        {m.replace('_', ' ').toUpperCase()}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Fight button */}
              <TouchableOpacity
                style={[styles.fightBtn, { borderColor: typeColor, backgroundColor: typeColor + '18' }]}
                onPress={onFight}
              >
                <Text style={[styles.fightBtnText, { color: typeColor }]}>⚔  FIGHT</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent:  'center',
    alignItems:      'center',
  },
  card: {
    minWidth: 270,
    maxWidth: 320,
  },
  outerBorder: {
    borderWidth: 2,
    padding: 1,
  },
  innerBorder: {
    borderWidth: 1,
    position: 'relative',
  },
  content: {
    paddingHorizontal: 32,
    paddingVertical:   28,
    alignItems:        'center',
    gap:               12,
  },
  rivet: {
    position:        'absolute',
    width:           5,
    height:          5,
    borderRadius:    1,
    zIndex:          1,
  },
  rivetTL: { top: 2,    left: 2  },
  rivetTR: { top: 2,    right: 2 },
  rivetBL: { bottom: 2, left: 2  },
  rivetBR: { bottom: 2, right: 2 },
  rule: {
    alignSelf:  'stretch',
    height:     1,
    marginVertical: 2,
  },
  eyebrow: {
    fontSize:     11,
    letterSpacing: 3,
    fontWeight:   '700',
  },
  name: {
    fontSize:     26,
    fontWeight:   '900',
    letterSpacing: 4,
    textAlign:    'center',
  },
  bossName: {
    fontSize:    30,
    textShadowColor:  COLORS.glow.boss,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  lore: {
    color:        COLORS.textDim,
    fontSize:     10,
    letterSpacing: 0.3,
    fontStyle:    'italic',
    textAlign:    'center',
    lineHeight:   15,
    marginHorizontal: 8,
  },
  affixes: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    justifyContent: 'center',
    gap:            6,
  },
  affixBadge: {
    borderWidth:      1,
    paddingHorizontal: 8,
    paddingVertical:   3,
  },
  affixText: {
    fontSize:     9,
    letterSpacing: 1.5,
    fontWeight:   '700',
  },
  mechBadge: {
    backgroundColor: COLORS.redDim,
    borderWidth:     1,
    paddingHorizontal: 8,
    paddingVertical:   3,
  },
  mechText: {
    fontSize:     9,
    fontWeight:   '700',
    letterSpacing: 1.5,
  },
  fightBtn: {
    borderWidth:      2,
    paddingHorizontal: 48,
    paddingVertical:   16,
    marginTop:         6,
    alignSelf:        'stretch',
    alignItems:       'center',
  },
  fightBtnText: {
    fontSize:     18,
    fontWeight:   '900',
    letterSpacing: 4,
  },
})
