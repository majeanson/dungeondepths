import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import type { EquipSlot } from '../engine/inventory'
import type { Item } from '../engine/loot'
import { getItemColor, getItemBorderColor, QUALITY_BG } from '../utils/itemDisplay'
import { COLORS } from '../theme'

const LEFT_SLOTS: { slot: EquipSlot; label: string }[] = [
  { slot: 'helmet',  label: 'HELM'    },
  { slot: 'circlet', label: 'CIRCLET' },
  { slot: 'weapon',  label: 'WEAPON'  },
  { slot: 'chest',   label: 'CHEST'   },
  { slot: 'gloves',  label: 'GLOVES'  },
  { slot: 'legs',    label: 'LEGS'    },
]

const RIGHT_SLOTS: { slot: EquipSlot; label: string }[] = [
  { slot: 'amulet',  label: 'AMULET'   },
  { slot: 'offhand', label: 'OFF-HAND' },
  { slot: 'ring1',   label: 'RING 1'   },
  { slot: 'ring2',   label: 'RING 2'   },
  { slot: 'belt',    label: 'BELT'     },
  { slot: 'boots',   label: 'BOOTS'    },
]


interface SlotProps {
  label:     string
  item:      Item | undefined
  onPress:   () => void
  highlight: boolean
}

function Slot({ label, item, onPress, highlight }: SlotProps) {
  const borderColor = highlight ? COLORS.green : item ? getItemBorderColor(item) : COLORS.border
  const bgColor     = highlight ? COLORS.greenDim : item ? QUALITY_BG[item.quality] : COLORS.card
  return (
    <TouchableOpacity
      style={[styles.slot, { borderColor, backgroundColor: bgColor }, highlight && styles.slotHighlight]}
      onPress={onPress}
      disabled={!item}
      activeOpacity={0.7}
    >
      <Text style={styles.slotLabel}>{label}</Text>
      {item ? (
        <Text style={[styles.slotItemName, { color: getItemColor(item) }]} numberOfLines={2}>
          {item.displayName}
        </Text>
      ) : (
        <Text style={styles.slotDash}>—</Text>
      )}
    </TouchableOpacity>
  )
}

interface Props {
  equipped:       Partial<Record<EquipSlot, Item>>
  onSlotTap:      (slot: EquipSlot) => void  // opens detail sheet
  highlightSlot?: EquipSlot | null
}

export function EquipmentPanel({ equipped, onSlotTap, highlightSlot }: Props) {
  return (
    <View style={styles.panel}>
      <View style={styles.col}>
        {LEFT_SLOTS.map(({ slot, label }) => (
          <Slot key={slot} label={label} item={equipped[slot]} onPress={() => onSlotTap(slot)} highlight={slot === highlightSlot} />
        ))}
      </View>
      <View style={styles.col}>
        {RIGHT_SLOTS.map(({ slot, label }) => (
          <Slot key={slot} label={label} item={equipped[slot]} onPress={() => onSlotTap(slot)} highlight={slot === highlightSlot} />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    gap: 8,
  },
  col: {
    flex: 1,
    gap: 4,
  },
  slot: {
    borderRadius: 3,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minHeight: 32,
    justifyContent: 'center',
  },
  slotLabel: {
    color: COLORS.textDim,
    fontSize: 8,
    letterSpacing: 1,
    marginBottom: 2,
  },
  slotItemName: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 13,
  },
  slotDash: {
    color: COLORS.border,
    fontSize: 12,
  },
  slotHighlight: {
    borderWidth: 1.5,
  },
})
