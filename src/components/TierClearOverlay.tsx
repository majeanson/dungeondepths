import React, { useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native'
import * as Haptics from 'expo-haptics'
import { COLORS } from '../theme'
import { tierName, difficultyLabel, difficultyColor } from '../utils/tierName'

interface Props {
  tier:         number
  isFirstTime?: boolean
  onDismiss:    () => void
}

export function TierClearOverlay({ tier, isFirstTime, onDismiss }: Props) {
  // Actual applyTierScaling values (matches monsters.ts)
  const hpPct  = tier === 2 ? 250 : tier >= 3 ? 310 : 100
  const dmgPct = tier === 2 ? 180 : tier >= 3 ? 200 : 100

  const diffLabel = difficultyLabel(tier)
  const diffColor = difficultyColor(tier)

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
      <Animated.View style={[
        styles.card,
        { transform: [{ scale: scaleAnim }] },
        diffColor != null && { borderColor: diffColor },
      ]}>
        <Text style={styles.eyebrow}>{isFirstTime ? '✦ FIRST CLEAR ✦' : 'TIER COMPLETE'}</Text>

        {diffLabel != null && (
          <View style={[styles.diffBanner, { backgroundColor: diffColor + '22', borderColor: diffColor + '66' }]}>
            <Text style={[styles.diffBannerText, { color: diffColor }]}>{diffLabel}</Text>
          </View>
        )}

        <Text style={[styles.tierNum, diffColor != null && { color: diffColor }]}>TIER {tier}</Text>
        <Text style={[styles.tierNameLabel, diffColor != null && { color: diffColor, opacity: 0.7 }]}>{tierName(tier)}</Text>
        {isFirstTime && (
          <Text style={styles.firstTimeLabel}>You cleared Tier {tier - 1} for the first time!</Text>
        )}
        <Text style={styles.sub}>Monsters are now {hpPct}% HP  ·  {dmgPct}% DMG</Text>
        <TouchableOpacity
          style={[styles.btn, diffColor != null && { borderColor: diffColor, backgroundColor: diffColor + '22' }]}
          onPress={onDismiss}
        >
          <Text style={[styles.btnText, diffColor != null && { color: diffColor }]}>DESCEND ↓</Text>
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
  diffBanner: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  diffBannerText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 4,
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
