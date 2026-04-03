import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import type { Item } from '../engine/loot'
import { getItemColor } from '../utils/itemDisplay'
import { COLORS } from '../theme'

interface ItemCardProps {
  item: Item
  onEquip?: (uid: string) => void
  onDrop?: (uid: string) => void
  isEquipped?: boolean
  compact?: boolean
}

export function ItemCard({ item, onEquip, onDrop, isEquipped, compact }: ItemCardProps) {
  const nameColor = getItemColor(item)
  const socketsText = item.sockets > 0
    ? ` [${item.insertedRunes.length}/${item.sockets}S]`
    : ''
  const runewordNote = item.quality === 'normal' && item.sockets > 0 && item.insertedRunes.length === 0
    ? ' ← runeword base'
    : ''
  const sizeText = `${item.size[0]}×${item.size[1]}`

  if (compact) {
    if (!item.identified) {
      return (
        <View style={[styles.compact, { borderLeftColor: nameColor }]}>
          <View style={styles.unidRow}>
            <View style={[styles.unidDot, { backgroundColor: nameColor }]} />
            <Text style={[styles.name, { color: nameColor }]} numberOfLines={1}>
              {item.slot.charAt(0).toUpperCase() + item.slot.slice(1)}
            </Text>
            <Text style={styles.unidBadge}>UNID</Text>
          </View>
          <Text style={styles.meta}>{sizeText}</Text>
        </View>
      )
    }
    return (
      <View style={[styles.compact, { borderLeftColor: nameColor }]}>
        <Text style={[styles.name, { color: nameColor }]} numberOfLines={1}>
          {item.displayName}
        </Text>
        <Text style={styles.meta}>{item.slot} · {sizeText}{socketsText}</Text>
      </View>
    )
  }

  return (
    <View style={[styles.card, isEquipped && styles.equippedCard, { borderLeftColor: nameColor, borderLeftWidth: 3 }]}>
      <View style={styles.header}>
        <Text style={[styles.name, { color: nameColor }]}>{item.displayName}</Text>
        {isEquipped && <Text style={styles.equippedBadge}>EQUIPPED</Text>}
      </View>
      <Text style={styles.meta}>
        {item.slot.toUpperCase()} · {sizeText}{socketsText}
        {runewordNote ? <Text style={styles.runewordHint}>{runewordNote}</Text> : null}
      </Text>

      {/* Effective stats */}
      {Object.entries(item.effectiveStats).length > 0 && (
        <View style={styles.stats}>
          {Object.entries(item.effectiveStats).map(([k, v]) => (
            <Text key={k} style={styles.stat}>
              +{typeof v === 'number' ? v : JSON.stringify(v)} {k}
            </Text>
          ))}
        </View>
      )}

      {/* Affixes */}
      {item.affixes.length > 0 && (
        <View style={styles.affixList}>
          {item.affixes.map(a => (
            <Text key={a.def.id} style={styles.affix}>· {a.def.name}</Text>
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {onEquip && !isEquipped && (
          <TouchableOpacity style={styles.equipBtn} onPress={() => onEquip(item.uid)}>
            <Text style={styles.equipBtnText}>Equip</Text>
          </TouchableOpacity>
        )}
        {onDrop && (
          <TouchableOpacity style={styles.dropBtn} onPress={() => onDrop(item.uid)}>
            <Text style={styles.dropBtnText}>Drop</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    gap: 4,
  },
  equippedCard: {
    borderColor: COLORS.textDim,
    backgroundColor: COLORS.surface,
  },
  compact: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    paddingLeft: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.border,
  },
  unidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unidDot: {
    width: 7,
    height: 7,
    borderRadius: 1,
    flexShrink: 0,
  },
  unidBadge: {
    color: COLORS.textDim,
    fontSize: 8,
    letterSpacing: 1.5,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: COLORS.border2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  equippedBadge: {
    fontSize: 9,
    color: COLORS.textSecondary,
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: COLORS.border2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  meta: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  runewordHint: {
    color: COLORS.gold,
    fontSize: 10,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  stat: {
    fontSize: 10,
    color: COLORS.blue,
  },
  affixList: {
    gap: 1,
  },
  affix: {
    fontSize: 10,
    color: COLORS.green,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  equipBtn: {
    backgroundColor: COLORS.greenDim,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
  },
  equipBtnText: {
    color: COLORS.hpHigh,
    fontSize: 11,
    fontWeight: '600',
  },
  dropBtn: {
    backgroundColor: COLORS.redDim,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
  },
  dropBtnText: {
    color: COLORS.red,
    fontSize: 11,
  },
})
