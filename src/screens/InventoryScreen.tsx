import React, { useState, useRef, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { useInventoryStore, type EquipSlot } from '../store/inventoryStore'
import { useGameStore } from '../store/gameStore'
import { useCombatStore } from '../store/combatStore'
import { getCharmBonuses, freeCells, INV_COLS, INV_ROWS } from '../engine/inventory'
import { TetrisGrid } from '../components/TetrisGrid'
import { EquipmentPanel } from '../components/EquipmentPanel'
import { ItemDetailSheet } from '../components/ItemDetailSheet'
import type { Item } from '../engine/loot'
import { itemEquipSlot } from '../utils/itemDisplay'
import { getHpColor, COLORS } from '../theme'
import { SKILLS, SKILL_GLYPH, type SkillId } from '../data/skills'
import { CLASSES } from '../data/classes'
import { useSafeAreaInsets } from 'react-native-safe-area-context'


type SheetSource = 'bag' | 'equipped'
interface SheetState {
  item: Item
  source: SheetSource
  equipSlot?: EquipSlot
}

export function InventoryScreen() {
  const insets = useSafeAreaInsets()
  const { bag, equipped, magicFind, equipItem, unequipSlot, moveItem, dropItem, insertRune, consumePotion, agglomeratePotions } = useInventoryStore()
  const { setScreen, playerHp, playerMaxHp, setPlayerHp, restoreMana, runStarted, mana, maxMana, level, classId } = useGameStore()
  const pendingLoot = useCombatStore(s => s.pendingLoot)

  const classDef    = classId ? CLASSES.find(c => c.id === classId) : null
  const classColor  = classDef?.color ?? COLORS.textDim
  const classSkills = classId ? SKILLS.filter(s => s.classId === classId) : []

  // Include life bonuses from equipped items (same as buildPlayerStats in combat)
  const equippedLifeBonus = Object.values(equipped).reduce((sum, item) =>
    sum + ((item?.effectiveStats as Record<string, number> | undefined)?.life ?? 0), 0)
  const effectiveMaxHp = playerMaxHp + equippedLifeBonus

  const hpPct = Math.min(1, Math.max(0, playerHp / effectiveMaxHp))
  const mpPct = maxMana > 0 ? Math.min(1, Math.max(0, mana / maxMana)) : 0
  const hpColor = getHpColor(hpPct)

  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [dragSlot, setDragSlot] = useState<EquipSlot | null>(null)
  const [runewordToast, setRunewordToast] = useState<string | null>(null)
  const [actionToast,   setActionToast]   = useState<{ msg: string; ok: boolean } | null>(null)
  const toastTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actionToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (toastTimerRef.current)       clearTimeout(toastTimerRef.current)
    if (actionToastTimerRef.current) clearTimeout(actionToastTimerRef.current)
  }, [])

  function showActionToast(msg: string, ok: boolean) {
    setActionToast({ msg, ok })
    if (actionToastTimerRef.current) clearTimeout(actionToastTimerRef.current)
    actionToastTimerRef.current = setTimeout(() => setActionToast(null), 2000)
  }

  const bagSocketables = Object.values(bag.items).filter(it => it.slot === 'rune' || it.slot === 'gem')

  const totalCells = INV_COLS * INV_ROWS
  const used = totalCells - freeCells(bag)
  const charmBonuses = getCharmBonuses(bag)
  const charmEntries = Object.entries(charmBonuses).filter(([, v]) => v > 0)

  // Tap item in bag → show detail sheet
  function handleBagTap(uid: string) {
    const item = bag.items[uid]
    if (item) setSheet({ item, source: 'bag' })
  }

  // Drag item from bag to equip zone — potions are used immediately
  function handleBagEquip(uid: string) {
    const item = bag.items[uid]
    if (!item) return
    if (item.slot === 'potion') {
      if (item.baseId === 'hp_potion') {
        consumePotion(uid)
        setPlayerHp(Math.min(playerMaxHp, playerHp + ((item.effectiveStats as Record<string, number>).heal ?? 30)))
      } else if (item.baseId === 'mana_potion') {
        consumePotion(uid)
        restoreMana(40)
      }
    } else if (item.slot !== 'rune' && item.slot !== 'gem' && item.slot !== 'charm') {
      const ok = equipItem(uid)
      if (!ok) showActionToast('Bag full — can\'t equip', false)
    }
  }

  // Tap slot in equipment panel → show detail sheet for equipped item
  function handleEquipSlotTap(slot: EquipSlot) {
    const item = equipped[slot]
    if (item) setSheet({ item, source: 'equipped', equipSlot: slot })
  }

  function closeSheet() { setSheet(null) }

  // Sheet actions
  function handleSheetEquip() {
    if (!sheet || sheet.source !== 'bag') return
    const ok = equipItem(sheet.item.uid)
    if (ok) {
      showActionToast(`Equipped: ${sheet.item.displayName}`, true)
      closeSheet()
    } else {
      showActionToast('Bag full — can\'t equip', false)
    }
  }

  function handleSheetUnequip() {
    if (!sheet || sheet.source !== 'equipped' || !sheet.equipSlot) return
    const ok = unequipSlot(sheet.equipSlot)
    if (ok) {
      closeSheet()
    } else {
      showActionToast('Bag full — can\'t unequip', false)
    }
  }

  function handleSheetDrop() {
    if (!sheet || sheet.source !== 'bag') return
    dropItem(sheet.item.uid)
    closeSheet()
  }

  function handleSheetUse() {
    if (!sheet || sheet.source !== 'bag') return
    const item = sheet.item
    if (item.baseId === 'hp_potion') {
      consumePotion(item.uid)
      setPlayerHp(Math.min(playerMaxHp, playerHp + 30))
    } else if (item.baseId === 'mana_potion') {
      consumePotion(item.uid)
      restoreMana(40)
    }
    closeSheet()
  }

  function handleAgglomerate() {
    const freed = agglomeratePotions()
    if (freed === 0) {
      showActionToast('Nothing to agglomerate', false)
    } else {
      showActionToast(`Agglomerated — ${freed} slot${freed > 1 ? 's' : ''} freed`, true)
    }
  }

  function handleInsertRune(runeUid: string) {
    if (!sheet) return
    const activated = insertRune(sheet.item.uid, runeUid)
    // Re-sync sheet item from store (Zustand updates are synchronous)
    const freshState = useInventoryStore.getState()
    const freshItem =
      freshState.bag.items[sheet.item.uid] ??
      Object.values(freshState.equipped).find(it => it?.uid === sheet.item.uid)
    if (freshItem) {
      setSheet(s => s ? { ...s, item: freshItem } : null)
      if (activated) {
        setRunewordToast(`★ ${freshItem.displayName.toUpperCase()} — runeword activated!`)
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        toastTimerRef.current = setTimeout(() => setRunewordToast(null), 3500)
      } else {
        const filled  = freshItem.insertedRunes.length
        const total   = freshItem.sockets
        setRunewordToast(`Rune inserted (${filled}/${total} sockets filled)`)
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        toastTimerRef.current = setTimeout(() => setRunewordToast(null), 2500)
      }
    }
  }

  // Compare: bag item → what's currently equipped in same slot
  const compareWith: Item | null = (() => {
    if (!sheet || sheet.source !== 'bag') return null
    const slot = itemEquipSlot(sheet.item)
    if (!slot) return null
    return equipped[slot] ?? (slot === 'ring1' ? equipped.ring2 ?? null : null)
  })()

  const isPotion = sheet?.source === 'bag' && sheet.item.slot === 'potion'

  const canEquip =
    sheet?.source === 'bag' &&
    sheet.item.slot !== 'rune' &&
    sheet.item.slot !== 'charm' &&
    sheet.item.slot !== 'potion'

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        {!runStarted && (
          <TouchableOpacity
            onPress={() => setScreen('classSelect')}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          >
            <Text style={styles.backBtn}>← MENU</Text>
          </TouchableOpacity>
        )}
        {runStarted && <View style={{ width: 60 }} />}
        <Text style={styles.title}>CHARACTER</Text>
        <TouchableOpacity
          onPress={() => setScreen(pendingLoot.length > 0 ? 'loot' : runStarted ? 'grid' : 'classSelect')}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        >
          <Text style={styles.closeBtn}>{runStarted ? '✕ CLOSE' : ''}</Text>
        </TouchableOpacity>
      </View>

      {/* HP / Mana bars */}
      <View style={styles.vitalsRow}>
        <View style={styles.vitalGroup}>
          <View style={styles.vitalLabelRow}>
            <Text style={[styles.vitalLabel, { color: hpColor }]}>HP</Text>
            <Text style={styles.vitalValue}>{playerHp} / {effectiveMaxHp}{equippedLifeBonus > 0 ? <Text style={styles.vitalBonus}> +{equippedLifeBonus}</Text> : null}</Text>
          </View>
          <View style={styles.vitalTrack}>
            <View style={[styles.vitalFill, { width: `${hpPct * 100}%`, backgroundColor: hpColor }]} />
          </View>
        </View>
        {maxMana > 0 && (
          <View style={styles.vitalGroup}>
            <View style={styles.vitalLabelRow}>
              <Text style={[styles.vitalLabel, { color: COLORS.manaBar }]}>MP</Text>
              <Text style={styles.vitalValue}>{mana} / {maxMana}</Text>
            </View>
            <View style={styles.vitalTrack}>
              <View style={[styles.vitalFill, { width: `${mpPct * 100}%`, backgroundColor: COLORS.manaBar }]} />
            </View>
          </View>
        )}
      </View>

      {/* ── Stat line (level · MF) ──────────────────────────────────────── */}
      <View style={styles.statLine}>
        <Text style={styles.statPiece}>
          <Text style={styles.statLabel}>LVL </Text>
          <Text style={styles.statValue}>{level}</Text>
        </Text>
        {magicFind > 0 && (
          <>
            <Text style={styles.statDot}>·</Text>
            <Text style={styles.statPiece}>
              <Text style={styles.statLabel}>MF </Text>
              <Text style={[styles.statValue, { color: COLORS.gold }]}>{magicFind}%</Text>
            </Text>
          </>
        )}
      </View>

      {/* ── Skills strip ─────────────────────────────────────────────────── */}
      {classSkills.length > 0 && (
        <View style={styles.skillsStrip}>
          <Text style={[styles.skillsStripLabel, { color: classColor }]}>
            {classDef?.name?.toUpperCase() ?? 'SKILLS'}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.skillsRow}>
            {classSkills.map(skill => {
              const isLocked = level < skill.levelRequired
              const glyph    = SKILL_GLYPH[skill.id] ?? '·'
              return (
                <View
                  key={skill.id}
                  style={[
                    styles.skillChip,
                    { borderColor: isLocked ? COLORS.border : classColor + '55' },
                    !isLocked && { backgroundColor: classColor + '0d' },
                  ]}
                >
                  <Text style={[styles.skillChipGlyph, { color: isLocked ? COLORS.textGhost : classColor }]}>
                    {glyph}
                  </Text>
                  <Text style={[styles.skillChipName, { color: isLocked ? COLORS.textGhost : COLORS.textSecondary }]}>
                    {skill.name}
                  </Text>
                  {isLocked ? (
                    <Text style={[styles.skillChipMeta, { color: COLORS.textDim }]}>L{skill.levelRequired}</Text>
                  ) : skill.manaCost > 0 ? (
                    <Text style={[styles.skillChipMeta, { color: COLORS.manaBar }]}>{skill.manaCost} MP</Text>
                  ) : (
                    <Text style={[styles.skillChipMeta, { color: COLORS.textDim }]}>free</Text>
                  )}
                </View>
              )
            })}
          </ScrollView>
        </View>
      )}

      <View style={styles.body}>
        {/* Equipped */}
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionLabelText}>EQUIPPED</Text>
        </View>
        <EquipmentPanel equipped={equipped} onSlotTap={handleEquipSlotTap} highlightSlot={dragSlot} />
        {charmEntries.length > 0 && (
          <View style={styles.charmBar}>
            <Text style={styles.charmTitle}>CHARMS  </Text>
            {charmEntries.map(([k, v]) => (
              <Text key={k} style={styles.charmStat}>+{v} {k}  </Text>
            ))}
          </View>
        )}

        {/* Bag */}
        <View style={[styles.sectionLabel, { marginTop: 12 }]}>
          <Text style={styles.sectionLabelText}>BAG  <Text style={styles.sectionLabelCount}>{used}/{totalCells}</Text></Text>
          {equipped.belt && (
            <TouchableOpacity style={styles.agglomerateBtn} onPress={handleAgglomerate}>
              <Text style={styles.agglomerateBtnText}>⚗ AGGLOMERATE</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.bagHint}>Tap to inspect · Drag to move · Drag up to equip · Drag down to drop</Text>
        <TetrisGrid
          grid={bag}
          onMove={moveItem}
          onDrop={dropItem}
          onTap={handleBagTap}
          onEquip={handleBagEquip}
          onDragSlot={setDragSlot}
        />
      </View>

      {/* Item detail sheet */}
      {sheet && (
        <ItemDetailSheet
          item={sheet.item}
          compareWith={compareWith}
          isEquipped={sheet.source === 'equipped'}
          onUse={isPotion ? handleSheetUse : undefined}
          onEquip={canEquip ? handleSheetEquip : undefined}
          onUnequip={sheet.source === 'equipped' ? handleSheetUnequip : undefined}
          onDrop={sheet.source === 'bag' ? handleSheetDrop : undefined}
          onClose={closeSheet}
          bagSocketables={bagSocketables}
          onInsertRune={handleInsertRune}
        />
      )}

      {/* Runeword activation toast */}
      {runewordToast && (
        <View style={styles.runewordToast} pointerEvents="none">
          <Text style={styles.runewordToastText} numberOfLines={2}>{runewordToast}</Text>
        </View>
      )}

      {/* Equip action toast */}
      {actionToast && (
        <View style={[styles.actionToast, actionToast.ok ? styles.actionToastOk : styles.actionToastFail]} pointerEvents="none">
          <Text style={[styles.actionToastText, actionToast.ok ? styles.actionToastTextOk : styles.actionToastTextFail]}>
            {actionToast.msg}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 5,
  },
  backBtn: {
    color: COLORS.textDim,
    fontSize: 12,
    letterSpacing: 1,
    width: 60,
  },
  closeBtn: {
    color: COLORS.textDim,
    fontSize: 12,
    letterSpacing: 1,
    width: 60,
    textAlign: 'right',
  },
  vitalsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  vitalGroup: {
    flex: 1,
    gap: 3,
  },
  vitalLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vitalLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  vitalValue: {
    color: COLORS.textDim,
    fontSize: 10,
    letterSpacing: 0.2,
  },
  vitalBonus: {
    color: COLORS.hpHigh,
    fontSize: 9,
    fontWeight: '700',
  },
  vitalTrack: {
    height: 8,
    backgroundColor: COLORS.surface2,
    borderRadius: 2,
    overflow: 'hidden',
  },
  vitalFill: {
    height: '100%',
    borderRadius: 3,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 6,
    marginBottom: 10,
  },
  sectionLabelText: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 3,
  },
  sectionLabelCount: {
    color: COLORS.textDim,
    fontWeight: '400',
    letterSpacing: 0,
  },
  bagHint: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  agglomerateBtn: {
    borderWidth: 1,
    borderColor: COLORS.gold + '55',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: COLORS.goldDim,
  },
  agglomerateBtnText: {
    color: COLORS.gold,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  charmBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    alignItems: 'center',
  },
  charmTitle: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 1,
  },
  charmStat: {
    color: COLORS.blue,
    fontSize: 10,
  },
  // ── Stat line ─────────────────────────────────────────────────────────────
  statLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  statPiece: {},
  statLabel: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  statValue: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  statDot: {
    color: COLORS.border2,
    fontSize: 9,
  },
  // ── Skills strip ───────────────────────────────────────────────────────────
  skillsStrip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 6,
  },
  skillsStripLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 2,
  },
  skillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  skillChip: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    gap: 2,
    minWidth: 64,
  },
  skillChipGlyph: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 15,
  },
  skillChipName: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  skillChipMeta: {
    fontSize: 8,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  runewordToast: {
    position: 'absolute',
    bottom: 90,
    left: 24,
    right: 24,
    backgroundColor: COLORS.goldDim,
    borderWidth: 1,
    borderColor: COLORS.runewordColor,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    zIndex: 200,
  },
  runewordToastText: {
    color: COLORS.runewordColor,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  actionToast: {
    position: 'absolute',
    bottom: 130,
    left: 24,
    right: 24,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    zIndex: 200,
  },
  actionToastOk:   { backgroundColor: 'rgba(74,222,128,0.12)', borderColor: 'rgba(74,222,128,0.4)' },
  actionToastFail: { backgroundColor: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.4)' },
  actionToastText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textAlign: 'center' },
  actionToastTextOk:   { color: COLORS.green },
  actionToastTextFail: { color: COLORS.red },
})
