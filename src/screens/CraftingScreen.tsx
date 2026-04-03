import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native'
import { useGameStore } from '../store/gameStore'
import { useInventoryStore } from '../store/inventoryStore'
import { RECIPES, type RecipeDef, type RecipeInputType } from '../data/recipes'
import { transmute } from '../engine/loot'
import { makeRng } from '../engine/rng'
import type { Item } from '../engine/loot'
import { QUALITY_COLOR } from '../utils/itemDisplay'
import { SectionLabel } from '../components/SectionLabel'
import { COLORS } from '../theme'

type Source = 'bag' | 'stash'

interface SelectableItem {
  item: Item
  source: Source
}

function inputLabel(inp: RecipeInputType): string {
  if (inp.type === 'quality') {
    const slot = inp.slot ? ` ${inp.slot}` : ''
    return `${inp.count}×  ${inp.quality.toUpperCase()}${slot.toUpperCase()}`
  }
  if (inp.type === 'rune') {
    const rune = inp.runeId === 'any' ? 'ANY RUNE' : inp.runeId.replace('rune_', '').toUpperCase() + ' RUNE'
    return `${inp.count}×  ${rune}`
  }
  if (inp.type === 'potion') {
    const name = inp.potionId === 'hp_potion' ? 'HEALTH POTION' : inp.potionId === 'mana_potion' ? 'MANA VIAL' : inp.potionId.toUpperCase()
    return `${inp.count}×  ${name}`
  }
  if (inp.type === 'gem') {
    const name = inp.gemId === 'any' ? 'ANY GEM (same type)' : inp.gemId.replace('gem_', '').replace(/_/g, ' ').toUpperCase() + ' GEM'
    return `${inp.count}×  ${name}`
  }
  return `${inp.count}×  ANY ITEM`
}

function ItemChip({
  item, source, selected, onPress,
}: { item: Item; source: Source; selected: boolean; onPress: () => void }) {
  const color = QUALITY_COLOR[item.quality] ?? COLORS.textSecondary
  return (
    <TouchableOpacity
      style={[styles.itemChip, selected && { borderColor: color, backgroundColor: color + '20' }]}
      onPress={onPress}
    >
      <Text style={[styles.chipSource, source === 'stash' && styles.chipSourceStash]}>
        {source === 'stash' ? 'S' : 'B'}
      </Text>
      <Text style={[styles.chipQuality, { color }]}>{item.quality.toUpperCase()[0]}</Text>
      <Text style={[styles.chipName, { color: selected ? color : COLORS.textSecondary }]} numberOfLines={1}>
        {item.displayName}
      </Text>
    </TouchableOpacity>
  )
}

function RecipeCard({ recipe, selected, onPress }: { recipe: RecipeDef; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.recipeCard, selected && styles.recipeCardSelected]}
      onPress={onPress}
    >
      <Text style={[styles.recipeName, selected && { color: COLORS.gold }]}>{recipe.name}</Text>
      <Text style={styles.recipeDesc}>{recipe.description}</Text>
    </TouchableOpacity>
  )
}

/** Returns how many of the recipe's required inputs are satisfied by selectedUids. */
function countMatchedInputs(
  recipe: RecipeDef,
  selectedUids: string[],
  allItems: Record<string, Item>,
): { matched: number; total: number } {
  const total = recipe.inputs.reduce((sum, inp) => sum + inp.count, 0)
  const items = selectedUids.map(uid => allItems[uid]).filter(Boolean) as Item[]
  const remaining = [...items]
  let matched = 0
  for (const input of recipe.inputs) {
    for (let i = 0; i < input.count; i++) {
      let matchIdx = -1
      if (input.type === 'quality') {
        matchIdx = remaining.findIndex(it => it.quality === input.quality && (!input.slot || it.slot === input.slot))
      } else if (input.type === 'rune') {
        if (input.runeId === 'any') {
          const firstRune = remaining.find(it => it.slot === 'rune')
          if (!firstRune) break
          matchIdx = remaining.findIndex(it => it.slot === 'rune' && it.baseId === firstRune.baseId)
        } else {
          matchIdx = remaining.findIndex(it => it.slot === 'rune' && it.baseId === input.runeId)
        }
      } else if (input.type === 'potion') {
        matchIdx = remaining.findIndex(it => it.baseId === input.potionId)
      } else if (input.type === 'gem') {
        if (input.gemId === 'any') {
          const firstGem = remaining.find(it => it.slot === 'gem')
          if (!firstGem) break
          matchIdx = remaining.findIndex(it => it.slot === 'gem' && it.baseId === firstGem.baseId)
        } else {
          matchIdx = remaining.findIndex(it => it.slot === 'gem' && it.baseId === input.gemId)
        }
      } else if (input.type === 'any') {
        matchIdx = remaining.length > 0 ? 0 : -1
      }
      if (matchIdx === -1) break
      matched++
      remaining.splice(matchIdx, 1)
    }
  }
  return { matched, total }
}

