import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet, Dimensions,
} from 'react-native'
import { useGameStore, MAX_STASH_SIZE } from '../store/gameStore'
import { useInventoryStore } from '../store/inventoryStore'
import type { Item } from '../engine/loot'
import { QUALITY_COLOR, QUALITY_BG, SLOT_ICON, itemSummary } from '../utils/itemDisplay'
import { freeCells } from '../engine/inventory'
import { EmptyState } from '../components/EmptyState'
import { COLORS } from '../theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// ── Item card ─────────────────────────────────────────────────────────────────
function ItemCard({
  item,
  actionLabel,
  actionColor,
  onAction,
  disabled,
}: {
  item: Item
  actionLabel: string
  actionColor: string
  onAction: () => void
  disabled?: boolean
}) {
  const qColor = QUALITY_COLOR[item.quality] ?? COLORS.textSecondary
  const qBg    = QUALITY_BG[item.quality]   ?? COLORS.card
  const icon   = SLOT_ICON[item.slot] ?? '·'
  const summary = itemSummary(item)

  return (
    <View style={[cardStyles.row, { backgroundColor: qBg, borderColor: qColor + '22' }]}>
      <View style={[cardStyles.iconBox, { borderColor: qColor + '33' }]}>
        <Text style={cardStyles.icon}>{icon}</Text>
      </View>
      <View style={cardStyles.info}>
        <Text style={[cardStyles.name, { color: qColor }]} numberOfLines={1}>
          {item.displayName}
        </Text>
        <Text style={cardStyles.meta} numberOfLines={1}>{summary}</Text>
      </View>
      <TouchableOpacity
        style={[cardStyles.btn, { borderColor: disabled ? COLORS.border2 : actionColor }]}
        onPress={onAction}
        disabled={disabled}
      >
        <Text style={[cardStyles.btnText, { color: disabled ? COLORS.textDim : actionColor }]}>
          {actionLabel}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const cardStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 10,
    marginBottom: 6,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 14,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  meta: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 0.3,
  },
  btn: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 5,
  },
  btnText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
})

// ── Tab bar ────────────────────────────────────────────────────────────────────
function TabBar({ active, onBag, onStash, bagCount, stashCount }: {
  active: 'bag' | 'stash'
  onBag: () => void
  onStash: () => void
  bagCount: number
  stashCount: number
}) {
  return (
    <View style={tabStyles.bar}>
      <TouchableOpacity style={[tabStyles.tab, active === 'bag' && tabStyles.activeTab]} onPress={onBag}>
        <Text style={[tabStyles.tabText, active === 'bag' && tabStyles.activeText]}>
          BAG  <Text style={tabStyles.count}>{bagCount}</Text>
        </Text>
        {active === 'bag' && <View style={tabStyles.underline} />}
      </TouchableOpacity>
      <TouchableOpacity style={[tabStyles.tab, active === 'stash' && tabStyles.activeTab]} onPress={onStash}>
        <Text style={[tabStyles.tabText, active === 'stash' && tabStyles.activeText]}>
          STASH  <Text style={tabStyles.count}>{stashCount}/{MAX_STASH_SIZE}</Text>
        </Text>
        {active === 'stash' && <View style={tabStyles.underline} />}
      </TouchableOpacity>
    </View>
  )
}

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    position: 'relative',
  },
  activeTab: {},
  tabText: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  activeText: {
    color: COLORS.gold,
  },
  count: {
    fontWeight: '400',
    letterSpacing: 0,
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: COLORS.gold,
    borderRadius: 1,
  },
})

