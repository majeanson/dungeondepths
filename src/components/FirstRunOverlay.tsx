import React, { useRef, useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions } from 'react-native'
import { COLORS } from '../theme'

const { width: SW } = Dimensions.get('window')

const STEPS = [
  {
    glyph: '⚔',
    title: 'EXPLORE THE DUNGEON',
    body:  'Move with the D-pad or swipe. Each floor is a fog-shrouded grid of encounters. Reach the exit ▼ to descend deeper.',
  },
  {
    glyph: '☠',
    title: 'FIGHT TO SURVIVE',
    body:  'Tap glyphs on the map to trigger encounters. Strike, use skills, and manage mana. Flee is not always an option.',
  },
  {
    glyph: '◆',
    title: 'COLLECT LOOT',
    body:  'Enemies drop items. Open chests. Equip gear to grow stronger. Rarer items have more affixes — and more power.',
  },
  {
    glyph: '▲',
    title: 'XP CARRIES OVER',
    body:  'You will die. That is fine. XP, tier, and level persist between runs. Each death makes the next attempt stronger.',
  },
]

interface Props {
  onDismiss: () => void
}

export function FirstRunOverlay({ onDismiss }: Props) {
  const [step, setStep] = useState(0)
  const opacity  = useRef(new Animated.Value(0)).current
  const slideX   = useRef(new Animated.Value(20)).current

  useEffect(() => {
    opacity.setValue(0)
    slideX.setValue(20)
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(slideX,  { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start()
  }, [step])

  function advance() {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1)
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(onDismiss)
    }
  }

  const current = STEPS[step]
  const isLast  = step === STEPS.length - 1

  return (
    <View style={styles.backdrop}>
      <Animated.View style={[styles.card, { opacity, transform: [{ translateX: slideX }] }]}>
        {/* Step dots */}
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>

        <Text style={styles.glyph}>{current.glyph}</Text>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.body}>{current.body}</Text>

        <TouchableOpacity style={styles.btn} onPress={advance}>
          <Text style={styles.btnText}>
            {isLast ? 'BEGIN' : 'NEXT →'}
          </Text>
        </TouchableOpacity>

        {!isLast && (
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}>
            <Text style={styles.skip}>skip</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,3,3,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  card: {
    width: Math.min(SW - 48, 340),
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border2,
    borderRadius: 12,
    padding: 28,
    alignItems: 'center',
    gap: 14,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.border2,
  },
  dotActive: {
    backgroundColor: COLORS.gold,
    width: 18,
  },
  glyph: {
    fontSize: 36,
    color: COLORS.gold,
    marginTop: 4,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 3,
    textAlign: 'center',
  },
  body: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  btn: {
    width: '100%',
    backgroundColor: COLORS.goldDim,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  btnText: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 3,
  },
  skip: {
    color: COLORS.textDim,
    fontSize: 11,
    letterSpacing: 1,
  },
})
