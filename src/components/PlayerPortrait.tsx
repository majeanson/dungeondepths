/**
 * PlayerPortrait — class-specific portrait panel that reacts to HP state.
 *
 * HP reactions:
 *   > 50%  : normal
 *   25-50% : amber tint overlay
 *   < 25%  : pulsing red overlay
 *   0      : skull glyph
 *
 * To use a real pixel-art portrait, pass an `image` prop:
 *   import warriorPng from '../assets/portraits/warrior.png'
 *   <PlayerPortrait ... image={warriorPng} />
 */
import React, { useEffect, useRef } from 'react'
import { View, Text, Animated, StyleSheet, Image, type ImageSourcePropType } from 'react-native'
import { COLORS } from '../theme'
import { CLASS_PORTRAITS } from '../assets/portraits'

// ── Placeholder glyphs — swap for image assets when ready ────────────────────
const CLASS_PORTRAIT_CHAR: Record<string, string> = {
  warrior:  '🪖',
  rogue:    '🎭',
  sorcerer: '🧙',
}

interface Props {
  classId:    string | null
  classColor: string
  hpPct:      number
  size?:      number
  image?:     ImageSourcePropType
}

export function PlayerPortrait({ classId, classColor, hpPct, size = 44, image: imageProp }: Props) {
  const char     = (classId && CLASS_PORTRAIT_CHAR[classId]) ?? '?'
  const charSize = Math.floor(size * 0.48)
  const image    = imageProp ?? (classId ? CLASS_PORTRAITS[classId] : null) ?? null
  const isDead   = hpPct <= 0
  const isLow    = !isDead && hpPct < 0.25
  const isMid    = !isDead && hpPct >= 0.25 && hpPct < 0.5

  // Pulse animation at critically low HP
  const pulseAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!isLow) { pulseAnim.setValue(0); return }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.55, duration: 550, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.1,  duration: 550, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [isLow])

  return (
    <View style={[styles.frame, { width: size, height: size, borderColor: classColor + '55' }]}>
      <View style={[styles.inner, { borderColor: classColor + '22', backgroundColor: COLORS.surface2 }]}>
        {/* Portrait content */}
        {image !== null ? (
          <Image
            source={image}
            style={{ width: size - 8, height: size - 8 }}
            resizeMode="cover"
          />
        ) : isDead ? (
          <Text style={[styles.char, { fontSize: charSize, color: COLORS.red }]}>☠</Text>
        ) : (
          <Text style={[styles.char, { fontSize: charSize }]}>{char}</Text>
        )}

        {/* HP state tint overlay */}
        {isMid && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#aa5a10', opacity: 0.22 }]} />
        )}
        {isLow && (
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#cc1a1a', opacity: pulseAnim }]} />
        )}
      </View>

      {/* Corner rivets */}
      <View style={[styles.rivet, styles.rivetTL, { backgroundColor: classColor + '55' }]} />
      <View style={[styles.rivet, styles.rivetTR, { backgroundColor: classColor + '55' }]} />
      <View style={[styles.rivet, styles.rivetBL, { backgroundColor: classColor + '55' }]} />
      <View style={[styles.rivet, styles.rivetBR, { backgroundColor: classColor + '55' }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 2,
    backgroundColor: COLORS.card,
  },
  inner: {
    flex: 1,
    margin: 1,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  char: {
    textAlign: 'center',
    includeFontPadding: false,
    color: COLORS.textSecondary,
  },
  rivet: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1,
  },
  rivetTL: { top: 0,    left: 0  },
  rivetTR: { top: 0,    right: 0 },
  rivetBL: { bottom: 0, left: 0  },
  rivetBR: { bottom: 0, right: 0 },
})
