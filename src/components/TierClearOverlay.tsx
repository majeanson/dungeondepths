import React, { useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native'
import * as Haptics from 'expo-haptics'
import { COLORS } from '../theme'
import { tierName } from '../utils/tierName'

interface Props {
  tier:         number
  isFirstTime?: boolean
  onDismiss:    () => void
}

export function TierClearOverlay({ tier, isFirstTime, onDismiss }: Props) {
  const hpPct  = Math.round((1 + (tier - 1) * 0.5) * 100)
  const dmgPct = Math.round((1 + (tier - 1) * 0.35) * 100)

  const fadeAnim  = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.82)).current

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1,    duration: 280, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
        <Text style={styles.eyebrow}>{isFirstTime ? '✦ FIRST CLEAR ✦' : 'TIER COMPLETE'}</Text>
        <Text style={styles.tierNum}>TIER {tier}</Text>
        <Text style={styles.tierNameLabel}>{tierName(tier)}</Text>
        {isFirstTime && (
          <Text style={styles.firstTimeLabel}>You cleared Tier {tier - 1} for the first time!</Text>
        )}
        <Text style={styles.sub}>Monsters are now {hpPct}% HP  ·  {dmgPct}% DMG</Text>
        <TouchableOpacity style={styles.btn} onPress={onDismiss}>
          <Text style={styles.btnText}>DESCEND ↓</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 10,
    paddingHorizontal: 40,
    paddingVertical: 32,
    alignItems: 'center',
    gap: 14,
    minWidth: 260,
  },
  eyebrow: {
    color: COLORS.textDim,
    fontSize: 10,
    letterSpacing: 3,
  },
  tierNum: {
    color: COLORS.gold,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 6,
  },
  tierNameLabel: {
    color: COLORS.runewordColor,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    textAlign: 'center',
    marginTop: -6,
  },
  sub: {
    color: COLORS.textSecondary,
    fontSize: 11,
    letterSpacing: 1,
    textAlign: 'center',
  },
  firstTimeLabel: {
    color: COLORS.gold,
    fontSize: 11,
    letterSpacing: 0.5,
    textAlign: 'center',
    fontWeight: '700',
  },
  btn: {
    backgroundColor: COLORS.goldDim,
    borderWidth: 1,
    borderColor: COLORS.gold,
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 8,
    marginTop: 6,
  },
  btnText: {
    color: COLORS.gold,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 3,
  },
})
