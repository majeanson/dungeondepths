import React, { useState, useRef, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated, ScrollView, Alert } from 'react-native'
import { useFadeTransition } from '../hooks/useFadeTransition'
import { useCombatStore } from '../store/combatStore'
import { useGameStore } from '../store/gameStore'
// Stash is only accessible in town (StashScreen) — not from loot drops in the dungeon
import { useInventoryStore, type EquipSlot } from '../store/inventoryStore'
import { ItemCard } from '../components/ItemCard'
import { ItemDetailSheet } from '../components/ItemDetailSheet'
import type { Item } from '../engine/loot'
import { EncounterType } from '../engine/encounter'
import { itemEquipSlot } from '../utils/itemDisplay'
import { COLORS } from '../theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useHaptics } from '../hooks/useHaptics'

// ── Staggered entrance wrapper for each loot row ──────────────────────────────
function AnimatedLootRow({ index, children }: { index: number; children: React.ReactNode }) {
  const slideAnim = useRef(new Animated.Value(-28)).current
  const fadeAnim  = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const delay = index * 55
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 300, delay, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 240, delay, useNativeDriver: true }),
    ]).start()
  }, [])
  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {children}
    </Animated.View>
  )
}

const ENCOUNTER_TITLES: Partial<Record<EncounterType, string>> = {
  [EncounterType.Elite]:   'ELITE DROP',
  [EncounterType.Rare]:    'RARE DROP',
  [EncounterType.Ancient]: 'ANCIENT DROP',
  [EncounterType.Chest]:   'CHEST OPENED',
  [EncounterType.Boss]:    '💀 BOSS LOOT',
}

const ENCOUNTER_TITLE_COLORS: Partial<Record<EncounterType, string>> = {
  [EncounterType.Boss]:    COLORS.red,
  [EncounterType.Ancient]: COLORS.runewordColor,
  [EncounterType.Rare]:    COLORS.gold,
  [EncounterType.Elite]:   COLORS.blue,
  [EncounterType.Chest]:   COLORS.green,
  [EncounterType.Shrine]:  COLORS.purple,
}

