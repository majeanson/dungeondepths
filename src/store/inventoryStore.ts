import { create } from 'zustand'
import type { Item } from '../engine/loot'
import { insertRune as engineInsertRune } from '../engine/loot'
import { scheduleSave } from '../services/persistence'
import {
  createInventory,
  autoPlace,
  placeItem as enginePlace,
  removeItem as engineRemove,
  canPlace as engineCanPlace,
  itemToEquipSlot,
  calcMF,
  type EquipSlot,
  type InventoryGrid,
  type Placement,
} from '../engine/inventory'

/** How many potions a sash can stack per cell. Keyed by belt baseId. */
const SASH_STACK_LIMITS: Record<string, number> = {
  sash:         3,
  leather_belt: 4,
  war_belt:     5,
}

export type { EquipSlot }

export interface InventoryState {
  bag: InventoryGrid
  equipped: Partial<Record<EquipSlot, Item>>
  magicFind: number

  addItem: (item: Item) => boolean          // false = bag full
  addItems: (items: Item[]) => void
  dropItem: (uid: string) => void
  equipItem: (uid: string) => boolean       // false = bag too full to swap
  unequipSlot: (slot: EquipSlot) => boolean // false = no bag space
  moveItem: (uid: string, pos: Placement) => void
  resetBag: () => void
  hydrateEquipped: (equipped: Partial<Record<EquipSlot, Item>>) => void
  hydrateBag: (bag: InventoryGrid) => void
  /** Insert rune (runeUid) into item (itemUid) in bag or equipped. Returns true if a runeword was activated. */
  insertRune: (itemUid: string, runeUid: string) => boolean
  /** Consume one charge of a potion. Decrements quantity; removes item if last charge. */
  consumePotion: (uid: string) => void
  /**
   * Agglomerate same-type potions into stacks up to the equipped sash's limit.
   * Returns number of bag slots freed (0 if no sash equipped or nothing to merge).
   */
  agglomeratePotions: () => number
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  bag: createInventory(),
  equipped: {},
  magicFind: 0,

  addItem: (item) => {
    const { bag, equipped } = get()
    const identified = { ...item, identified: true }
    const newBag = autoPlace(bag, identified)
    if (!newBag) return false
    set({ bag: newBag, magicFind: calcMF(equipped, newBag) })
    return true
  },

  addItems: (items) => {
    let { bag } = get()
    for (const item of items) {
      const next = autoPlace(bag, item)
      if (next) bag = next
    }
    set({ bag, magicFind: calcMF(get().equipped, bag) })
  },

  dropItem: (uid) => {
    const { bag, equipped } = get()
    const newBag = engineRemove(bag, uid)
    set({ bag: newBag, magicFind: calcMF(equipped, newBag) })
  },

  equipItem: (uid) => {
    const { bag, equipped } = get()
    const item = bag.items[uid]
    if (!item) return false
    const slot = itemToEquipSlot(item, equipped)
    if (!slot) return false

    let newBag = engineRemove(bag, uid)
    const displaced = equipped[slot]
    if (displaced) {
      const withDisplaced = autoPlace(newBag, displaced)
      if (!withDisplaced) return false  // bag too full to swap — abort equip
      newBag = withDisplaced
    }
    const newEquipped = { ...equipped, [slot]: item }
    set({ bag: newBag, equipped: newEquipped, magicFind: calcMF(newEquipped, newBag) })
    return true
  },

  unequipSlot: (slot) => {
    const { bag, equipped } = get()
    const item = equipped[slot]
    if (!item) return false
    const newBag = autoPlace(bag, item)
    if (!newBag) return false  // no space
    const newEquipped = { ...equipped }
    delete newEquipped[slot]
    set({ bag: newBag, equipped: newEquipped, magicFind: calcMF(newEquipped, newBag) })
    return true
  },

  resetBag: () => {
    const { equipped } = get()
    const newBag = createInventory()
    set({ bag: newBag, magicFind: calcMF(equipped, newBag) })
  },

  hydrateEquipped: (equipped) => {
    const { bag } = get()
    set({ equipped, magicFind: calcMF(equipped, bag) })
  },

