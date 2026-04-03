import React from 'react'
import { View, Text, ActivityIndicator, StatusBar, StyleSheet } from 'react-native'
import { COLORS, FONT } from '../theme'

export function LoadingScreen() {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Text style={styles.title}>DUNGEON DEPTHS</Text>
      <ActivityIndicator color={COLORS.gold} size="small" />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: COLORS.bg,
    alignItems:      'center',
    justifyContent:  'center',
    gap:             16,
  },
  title: {
    color:         COLORS.gold,
    fontSize:      FONT.xl,
    fontWeight:    '900',
    letterSpacing: 8,
  },
})