/** Returns true if selected items satisfy all recipe inputs exactly. */
function matchesRecipeInputs(
  recipe: RecipeDef,
  selectedUids: string[],
  allItems: Record<string, Item>,
): boolean {
  const items = selectedUids.map(uid => allItems[uid]).filter(Boolean) as Item[]
  const totalRequired = recipe.inputs.reduce((sum, inp) => sum + inp.count, 0)
  if (items.length !== totalRequired) return false
  const remaining = [...items]
  for (const input of recipe.inputs) {
    for (let i = 0; i < input.count; i++) {
      let matchIdx = -1
      if (input.type === 'quality') {
        matchIdx = remaining.findIndex(it =>
          it.quality === input.quality && (!input.slot || it.slot === input.slot)
        )
      } else if (input.type === 'rune') {
        if (input.runeId === 'any') {
          const firstRune = remaining.find(it => it.slot === 'rune')
          if (!firstRune) return false
          matchIdx = remaining.findIndex(it => it.slot === 'rune' && it.baseId === firstRune.baseId)
        } else {
          matchIdx = remaining.findIndex(it => it.slot === 'rune' && it.baseId === input.runeId)
        }
      } else if (input.type === 'potion') {
        matchIdx = remaining.findIndex(it => it.baseId === input.potionId)
      } else if (input.type === 'gem') {
        if (input.gemId === 'any') {
          const firstGem = remaining.find(it => it.slot === 'gem')
          if (!firstGem) return false
          matchIdx = remaining.findIndex(it => it.slot === 'gem' && it.baseId === firstGem.baseId)
        } else {
          matchIdx = remaining.findIndex(it => it.slot === 'gem' && it.baseId === input.gemId)
        }
      } else if (input.type === 'any') {
        matchIdx = remaining.length > 0 ? 0 : -1
      }
      if (matchIdx === -1) return false
      remaining.splice(matchIdx, 1)
    }
  }
  return remaining.length === 0
}

/** Auto-detect the best recipe for a set of selected items. Returns recipe id or null. */
function autoDetectRecipe(selectedUids: string[], allItems: Record<string, Item>): string | null {
  const items = selectedUids.map(uid => allItems[uid]).filter(Boolean) as Item[]
  if (items.length === 0) return null

  // 3 identical runes → Rune Fusion
  if (items.length === 3 && items.every(it => it.slot === 'rune') &&
      items.every(it => it.baseId === items[0].baseId)) {
    return 'recipe_rune_upgrade'
  }
  // 3 identical gems → Gem Polish
  if (items.length === 3 && items.every(it => it.slot === 'gem') &&
      items.every(it => it.baseId === items[0].baseId)) {
    return 'recipe_gem_upgrade'
  }
  // 3 normal weapons → Imbue Weapon
  if (items.length === 3 && items.every(it => it.quality === 'normal' && it.slot === 'weapon')) {
    return 'recipe_normal_to_magic'
  }
  // 3 magic items → Reforge
  if (items.length === 3 && items.every(it => it.quality === 'magic')) {
    return 'recipe_magic_to_rare'
  }
  // 3 hp potions → Vial Concentrate
  if (items.length === 3 && items.every(it => it.baseId === 'hp_potion')) {
    return 'recipe_potion_upgrade'
  }
  return null
}

