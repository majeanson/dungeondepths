import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useGameStore } from '../store/gameStore'
import { useInventoryStore, type EquipSlot } from '../store/inventoryStore'
import { buildPlayerStats } from '../engine/stats'
import { CLASSES } from '../data/classes'
import { ItemDetailSheet } from '../components/ItemDetailSheet'
import { EquipmentPanel } from '../components/EquipmentPanel'
import { TetrisGrid } from '../components/TetrisGrid'
import type { Item } from '../engine/loot'
import { CraftingScreen } from './CraftingScreen'
import { getCharmBonuses, freeCells, INV_COLS, INV_ROWS } from '../engine/inventory'
import { QUALITY_COLOR, QUALITY_BG, SLOT_ICON, itemSummary, itemEquipSlot } from '../utils/itemDisplay'
import { COLORS } from '../theme'

type OuterTab = 'character' | 'stash' | 'cube'
type SheetSource = 'bag' | 'equipped' | 'stash'
interface SheetState { item: Item; source: SheetSource; equipSlot?: EquipSlot }

function StashItem({
  item, actionLabel, actionColor, onAction, onPreview, disabled,
}: {
  item: Item; actionLabel: string; actionColor: string
  onAction: () => void; onPreview: () => void; disabled?: boolean
}) {
  const qColor = QUALITY_COLOR[item.quality] ?? COLORS.textSecondary
  const qBg    = QUALITY_BG[item.quality]    ?? COLORS.card
  const icon   = SLOT_ICON[item.slot] ?? '·'
  return (
    <TouchableOpacity
      style={[rowStyles.row, { backgroundColor: qBg, borderColor: qColor + '33' }]}
      onPress={onPreview}
      activeOpacity={0.8}
    >
      <View style={[rowStyles.iconBox, { borderColor: qColor + '44' }]}>
        <Text style={rowStyles.icon}>{icon}</Text>
      </View>
      <View style={rowStyles.info}>
        <Text style={[rowStyles.name, { color: qColor }]} numberOfLines={1}>{item.displayName}</Text>
        <Text style={rowStyles.meta} numberOfLines={1}>{itemSummary(item)}</Text>
      </View>
      <TouchableOpacity
        style={[rowStyles.btn, { borderColor: disabled ? COLORS.border : actionColor }, disabled && { opacity: 0.35 }]}
        onPress={onAction}
        disabled={disabled}
        hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
      >
        <Text style={[rowStyles.btnText, { color: disabled ? COLORS.textDim : actionColor }]}>{actionLabel}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  )
}

