import React from 'react'
import { Animated, View, Text, StyleSheet } from 'react-native'
import { COLORS } from '../theme'
import type { SkillDef } from '../data/skills'
import { SKILL_GLYPH } from '../data/skills'

interface Props {
  levelUpScale:   Animated.Value
  levelUpOpacity: Animated.Value
  newLevel:       number
  newSkill?:      SkillDef | null
  nextSkill?:     SkillDef | null
}

export function LevelUpOverlay({ levelUpScale, levelUpOpacity, newLevel, newSkill, nextSkill }: Props) {
  return (
    <Animated.View
      style={[
        styles.overlay,
        { opacity: levelUpOpacity, transform: [{ scale: levelUpScale }] },
      ]}
      pointerEvents="none"
    >
      <Text style={styles.star}>★</Text>
      <Text style={styles.headline}>LEVEL UP</Text>
      <Text style={styles.level}>{newLevel}</Text>
      <Text style={styles.sub}>+HP  ·  +MANA</Text>
      {newSkill ? (
        <View style={styles.skillCard}>
          <Text style={styles.skillUnlocked}>SKILL UNLOCKED</Text>
          <View style={styles.skillRow}>
            <Text style={styles.skillGlyph}>{SKILL_GLYPH[newSkill.id] ?? '·'}</Text>
            <Text style={styles.skillName}>{newSkill.name.toUpperCase()}</Text>
          </View>
          <Text style={styles.skillDesc}>{newSkill.description}</Text>
          {newSkill.manaCost > 0 && (
            <Text style={styles.skillMana}>{newSkill.manaCost} MP</Text>
          )}
        </View>
      ) : nextSkill ? (
        <View style={[styles.skillCard, styles.skillCardNext]}>
          <Text style={styles.skillUnlocked}>NEXT SKILL</Text>
          <View style={styles.skillRow}>
            <Text style={[styles.skillGlyph, styles.skillGlyphNext]}>{SKILL_GLYPH[nextSkill.id] ?? '·'}</Text>
            <Text style={[styles.skillName, styles.skillNameNext]}>{nextSkill.name.toUpperCase()}</Text>
          </View>
          <Text style={styles.skillDesc}>{nextSkill.description}</Text>
          <Text style={styles.skillMana}>unlocks at level {nextSkill.levelRequired}</Text>
        </View>
      ) : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 100,
  },
  star: {
    fontSize: 36,
    color: COLORS.gold,
  },
  headline: {
    color: COLORS.gold,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 8,
  },
  level: {
    color: COLORS.gold,
    fontSize: 64,
    fontWeight: '900',
    lineHeight: 70,
  },
  sub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    letterSpacing: 3,
  },
  skillCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.gold + '66',
    backgroundColor: COLORS.goldDim,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 6,
    minWidth: 200,
  },
  skillUnlocked: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: '700',
  },
  skillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  skillGlyph: {
    color: COLORS.gold,
    fontSize: 18,
    lineHeight: 22,
  },
  skillName: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
  },
  skillDesc: {
    color: COLORS.textSecondary,
    fontSize: 11,
    letterSpacing: 0.3,
    textAlign: 'center',
    lineHeight: 16,
  },
  skillMana: {
    color: COLORS.manaBar,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
  },
  skillCardNext: {
    borderColor: COLORS.textDim + '44',
    backgroundColor: COLORS.surface,
    opacity: 0.85,
  },
  skillGlyphNext: {
    color: COLORS.textDim,
  },
  skillNameNext: {
    color: COLORS.textDim,
  },
})
