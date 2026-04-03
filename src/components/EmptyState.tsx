import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { COLORS, FONT, SPACING } from '../theme'

interface EmptyStateProps {
  icon:    string
  title:   string
  note?:   string
}

export function EmptyState({ icon, title, note }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      {note && <Text style={styles.note}>{note}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            SPACING.sm,
    paddingBottom:  60,
  },
  icon: {
    fontSize: 32,
    color:    COLORS.border2,
  },
  title: {
    color:         COLORS.textDim,
    fontSize:      FONT.md,
    fontWeight:    '700',
    letterSpacing: 1,
  },
  note: {
    color:       COLORS.textDim,
    fontSize:    FONT.sm,
    textAlign:   'center',
    lineHeight:  17,
    paddingHorizontal: SPACING.xl,
  },
})
