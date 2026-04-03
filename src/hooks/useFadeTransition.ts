import { useEffect, useRef } from 'react'
import { Animated } from 'react-native'

/** Fades from 0→1 on mount. Returns the Animated.Value to apply as `opacity`. */
export function useFadeTransition(durationMs = 250): Animated.Value {
  const opacity = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: durationMs,
      useNativeDriver: true,
    }).start()
  }, [])
  return opacity
}
