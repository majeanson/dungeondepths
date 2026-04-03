import React from 'react'
import { Text, StyleSheet } from 'react-native'
import { COLORS, FONT, SPACING } from '../theme'

interface SectionLabelProps {
  label: string
}

export function SectionLabel({ label }: SectionLabelProps) {
  return <Text style={styles.label}>{label}</Text>
}

const styles = StyleSheet.create({
  label: {
    color:         COLORS.textDim,
    fontSize:      FONT.xs,
    fontWeight:    '700',
    letterSpacing: 2.5,
    marginBottom:  SPACING.sm,
  },
})