// ── Main screen ────────────────────────────────────────────────────────────────
export function StashScreen() {
  const insets = useSafeAreaInsets()
  const { sharedStash, depositToStash, withdrawFromStash, setScreen, runStarted } = useGameStore()
  const { bag, addItem, dropItem } = useInventoryStore()
  const [activeTab, setActiveTab] = useState<'bag' | 'stash'>('bag')
  const [actionToast, setActionToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }, [])

  const QUALITY_ORDER: Record<string, number> = { unique: 0, rare: 1, magic: 2, normal: 3 }
  function byQuality(a: Item, b: Item) { return (QUALITY_ORDER[a.quality] ?? 4) - (QUALITY_ORDER[b.quality] ?? 4) }

  const bagItems   = (Object.values(bag.items) as Item[]).filter(it => it.slot !== 'potion').sort(byQuality)
  const stashItems = [...sharedStash].sort(byQuality)

  function handleDeposit(item: Item) {
    const ok = depositToStash(item)
    if (!ok) {
      setActionToast(`Stash full (${MAX_STASH_SIZE} items max)`)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(() => setActionToast(null), 2500)
      return
    }
    dropItem(item.uid)
    setActionToast(`Deposited: ${item.displayName}`)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setActionToast(null), 1800)
  }

  function handleWithdraw(item: Item) {
    const placed = addItem(item)
    if (placed) {
      withdrawFromStash(item.uid)
      setActionToast(`Taken: ${item.displayName}`)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(() => setActionToast(null), 1800)
    }
  }

  const bagFull = freeCells(bag) === 0

  return (
    <View style={[styles.root, { paddingTop: insets.top + 10 }]}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setScreen(runStarted ? 'grid' : 'classSelect')} style={styles.backBtn}>
          <Text style={styles.backText}>← {runStarted ? 'DUNGEON' : 'BACK'}</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>SHARED STASH</Text>
          <Text style={styles.headerSub}>Survives death · Shared across all runs</Text>
        </View>
        <View style={{ width: 70 }} />
      </View>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <TabBar
        active={activeTab}
        onBag={() => setActiveTab('bag')}
        onStash={() => setActiveTab('stash')}
        bagCount={bagItems.length}
        stashCount={stashItems.length}
      />

      {/* ── List ─────────────────────────────────────────────────────────── */}
      {activeTab === 'bag' ? (
        bagItems.length === 0 ? (
          <EmptyState icon="⬡" title="Bag is empty" note="Items you collect during a run appear here" />
        ) : (
          <FlatList
            data={bagItems}
            keyExtractor={it => it.uid}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <ItemCard
                item={item}
                actionLabel="STASH"
                actionColor={COLORS.gold}
                onAction={() => handleDeposit(item)}
              />
            )}
            ListHeaderComponent={
              <Text style={styles.listHint}>
                Tap STASH to deposit an item → it will survive if you die
              </Text>
            }
          />
        )
      ) : (
        stashItems.length === 0 ? (
          <EmptyState icon="⬚" title="Stash is empty" note={"Deposit equipped items here to protect them\nfrom the death sacrifice"} />
        ) : (
          <FlatList
            data={stashItems}
            keyExtractor={it => it.uid}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <ItemCard
                item={item}
                actionLabel={bagFull ? 'BAG FULL' : 'TAKE'}
                actionColor={bagFull ? COLORS.textDim : COLORS.blue}
                onAction={() => handleWithdraw(item)}
                disabled={bagFull}
              />
            )}
            ListHeaderComponent={
              <Text style={styles.listHint}>
                Tap TAKE to move an item into your bag
              </Text>
            }
          />
        )
      )}

      {/* ── Action toast ─────────────────────────────────────────────────── */}
      {actionToast && (
        <View style={styles.actionToast} pointerEvents="none">
          <Text style={styles.actionToastText}>{actionToast}</Text>
        </View>
      )}

      {/* ── Footer tip ───────────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <View style={styles.footerDot} />
          <Text style={styles.footerText}>Stash and equipped gear survive death — only bag items are lost</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface2,
  },
  backBtn: {
    width: 70,
    paddingVertical: 4,
  },
  backText: {
    color: COLORS.textDim,
    fontSize: 11,
    letterSpacing: 1,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  headerTitle: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 4,
  },
  headerSub: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  list: {
    padding: 14,
    paddingBottom: 24,
  },
  listHint: {
    color: COLORS.border2,
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 12,
    lineHeight: 15,
  },
  actionToast: {
    position: 'absolute',
    bottom: 80,
    left: 24,
    right: 24,
    alignItems: 'center',
    zIndex: 50,
  },
  actionToastText: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border2,
    color: COLORS.textSecondary,
    fontSize: 11,
    letterSpacing: 1,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.gold,
    opacity: 0.4,
  },
  footerText: {
    color: COLORS.border2,
    fontSize: 10,
    letterSpacing: 0.5,
    flex: 1,
  },
})
