import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { COLORS } from '../theme'

interface Props {
  label: string
  value: number
  max?:  number
  color: string
}

export function StatBar({ label, value, max = 5, color }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track}>
        {Array.from({ length: max }).map((_, i) => (
          <View
            key={i}
            style={[styles.pip, { backgroundColor: i < value ? color : COLORS.border }]}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { color: COLORS.textDim, fontSize: 9, letterSpacing: 1, width: 52, textAlign: 'right' },
  track: { flexDirection: 'row', gap: 3 },
  pip:   { width: 18, height: 5, borderRadius: 2 },
})
