import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { COLORS } from '../theme'

// Mirrors ENC_TILE_COLOR / ENC_DOT_COLOR / ENC_GLYPH in GridScreen exactly
const LEGEND_ROWS = [
  { label: 'Normal',  glyph: '•', glyphColor: '#ffffff',                 tile: COLORS.tile.floor  },
  { label: 'Elite',   glyph: '·', glyphColor: COLORS.encounter.elite,   tile: COLORS.blueDim     },
  { label: 'Rare',    glyph: '✦', glyphColor: COLORS.encounter.rare,    tile: COLORS.tile.chest  },
  { label: 'Ancient', glyph: '◈', glyphColor: COLORS.encounter.ancient, tile: COLORS.tile.boss   },
  { label: 'Chest',   glyph: '◆', glyphColor: COLORS.encounter.chest,   tile: COLORS.tile.chest  },
  { label: 'Shrine',  glyph: '✺', glyphColor: COLORS.encounter.shrine,  tile: COLORS.tile.shrine },
  { label: 'Boss',    glyph: '☠', glyphColor: COLORS.encounter.boss,    tile: COLORS.tile.boss   },
  { label: 'Exit',    glyph: '▼', glyphColor: COLORS.gold,              tile: COLORS.tile.exit   },
] as const

interface Props {
  onClose:      () => void
  onOpenGuide:  () => void
  onEndRun:     () => void
}

export function LegendOverlay({ onClose, onOpenGuide, onEndRun }: Props) {
  function handleEndRun() {
    Alert.alert(
      'Abandon Run?',
      'You will lose all items in your bag and return to the main menu.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End Run', style: 'destructive', onPress: onEndRun },
      ],
    )
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>MAP KEY</Text>
          <TouchableOpacity onPress={onOpenGuide}>
            <Text style={styles.guideBtn}>FULL GUIDE →</Text>
          </TouchableOpacity>
        </View>
        {LEGEND_ROWS.map(row => (
          <View key={row.label} style={styles.row}>
            <View style={[styles.tile, { backgroundColor: row.tile }]}>
              <Text style={[styles.glyph, { color: row.glyphColor }]}>{row.glyph}</Text>
            </View>
            <Text style={[styles.label, { color: row.glyphColor }]}>{row.label}</Text>
          </View>
        ))}
        <TouchableOpacity style={styles.endRunBtn} onPress={handleEndRun}>
          <Text style={styles.endRunText}>⚑ END RUN</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>CLOSE</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 120,
    right: 16,
    zIndex: 50,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border2,
    borderRadius: 10,
    padding: 12,
    gap: 7,
    minWidth: 160,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  title: {
    color: COLORS.textDim,
    fontSize: 8,
    letterSpacing: 2,
    fontWeight: '700',
  },
  guideBtn: {
    color: COLORS.gold,
    fontSize: 8,
    letterSpacing: 1,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tile: {
    width: 18,
    height: 18,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glyph: {
    fontSize: 10,
    fontWeight: '700',
    includeFontPadding: false,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  endRunBtn: {
    marginTop: 4,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.redDim,
    paddingTop: 8,
    paddingBottom: 4,
  },
  endRunText: {
    color: COLORS.red,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
  },
  closeBtn: {
    marginTop: 2,
    alignItems: 'center',
    paddingTop: 6,
  },
  closeText: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 1,
  },
})