export function LootScreen() {
  const insets = useSafeAreaInsets()
  const { pendingLoot, clearCombat, encounterType } = useCombatStore()
  const { setScreen, recordItemFound, careerStats } = useGameStore()
  const { addItem, equipped } = useInventoryStore()
  const studiedBonuses: string[] = careerStats?.studiedBonuses ?? []

  const titleLabel = (encounterType && ENCOUNTER_TITLES[encounterType]) ?? 'ITEMS DROPPED'
  const titleColor = (encounterType && ENCOUNTER_TITLE_COLORS[encounterType]) ?? COLORS.textSecondary

  const fadeIn  = useFadeTransition(250)
  const haptics = useHaptics()
  const [pickedUp,   setPickedUp]   = useState<Set<string>>(new Set())
  const [sheetItem,  setSheetItem]  = useState<Item | null>(null)

  const isBoss    = encounterType === EncounterType.Boss
  const isAncient = encounterType === EncounterType.Ancient

  // Boss/Ancient: header scale punch on mount
  const headerScaleAnim = useRef(new Animated.Value(isBoss || isAncient ? 0.80 : 1)).current
  const headerFadeAnim  = useRef(new Animated.Value(isBoss || isAncient ? 0   : 1)).current
  useEffect(() => {
    if (!isBoss && !isAncient) return
    Animated.parallel([
      Animated.spring(headerScaleAnim, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }),
      Animated.timing(headerFadeAnim,  { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start()
  }, [])

  const hasUnique = pendingLoot.some(i => i.quality === 'unique')
  const uniquePulse = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    if (!hasUnique) return
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(uniquePulse, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(uniquePulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [hasUnique])

  // Rare study bonus: pulse banner when rare items drop
  const hasRareDrop = studiedBonuses.includes('rare') && pendingLoot.some(i => i.quality === 'rare')
  const rarePulse = useRef(new Animated.Value(0.3)).current
  useEffect(() => {
    if (!hasRareDrop) return
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(rarePulse, { toValue: 0.9, duration: 1100, useNativeDriver: true }),
        Animated.timing(rarePulse, { toValue: 0.2, duration: 1100, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [hasRareDrop])

  function handlePickUp(item: Item) {
    const ok = addItem(item)
    if (!ok) {
      Alert.alert(
        'BAG FULL',
        `No room for ${item.displayName}. Open your bag to make space?`,
        [
          { text: 'Leave It', style: 'cancel' },
          { text: 'Open Bag', onPress: () => setScreen('inventory') },
        ],
      )
    } else {
      haptics.impactLight()
      recordItemFound(item.quality)
      setPickedUp(prev => new Set(prev).add(item.uid))
    }
  }

  function handlePickUpAll() {
    let bagFullShown = false
    for (const item of pendingLoot) {
      if (!pickedUp.has(item.uid)) {
        const ok = addItem(item)
        if (ok) {
          recordItemFound(item.quality)
          setPickedUp(prev => new Set(prev).add(item.uid))
        } else if (!bagFullShown) {
          bagFullShown = true
          Alert.alert(
            'BAG FULL',
            'No room for remaining items. Open your bag to make space?',
            [
              { text: 'Leave Them', style: 'cancel' },
              { text: 'Open Bag', onPress: () => setScreen('inventory') },
            ],
          )
        }
      }
    }
  }

  function handleDone() {
    clearCombat()
    setScreen('grid')
  }

  const allPicked = pendingLoot.length > 0 && pendingLoot.every(i => pickedUp.has(i.uid))

  const compareWith: Item | null = sheetItem
    ? (() => {
        const slot = itemEquipSlot(sheetItem)
        if (!slot) return null
        return equipped[slot] ?? (slot === 'ring1' ? equipped.ring2 ?? null : null)
      })()
    : null

  const isBigDrop = isBoss || isAncient || encounterType === EncounterType.Rare

  return (
    <Animated.View style={[styles.container, { opacity: fadeIn, paddingTop: insets.top + 10 }]}>
      {/* Boss/Ancient: screen-edge red vignette */}
      {(isBoss || isAncient) && (
        <Animated.View
          style={[styles.bossVignette, { opacity: headerFadeAnim, borderColor: titleColor }]}
          pointerEvents="none"
        />
      )}

      <Animated.View style={[styles.titleBlock, { borderBottomColor: titleColor + '55' },
        (isBoss || isAncient) && { opacity: headerFadeAnim, transform: [{ scale: headerScaleAnim }] },
      ]}>
        <Text style={[
          styles.title,
          { color: titleColor },
          isBigDrop && styles.titleBig,
        ]}>
          {titleLabel}
        </Text>
        {pendingLoot.length > 0 && (
          <Text style={[styles.pickupCount, { color: titleColor + 'aa' }]}>
            {pickedUp.size} / {pendingLoot.length} picked up
          </Text>
        )}
        {isBigDrop && (
          <View style={[styles.titleAccentBar, { backgroundColor: titleColor }]} />
        )}
        {hasUnique && (
          <Animated.Text style={[styles.uniqueBanner, { opacity: uniquePulse }]}>
            ◆  UNIQUE ITEM FOUND
          </Animated.Text>
        )}
        {hasRareDrop && (
          <Animated.Text style={[styles.rareBanner, { opacity: rarePulse }]}>
            ◈  RARE SIGNAL  ·  STUDIED KNOWLEDGE
          </Animated.Text>
        )}
      </Animated.View>

      {pendingLoot.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Nothing dropped.</Text>
        </View>
      ) : (
        <ScrollView style={styles.itemList} bounces={false}>
          {pendingLoot.map((item, itemIdx) => {
            const picked = pickedUp.has(item.uid)
            const isUnique = item.quality === 'unique'
            return (
              <AnimatedLootRow key={item.uid} index={itemIdx}>
              <TouchableOpacity
                style={[
                  styles.dropRow,
                  picked && styles.pickedRow,
                  isUnique && !picked && styles.uniqueRow,
                  item.quality === 'rare' && !picked && hasRareDrop && styles.rareRow,
                ]}
                onPress={() => setSheetItem(item)}
                activeOpacity={0.7}
              >
                <View style={styles.itemInfo}>
                  <ItemCard item={item} compact />
                  {/* Study bonus hints */}
                  {studiedBonuses.includes('normal') && item.quality === 'normal' && item.sockets > 0 && (
                    <Text style={styles.studyHint}>⬡ {item.sockets} socket{item.sockets !== 1 ? 's' : ''}</Text>
                  )}
                  {studiedBonuses.includes('magic') && item.quality === 'magic' && !item.identified && item.affixes.length > 0 && (
                    <Text style={styles.studyHint}>◈ {item.affixes.length} affix{item.affixes.length !== 1 ? 'es' : ''} inside</Text>
                  )}
                </View>
                {!picked ? (
                  <View style={styles.actionBtns}>
                    <TouchableOpacity
                      style={styles.takeBtn}
                      onPress={() => handlePickUp(item)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={styles.takeBtnText}>TAKE</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.takenBox}>
                    <Text style={styles.takenLabel}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
              </AnimatedLootRow>
            )
          })}
        </ScrollView>
      )}

      {/* Bottom actions */}
      <View style={styles.bottomActions}>
        {!allPicked && pendingLoot.length > 0 && (
          <TouchableOpacity style={styles.pickAllBtn} onPress={handlePickUpAll}>
            <Text style={styles.pickAllText}>
              PICK UP ALL ({pendingLoot.length - pickedUp.size})
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
          <Text style={styles.doneBtnText}>
            {allPicked || pendingLoot.length === 0
              ? 'DONE → BACK TO MAP'
              : `LEAVE  (${pendingLoot.length - pickedUp.size} item${pendingLoot.length - pickedUp.size > 1 ? 's' : ''} behind)`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Item detail sheet */}
      {sheetItem && (
        <ItemDetailSheet
          item={sheetItem}
          compareWith={compareWith}
          isEquipped={false}
          onTake={!pickedUp.has(sheetItem.uid) ? () => {
            handlePickUp(sheetItem)
            setSheetItem(null)
          } : undefined}
          onClose={() => setSheetItem(null)}
        />
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  bossVignette: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderRadius: 0,
    zIndex: 1,
  },
  titleBlock: {
    borderBottomWidth: 1,
    paddingBottom: 14,
    marginBottom: 2,
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: COLORS.textSecondary,
    fontSize: 13,
    letterSpacing: 4,
    textAlign: 'center',
    fontWeight: '700',
  },
  titleBig: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 5,
  },
  pickupCount: {
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  titleAccentBar: {
    height: 2,
    width: 60,
    borderRadius: 1,
    opacity: 0.6,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textDim,
    fontSize: 14,
  },
  itemList: {
    flex: 1,
  },
  dropRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface2,
  },
  pickedRow: {
    opacity: 0.35,
  },
  uniqueRow: {
    borderBottomColor: COLORS.runewordColor + '55',
    backgroundColor: COLORS.runewordColor + '08',
  },
  uniqueBanner: {
    color: COLORS.runewordColor,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3,
    textAlign: 'center',
  },
  rareBanner: {
    color: COLORS.gold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
  },
  rareRow: {
    borderBottomColor: COLORS.gold + '44',
    backgroundColor: COLORS.gold + '07',
  },
  studyHint: {
    color: COLORS.xpBar,
    fontSize: 9,
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingBottom: 4,
    fontStyle: 'italic',
  },
  itemInfo: {
    flex: 1,
  },
  actionBtns: {
    flexDirection: 'column',
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  takeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COLORS.greenDim,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    minWidth: 58,
  },
  takeBtnText: {
    color: COLORS.hpHigh,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
  },
  takenBox: {
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 64,
  },
  takenLabel: {
    color: COLORS.hpHigh,
    fontSize: 18,
  },
  bottomActions: {
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  pickAllBtn: {
    borderWidth: 1,
    borderColor: COLORS.gold,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  pickAllText: {
    color: COLORS.gold,
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '600',
  },
  doneBtn: {
    backgroundColor: COLORS.greenDim,
    borderColor: COLORS.green,
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  doneBtnText: {
    color: COLORS.green,
    fontSize: 12,
    letterSpacing: 2,
  },
})
