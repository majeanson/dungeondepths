import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { COLORS } from '../theme'

interface Props {
  text:      string
  positive?: boolean
  neutral?:  boolean
}

export function BonusChip({ text, positive, neutral }: Props) {
  const color = neutral ? COLORS.textDim : positive ? COLORS.green : COLORS.red
  return (
    <View style={[styles.chip, { borderColor: color + '55' }]}>
      <Text style={[styles.text, { color }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  text: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
})