const rowStyles = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, padding: 10, gap: 10, marginBottom: 6 },
  iconBox: { width: 34, height: 34, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  icon:    { fontSize: 16 },
  info:    { flex: 1, gap: 2 },
  name:    { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  meta:    { color: COLORS.textDim, fontSize: 10 },
  btn:     { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  btnText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
})

export function TownScreen() {
  const insets = useSafeAreaInsets()
  const {
    setScreen, sharedStash, classId, level, floor, xp, maxMana,
    equipFromStash, unequipToStash, depositToStash, withdrawFromStash,
    playerHp, playerMaxHp, setPlayerHp, restoreMana, setReturnedFromTown,
    runStarted,
  } = useGameStore()
  const { equipped, equipItem, unequipSlot, addItem, bag, moveItem, dropItem } = useInventoryStore()

  const classDef = classId ? CLASSES.find(c => c.id === classId) : null
  const stats    = buildPlayerStats(floor, level, equipped, classId)

  const [tab,   setTab]   = useState<OuterTab>('character')
  const [sheet, setSheet] = useState<SheetState | null>(null)

  const totalCells = INV_COLS * INV_ROWS
  const bagUsed    = totalCells - freeCells(bag)
  const bagItems   = Object.values(bag.items) as Item[]
  const charmBonuses  = getCharmBonuses(bag)
  const charmEntries  = Object.entries(charmBonuses).filter(([, v]) => v > 0)
  const equippableSlots = ['weapon','offhand','helmet','chest','gloves','legs','boots','ring','ring1','ring2','amulet']

  // ── Sheet actions ──────────────────────────────────────────────────────────
  function closeSheet() { setSheet(null) }

  function handleSheetEquip() {
    if (!sheet || sheet.source !== 'bag') return
    equipItem(sheet.item.uid)
    closeSheet()
  }
  function handleSheetUnequip() {
    if (!sheet || sheet.source !== 'equipped' || !sheet.equipSlot) return
    unequipSlot(sheet.equipSlot)
    closeSheet()
  }
  function handleSheetDrop() {
    if (!sheet || sheet.source !== 'bag') return
    dropItem(sheet.item.uid)
    closeSheet()
  }
  function handleSheetStash() {
    if (!sheet || sheet.source !== 'bag') return
    depositToStash(sheet.item)
    dropItem(sheet.item.uid)
    closeSheet()
  }
  function handleSheetUse() {
    if (!sheet || sheet.source !== 'bag') return
    const item = sheet.item
    if (item.baseId === 'hp_potion') {
      dropItem(item.uid)
      setPlayerHp(Math.min(playerMaxHp, playerHp + 30))
    } else if (item.baseId === 'mana_potion') {
      dropItem(item.uid)
      restoreMana(40)
    }
    closeSheet()
  }
  function handleUnequipToStash(slot: EquipSlot) { unequipToStash(slot); closeSheet() }
  function handleWithdrawToBag(item: Item) {
    const ok = addItem(item)
    if (ok) withdrawFromStash(item.uid)
  }

  const isPotion = sheet?.source === 'bag' && sheet.item.slot === 'potion'
  const canEquip = sheet?.source === 'bag'
    && sheet.item.slot !== 'rune'
    && sheet.item.slot !== 'charm'
    && sheet.item.slot !== 'potion'

  const compareWith: Item | null = (() => {
    if (!sheet || sheet.source !== 'bag') return null
    const slot = itemEquipSlot(sheet.item)
    if (!slot) return null
    return equipped[slot] ?? (slot === 'ring1' ? equipped.ring2 ?? null : null)
  })()

  return (
    <View style={styles.root}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => { setReturnedFromTown(true); setScreen('grid') }} style={styles.backBtn}>
          <Text style={styles.backText}>← MAP</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>TOWN</Text>
        {!runStarted ? (
          <TouchableOpacity onPress={() => setScreen('classSelect')} style={styles.switchBtn}>
            <Text style={styles.switchText}>SWITCH CLASS</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 90 }} />
        )}
      </View>

      {/* ── Character card ─────────────────────────────────────────────── */}
      <View style={[styles.charCard, { borderColor: classDef?.color ? classDef.color + '55' : COLORS.border }]}>
        <View style={styles.charLeft}>
          <View style={styles.charNameRow}>
            {classDef && <View style={[styles.classDot, { backgroundColor: classDef.color }]} />}
            <Text style={[styles.charClass, { color: classDef?.color ?? COLORS.textSecondary }]}>
              {classDef?.name.toUpperCase() ?? 'NO CLASS'}
            </Text>
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>LVL {level}</Text>
            </View>
          </View>
          {classDef && (
            <Text style={styles.charFlavor} numberOfLines={1}>{classDef.flavor}</Text>
          )}
        </View>
        <View style={styles.statGrid}>
          <StatChip label="HP"  value={`${stats.hp}`}                         color={COLORS.red} />
          <StatChip label="MP"  value={`${maxMana}`}                          color={COLORS.blue} />
          <StatChip label="DMG" value={`${stats.damage[0]}-${stats.damage[1]}`} color="#e8c84a" />
          <StatChip label="DEF" value={`${stats.defense}`}                    color={COLORS.green} />
          <StatChip label="CRIT" value={`${stats.critChance}%`}               color="#f39c12" />
          {(stats.spellPower ?? 0) > 0 && <StatChip label="SP" value={`${stats.spellPower}`} color={COLORS.purple} />}
        </View>
      </View>

      {/* ── Tab bar ────────────────────────────────────────────────────── */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'character' && styles.tabActive]}
          onPress={() => setTab('character')}
        >
          <Text style={[styles.tabText, tab === 'character' && styles.tabTextActive]}>CHARACTER</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'stash' && styles.tabActive]}
          onPress={() => setTab('stash')}
        >
          <Text style={[styles.tabText, tab === 'stash' && styles.tabTextActive]}>
            STASH {sharedStash.length > 0 ? `(${sharedStash.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'cube' && styles.tabActive]}
          onPress={() => setTab('cube')}
        >
          <Text style={[styles.tabText, tab === 'cube' && styles.tabTextActive]}>CUBE</Text>
        </TouchableOpacity>
      </View>

      {/* ── CUBE tab renders outside ScrollView (has its own scroll) ─── */}
      {tab === 'cube' && (
        <View style={{ flex: 1 }}>
          <CraftingScreen />
        </View>
      )}

      {/* ── CHARACTER tab — inner tabs + panel ─────────────────────────── */}
      {tab === 'character' && (
        <View style={styles.charBody}>
          {/* Equipped */}
          <View style={styles.charSectionLabel}>
            <Text style={styles.charSectionLabelText}>EQUIPPED</Text>
          </View>
          <EquipmentPanel
            equipped={equipped}
            onSlotTap={slot => {
              const item = equipped[slot]
              if (item) setSheet({ item, source: 'equipped', equipSlot: slot })
            }}
          />
          {charmEntries.length > 0 && (
            <View style={styles.charmBar}>
              <Text style={styles.charmTitle}>CHARMS  </Text>
              {charmEntries.map(([k, v]) => (
                <Text key={k} style={styles.charmStat}>+{v} {k}  </Text>
              ))}
            </View>
          )}

          {/* Bag */}
          <View style={[styles.charSectionLabel, { marginTop: 12 }]}>
            <Text style={styles.charSectionLabelText}>BAG  <Text style={styles.charSectionCount}>{bagUsed}/{totalCells}</Text></Text>
          </View>
          <Text style={styles.bagHint}>Tap to inspect · Drag to move · Drag up to equip</Text>
          <TetrisGrid
            grid={bag}
            onMove={moveItem}
            onDrop={dropItem}
            onTap={uid => {
              const item = bag.items[uid]
              if (item) setSheet({ item, source: 'bag' })
            }}
            onEquip={uid => {
              const item = bag.items[uid]
              if (!item) return
              if (item.slot === 'potion') {
                if (item.baseId === 'hp_potion') { dropItem(uid); setPlayerHp(Math.min(playerMaxHp, playerHp + 30)) }
                else if (item.baseId === 'mana_potion') { dropItem(uid); restoreMana(40) }
              } else if (item.slot !== 'rune' && item.slot !== 'charm') {
                equipItem(uid)
              }
            }}
          />
        </View>
      )}

      {/* ── STASH tab ──────────────────────────────────────────────────── */}
      {tab === 'stash' && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Deposit: bag → stash */}
          <Text style={styles.stashSectionLabel}>BAG  <Text style={styles.stashSectionCount}>{bagItems.length}</Text></Text>
          {bagItems.length === 0 ? (
            <Text style={styles.emptyNote}>Your bag is empty.</Text>
          ) : (
            bagItems.map(item => (
              <StashItem
                key={item.uid}
                item={item}
                actionLabel="STASH"
                actionColor={COLORS.gold}
                onAction={() => { depositToStash(item); dropItem(item.uid) }}
                onPreview={() => setSheet({ item, source: 'bag' })}
              />
            ))
          )}

          {/* Withdraw: stash → bag / equip */}
          <Text style={[styles.stashSectionLabel, { marginTop: 16 }]}>IN STASH  <Text style={styles.stashSectionCount}>{sharedStash.length}</Text></Text>
          {sharedStash.length === 0 ? (
            <Text style={styles.emptyNote}>Stash is empty — survives death.</Text>
          ) : (
            sharedStash.map(item => {
              const isEquippable  = equippableSlots.includes(item.slot)
              const ringSlotsFull = item.slot === 'ring' && !!equipped.ring1 && !!equipped.ring2
              return (
                <StashItem
                  key={item.uid}
                  item={item}
                  actionLabel={isEquippable ? 'EQUIP' : 'BAG'}
                  actionColor={isEquippable ? COLORS.green : COLORS.blue}
                  onAction={() => isEquippable ? equipFromStash(item.uid) : handleWithdrawToBag(item)}
                  onPreview={() => setSheet({ item, source: 'stash' })}
                  disabled={ringSlotsFull}
                />
              )
            })
          )}
        </ScrollView>
      )}

      {/* ── Item detail sheet ──────────────────────────────────────────── */}
      {sheet && (
        <ItemDetailSheet
          item={sheet.item}
          compareWith={compareWith}
          isEquipped={sheet.source === 'equipped'}
          onUse={isPotion ? handleSheetUse : undefined}
          onEquip={canEquip ? handleSheetEquip : undefined}
          onUnequip={sheet.source === 'equipped'
            ? () => handleUnequipToStash(sheet.equipSlot!)
            : undefined}
          onStash={sheet.source === 'bag' ? handleSheetStash : undefined}
          onDrop={sheet.source === 'bag' ? handleSheetDrop : undefined}
          onClose={closeSheet}
        />
      )}
    </View>
  )
}

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={chipStyles.chip}>
      <Text style={chipStyles.label}>{label}</Text>
      <Text style={[chipStyles.value, { color }]}>{value}</Text>
    </View>
  )
}
const chipStyles = StyleSheet.create({
  chip:  { alignItems: 'center', minWidth: 44 },
  label: { color: COLORS.textDim, fontSize: 8, letterSpacing: 1, marginBottom: 2 },
  value: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
})

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.surface2,
  },
  backBtn:    { paddingVertical: 4, width: 60 },
  backText:   { color: COLORS.textDim, fontSize: 12, letterSpacing: 1 },
  headerTitle:{ flex: 1, color: COLORS.gold, fontSize: 16, fontWeight: '900', letterSpacing: 5, textAlign: 'center' },
  switchBtn:  { width: 90, alignItems: 'flex-end' },
  switchText: { color: COLORS.textDim, fontSize: 10, letterSpacing: 0.5 },

  charCard: {
    margin: 14, marginBottom: 0,
    backgroundColor: COLORS.card,
    borderWidth: 1, borderRadius: 10,
    padding: 14, gap: 12,
  },
  charLeft:    { gap: 4 },
  charNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  classDot:    { width: 8, height: 8, borderRadius: 4 },
  charClass:   { fontSize: 18, fontWeight: '900', letterSpacing: 4, flex: 1 },
  charFlavor:  { color: COLORS.textDim, fontSize: 10, fontStyle: 'italic' },
  levelBadge:  { backgroundColor: COLORS.surface, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  levelText:   { color: COLORS.textSecondary, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  statGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },

  tabs: {
    flexDirection: 'row',
    marginHorizontal: 14, marginTop: 14,
    borderRadius: 8, backgroundColor: COLORS.card, padding: 3,
    borderWidth: 1, borderColor: COLORS.border,
  },
  tab:          { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  tabActive:    { backgroundColor: COLORS.surface },
  tabText:      { color: COLORS.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  tabTextActive:{ color: COLORS.gold },

  // CHARACTER tab
  charBody: { flex: 1, paddingHorizontal: 14, paddingTop: 10 },
  charScroll: { flex: 1 },
  charScrollContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40 },
  charSectionLabel: {
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingBottom: 6, marginBottom: 10,
  },
  charSectionLabelText: {
    color: COLORS.gold, fontSize: 11, fontWeight: '900', letterSpacing: 3,
  },
  charSectionCount: { color: COLORS.textSecondary, fontWeight: '400', letterSpacing: 0 },
  bagHint:          { color: COLORS.textDim, fontSize: 9, letterSpacing: 0.3, marginBottom: 8 },
  charmBar: {
    flexDirection: 'row', flexWrap: 'wrap',
    marginTop: 10, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    alignItems: 'center',
  },
  charmTitle: { color: COLORS.textDim, fontSize: 9, letterSpacing: 1 },
  charmStat:  { color: COLORS.blue, fontSize: 10 },

  // STASH tab
  scroll:             { flex: 1, marginTop: 12 },
  scrollContent:      { paddingHorizontal: 14, paddingBottom: 40 },
  emptyNote:          { color: COLORS.textDim, fontSize: 11, textAlign: 'center', marginVertical: 10, lineHeight: 18 },
  stashSectionLabel:  { color: COLORS.gold, fontSize: 10, fontWeight: '900', letterSpacing: 3, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 6, marginBottom: 8 },
  stashSectionCount:  { color: COLORS.textSecondary, fontWeight: '400', letterSpacing: 0 },
})
