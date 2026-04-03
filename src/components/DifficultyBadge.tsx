import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { COLORS } from '../theme'

interface Props {
  stars: number
  label: string
  color: string
}

export function DifficultyBadge({ stars, label, color }: Props) {
  const labelColor = stars === 1 ? COLORS.green : stars === 2 ? COLORS.gold : COLORS.red
  return (
    <View style={styles.wrap}>
      <View style={styles.stars}>
        {[1, 2, 3].map(i => (
          <View key={i} style={[styles.star, { backgroundColor: i <= stars ? color : COLORS.border }]} />
        ))}
      </View>
      <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stars: { flexDirection: 'row', gap: 4 },
  star:  { width: 8, height: 8, borderRadius: 2 },
  label: { fontSize: 9, letterSpacing: 1.5, fontWeight: '700' },
})