export function CraftingScreen() {
  const { floor, sharedStash, withdrawFromStash, depositToStash } = useGameStore()
  const { bag, addItem, dropItem } = useInventoryStore()
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeDef | null>(null)
  const [selectedUids, setSelectedUids] = useState<string[]>([])
  const [lastResult, setLastResult] = useState<string>('')
  const [tab, setTab] = useState<Source>('bag')

  // Build a unified lookup of all available items (bag + stash)
  const bagMap = bag.items
  const stashMap: Record<string, Item> = Object.fromEntries(sharedStash.map(it => [it.uid, it]))
  const allItems: Record<string, Item> = { ...bagMap, ...stashMap }

  const bagList  = Object.values(bagMap)
  const stashList = sharedStash

  // Always re-run auto-detect when selection changes.
  // If a match is found it overrides everything (including previous auto or manual choice).
  // If no match and selection is empty, clear the recipe so the UI resets cleanly.
  // If no match but items are still selected, keep whatever recipe is shown.
  useEffect(() => {
    const detected = autoDetectRecipe(selectedUids, allItems)
    if (detected) {
      const recipe = RECIPES.find(r => r.id === detected) ?? null
      setSelectedRecipe(recipe)
    } else if (selectedUids.length === 0) {
      setSelectedRecipe(null)
    }
  }, [selectedUids])

  function toggleItem(uid: string) {
    setSelectedUids(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid])
  }

  function selectRecipe(r: RecipeDef) {
    setSelectedRecipe(r)
    setSelectedUids([])
    setLastResult('')
  }

  function handleTransmute() {
    if (!selectedRecipe) return
    const inputs = selectedUids.map(uid => allItems[uid]).filter(Boolean) as Item[]
    if (inputs.length === 0) return

    const rng = makeRng(Date.now())
    const result = transmute(rng, selectedRecipe.id, inputs, floor)

    if (!result.success || !result.item) {
      setLastResult(`✗ ${result.message}`)
      setSelectedUids([])
      return
    }

    // Atomic: add result first — only consume inputs if it fits
    const added = addItem(result.item)
    if (!added) {
      Alert.alert('Bag Full', 'No room for the crafted item. Make space first — inputs are safe.')
      setLastResult('✗ Bag full — inputs kept')
      return
    }

    // Consume inputs from their respective sources
    for (const uid of selectedUids) {
      if (bagMap[uid])   dropItem(uid)
      else if (stashMap[uid]) withdrawFromStash(uid)
    }
    setLastResult(`✓ ${result.message}`)
    setSelectedUids([])
  }

  const canCraft =
    selectedRecipe !== null &&
    selectedUids.length > 0 &&
    matchesRecipeInputs(selectedRecipe, selectedUids, allItems)

  const partialMatch = selectedRecipe && selectedUids.length > 0
    ? countMatchedInputs(selectedRecipe, selectedUids, allItems)
    : null

  const displayList = tab === 'bag' ? bagList : stashList

  return (
    <View style={styles.root}>
      <Text style={styles.title}>HORADRIC CUBE</Text>
      <Text style={styles.sub}>Select items from your bag or stash to transmute</Text>

      {/* Recipe list */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recipeScroll} contentContainerStyle={styles.recipeRow}>
        {RECIPES.map(r => (
          <RecipeCard
            key={r.id}
            recipe={r}
            selected={selectedRecipe?.id === r.id}
            onPress={() => selectRecipe(r)}
          />
        ))}
      </ScrollView>

      {/* Selected recipe detail */}
      {selectedRecipe && (
        <View style={styles.recipeDetail}>
          <Text style={styles.recipeDetailName}>{selectedRecipe.name}</Text>
          <Text style={styles.recipeDetailDesc}>{selectedRecipe.description}</Text>
          <View style={styles.ingredientRow}>
            <Text style={styles.ingredientLabel}>NEEDS: </Text>
            {selectedRecipe.inputs.map((inp, i) => (
              <View key={i} style={styles.ingredientChip}>
                <Text style={styles.ingredientChipText}>{inputLabel(inp)}</Text>
              </View>
            ))}
          </View>
          {partialMatch && !canCraft && partialMatch.matched > 0 && (
            <Text style={styles.partialHint}>
              {partialMatch.matched}/{partialMatch.total} inputs matched
            </Text>
          )}
          {canCraft && (
            <Text style={styles.partialHintOk}>✓ Ready to transmute</Text>
          )}
        </View>
      )}

      {/* Source tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'bag' && styles.tabActive]}
          onPress={() => setTab('bag')}
        >
          <Text style={[styles.tabText, tab === 'bag' && styles.tabTextActive]}>
            BAG ({bagList.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'stash' && styles.tabActive]}
          onPress={() => setTab('stash')}
        >
          <Text style={[styles.tabText, tab === 'stash' && styles.tabTextActive]}>
            STASH ({stashList.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Selected count across both sources */}
      {selectedUids.length > 0 && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionText}>
            {selectedUids.length} selected
            {selectedUids.filter(uid => bagMap[uid]).length > 0 &&
              ` · ${selectedUids.filter(uid => bagMap[uid]).length} from bag`}
            {selectedUids.filter(uid => stashMap[uid]).length > 0 &&
              ` · ${selectedUids.filter(uid => stashMap[uid]).length} from stash`}
          </Text>
          <TouchableOpacity onPress={() => setSelectedUids([])}>
            <Text style={styles.selectionClear}>CLEAR</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Item list */}
      <ScrollView style={styles.bagScroll} contentContainerStyle={styles.bagGrid}>
        {displayList.length === 0 ? (
          <Text style={styles.bagEmpty}>{tab === 'bag' ? 'Bag is empty' : 'Stash is empty'}</Text>
        ) : (
          displayList.map(item => (
            <ItemChip
              key={item.uid}
              item={item}
              source={bagMap[item.uid] ? 'bag' : 'stash'}
              selected={selectedUids.includes(item.uid)}
              onPress={() => toggleItem(item.uid)}
            />
          ))
        )}
      </ScrollView>

      {/* Last result */}
      {lastResult !== '' && (
        <Text style={[styles.result, lastResult.startsWith('✓') ? styles.resultOk : styles.resultFail]}>
          {lastResult}
        </Text>
      )}

      {/* Transmute button */}
      <TouchableOpacity
        style={[styles.transmuteBtn, !canCraft && styles.disabledBtn]}
        onPress={handleTransmute}
        disabled={!canCraft}
      >
        <Text style={[styles.transmuteBtnText, !canCraft && styles.disabledText]}>
          TRANSMUTE ({selectedUids.length} selected)
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingTop: 20,
    paddingHorizontal: 16,
    gap: 12,
  },
  title: {
    color: COLORS.gold,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 6,
    textAlign: 'center',
  },
  sub: {
    color: COLORS.textDim,
    fontSize: 10,
    letterSpacing: 1,
    textAlign: 'center',
  },
  recipeScroll: {
    flexGrow: 0,
  },
  recipeRow: {
    gap: 8,
    paddingVertical: 4,
  },
  recipeCard: {
    width: 180,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  recipeCardSelected: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldDim,
  },
  recipeName: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  recipeDesc: {
    color: COLORS.textDim,
    fontSize: 9,
    lineHeight: 13,
  },
  recipeDetail: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border2,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  recipeDetailName: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  recipeDetailDesc: {
    color: COLORS.textSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
  ingredientRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  ingredientLabel: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 1,
  },
  ingredientChip: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border2,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ingredientChipText: {
    color: COLORS.runewordColor,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  partialHint: {
    color: COLORS.gold,
    fontSize: 9,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  partialHintOk: {
    color: COLORS.green,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  tabActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldDim,
  },
  tabText: {
    color: COLORS.textDim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tabTextActive: {
    color: COLORS.gold,
  },
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border2,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  selectionText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  selectionClear: {
    color: COLORS.red,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  bagScroll: {
    flex: 1,
  },
  bagGrid: {
    gap: 6,
  },
  itemChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSource: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.textDim,
    width: 12,
  },
  chipSourceStash: {
    color: COLORS.runewordColor,
  },
  chipQuality: {
    fontSize: 10,
    fontWeight: '900',
    width: 14,
  },
  chipName: {
    flex: 1,
    fontSize: 11,
  },
  result: {
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  resultOk:   { color: COLORS.green },
  resultFail: { color: COLORS.red },
  transmuteBtn: {
    backgroundColor: COLORS.goldDim,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  transmuteBtnText: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
  disabledBtn: {
    opacity: 0.3,
  },
  disabledText: {
    opacity: 0.5,
  },
  bagEmpty: {
    color: COLORS.textDim,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 20,
  },
})