  hydrateBag: (bag) => {
    const { equipped } = get()
    set({ bag, magicFind: calcMF(equipped, bag) })
  },

  insertRune: (itemUid, runeUid) => {
    const { bag, equipped } = get()
    const runeItem = bag.items[runeUid]
    if (!runeItem || (runeItem.slot !== 'rune' && runeItem.slot !== 'gem')) return false

    const bagItem = bag.items[itemUid]
    const equippedEntry = (Object.entries(equipped) as [EquipSlot, Item][])
      .find(([, it]) => it?.uid === itemUid)
    const targetItem = bagItem ?? equippedEntry?.[1]
    if (!targetItem) return false

    const updatedItem = engineInsertRune(targetItem, runeItem.baseId)
    if (updatedItem === targetItem) return false  // engine rejected insert

    const runewordActivated = updatedItem.runewordId !== null && targetItem.runewordId === null
    const bagAfterRune = engineRemove(bag, runeUid)

    if (bagItem) {
      const newBag: InventoryGrid = {
        ...bagAfterRune,
        items: { ...bagAfterRune.items, [itemUid]: updatedItem },
      }
      set({ bag: newBag, magicFind: calcMF(equipped, newBag) })
    } else if (equippedEntry) {
      const [slot] = equippedEntry
      const newEquipped = { ...equipped, [slot]: updatedItem }
      set({ equipped: newEquipped, bag: bagAfterRune, magicFind: calcMF(newEquipped, bagAfterRune) })
    }

    scheduleSave()
    return runewordActivated
  },

  moveItem: (uid, pos) => {
    const { bag, equipped } = get()
    const item = bag.items[uid]
    if (!item) return
    const bagWithout = engineRemove(bag, uid)
    if (!engineCanPlace(bagWithout, item, pos)) return
    const newBag = enginePlace(bagWithout, item, pos)
    set({ bag: newBag, magicFind: calcMF(equipped, newBag) })
  },

  consumePotion: (uid) => {
    const { bag, equipped } = get()
    const item = bag.items[uid]
    if (!item) return
    const qty = item.quantity ?? 1
    if (qty <= 1) {
      // Last charge — remove entirely
      const newBag = engineRemove(bag, uid)
      set({ bag: newBag, magicFind: calcMF(equipped, newBag) })
    } else {
      // Decrement quantity in place
      const newBag: InventoryGrid = {
        ...bag,
        items: { ...bag.items, [uid]: { ...item, quantity: qty - 1 } },
      }
      set({ bag: newBag, magicFind: calcMF(equipped, newBag) })
    }
    scheduleSave()
  },

  agglomeratePotions: () => {
    const { bag, equipped } = get()
    const sash = equipped.belt
    if (!sash) return 0

    const stackLimit = SASH_STACK_LIMITS[sash.baseId] ?? 3
    const potionItems = Object.values(bag.items).filter(it => it.slot === 'potion')

    // Group by baseId
    const groups: Record<string, Item[]> = {}
    for (const item of potionItems) {
      (groups[item.baseId] ??= []).push(item)
    }

    let newBag = bag
    let slotsFreed = 0

    for (const items of Object.values(groups)) {
      if (items.length <= 1) continue

      const total = items.reduce((sum, it) => sum + (it.quantity ?? 1), 0)
      const stacksNeeded = Math.ceil(total / stackLimit)

      // Nothing to merge if already perfectly stacked
      if (stacksNeeded >= items.length) continue

      // Remove items that will be folded into others
      const toRemove = items.slice(stacksNeeded)
      for (const item of toRemove) {
        newBag = engineRemove(newBag, item.uid)
      }
      slotsFreed += toRemove.length

      // Update kept items with correct quantities
      let remaining = total
      const updatedItems = { ...newBag.items }
      for (const item of items.slice(0, stacksNeeded)) {
        const qty = Math.min(remaining, stackLimit)
        updatedItems[item.uid] = { ...item, quantity: qty }
        remaining -= qty
      }
      newBag = { ...newBag, items: updatedItems }
    }

    if (slotsFreed === 0) return 0
    set({ bag: newBag, magicFind: calcMF(equipped, newBag) })
    scheduleSave()
    return slotsFreed
  },
}))
