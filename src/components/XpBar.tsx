import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { xpToNextLevel } from '../engine/stats'
import { COLORS, FONT } from '../theme'

interface XpBarProps {
  xp:    number
  color: string
}

export function XpBar({ xp, color }: XpBarProps) {
  const { current, needed, level } = xpToNextLevel(xp)
  const pct = needed > 0 ? current / needed : 0
  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.label}>LVL {level}  ·  {current}/{needed} XP</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap:  { gap: 4, width: '100%', alignItems: 'center' },
  track: { width: '70%', height: 3, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: 2 },
  label: { color: COLORS.textDim, fontSize: FONT.xs, letterSpacing: 1 },
})
