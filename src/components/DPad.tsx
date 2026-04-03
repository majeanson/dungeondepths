/**
 * DPad — stone-panel directional controls.
 * Sharp edges (borderRadius: 1), inset double-border, minimal decoration.
 */
import React from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import type { Direction } from '../store/gridStore'
import { COLORS, SPACING } from '../theme'

interface DPadProps {
  onPress: (dir: Direction) => void
  onWait?: () => void
}

export function DPad({ onPress, onWait }: DPadProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity style={[styles.btn, styles.up]} onPress={() => onPress('up')}>
        <View style={styles.btnInner}>
          <Text style={styles.arrow}>▲</Text>
        </View>
      </TouchableOpacity>
      <View style={styles.middle}>
        <TouchableOpacity style={[styles.btn, styles.side]} onPress={() => onPress('left')}>
          <View style={styles.btnInner}>
            <Text style={styles.arrow}>◄</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.center} onLongPress={onWait} delayLongPress={400}>
          <View style={styles.centerInner}>
            <Text style={styles.waitDot}>·</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.side]} onPress={() => onPress('right')}>
          <View style={styles.btnInner}>
            <Text style={styles.arrow}>►</Text>
          </View>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={[styles.btn, styles.down]} onPress={() => onPress('down')}>
        <View style={styles.btnInner}>
          <Text style={styles.arrow}>▼</Text>
        </View>
      </TouchableOpacity>
    </View>
  )
}

const BTN = 46

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  middle: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  // Outer shell — darker border
  btn: {
    width:           BTN,
    height:          BTN,
    backgroundColor: COLORS.surface2,
    borderWidth:     2,
    borderColor:     COLORS.border2,
    justifyContent:  'center',
    alignItems:      'center',
  },
  // Inset inner line — stone frame effect
  btnInner: {
    flex:           1,
    width:          '100%',
    borderWidth:    1,
    borderColor:    '#3a2820',
    justifyContent: 'center',
    alignItems:     'center',
  },
  up:   { marginBottom: SPACING.xs },
  down: { marginTop:    SPACING.xs },
  side: {},
  // Center wait button
  center: {
    width:          BTN,
    height:         BTN,
    justifyContent: 'center',
    alignItems:     'center',
  },
  centerInner: {
    flex:           1,
    width:          '100%',
    justifyContent: 'center',
    alignItems:     'center',
  },
  arrow: {
    color:    COLORS.textDim,
    fontSize: 14,
  },
  waitDot: {
    color:      COLORS.border2,
    fontSize:   22,
    lineHeight: BTN,
  },
})
