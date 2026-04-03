/**
 * Combat animation hooks — shake, flash, level-up pulse.
 * Uses React Native Animated API (no extra dependencies).
 */

import { useRef } from 'react'
import { Animated } from 'react-native'

export function useCombatAnimations() {
  // Player HP bar shake (translateX)
  const shakeX = useRef(new Animated.Value(0)).current

  // Monster HP bar flash (opacity oscillation)
  const monsterFlashOpacity = useRef(new Animated.Value(1)).current

  // Level-up overlay scale + opacity
  const levelUpScale   = useRef(new Animated.Value(0)).current
  const levelUpOpacity = useRef(new Animated.Value(0)).current

  function triggerShake() {
    shakeX.setValue(0)
    Animated.sequence([
      Animated.timing(shakeX, { toValue: -10, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue:  10, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue:  -6, duration: 35, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue:   6, duration: 35, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue:   0, duration: 30, useNativeDriver: true }),
    ]).start()
  }

  function triggerMonsterFlash() {
    monsterFlashOpacity.setValue(1)
    Animated.sequence([
      Animated.timing(monsterFlashOpacity, { toValue: 0.25, duration: 80,  useNativeDriver: true }),
      Animated.timing(monsterFlashOpacity, { toValue: 1,    duration: 120, useNativeDriver: true }),
    ]).start()
  }

  function triggerLevelUp(onDone?: () => void) {
    levelUpScale.setValue(0.5)
    levelUpOpacity.setValue(0)
    Animated.parallel([
      Animated.spring(levelUpScale, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.timing(levelUpOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      // Hold for 1.2s then fade out
      setTimeout(() => {
        Animated.timing(levelUpOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(onDone)
      }, 1200)
    })
  }

  return {
    shakeX,
    monsterFlashOpacity,
    levelUpScale,
    levelUpOpacity,
    triggerShake,
    triggerMonsterFlash,
    triggerLevelUp,
  }
}
