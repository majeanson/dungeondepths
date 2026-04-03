/**
 * Inventory Tetris engine.
 * 10×4 grid. Items have physical sizes. Charms sit in inventory for passive bonuses.
 * All operations are pure functions — takes grid state, returns new grid state.
 */

import type { Item } from './loot'
import type { ItemSlot } from '../data/items'

export type EquipSlot =
  | 'weapon' | 'offhand' | 'helmet' | 'chest' | 'gloves'
  | 'legs' | 'boots' | 'ring1' | 'ring2' | 'amulet' | 'belt' | 'circlet'

export const INV_COLS = 10
export const INV_ROWS = 4

export interface InventoryGrid {
  /** INV_ROWS × INV_COLS matrix. null = empty, string = item uid occupying this cell */
  cells: (string | null)[][]
  /** Map from item uid → Item */
  items: Record<string, Item>
}

export function createInventory(): InventoryGrid {
  return {
    cells: Array.from({ length: INV_ROWS }, () => Array(INV_COLS).fill(null)),
    items: {},
  }
}

export interface Placement {
  col: number
  row: number
}

/** Can the item be placed at this position? */
export function canPlace(grid: InventoryGrid, item: Item, pos: Placement): boolean {
  const [w, h] = item.size
  if (pos.col + w > INV_COLS) return false
  if (pos.row + h > INV_ROWS) return false
  for (let r = pos.row; r < pos.row + h; r++) {
    for (let c = pos.col; c < pos.col + w; c++) {
      if (grid.cells[r][c] !== null) return false
    }
  }
  return true
}

/** Place an item at a position. Returns new grid. Throws if invalid. */
export function placeItem(grid: InventoryGrid, item: Item, pos: Placement): InventoryGrid {
  if (!canPlace(grid, item, pos)) {
    throw new Error(`Cannot place ${item.uid} at (${pos.col},${pos.row})`)
  }
  const [w, h] = item.size
  const cells = grid.cells.map(row => [...row])
  for (let r = pos.row; r < pos.row + h; r++) {
    for (let c = pos.col; c < pos.col + w; c++) {
      cells[r][c] = item.uid
    }
  }
  return { cells, items: { ...grid.items, [item.uid]: item } }
}

/** Remove an item by uid. Returns new grid. */
export function removeItem(grid: InventoryGrid, uid: string): InventoryGrid {
  const cells = grid.cells.map(row => row.map(cell => (cell === uid ? null : cell)))
  const items = { ...grid.items }
  delete items[uid]
  return { cells, items }
}

/** Find the top-left position of an item in the grid. Returns null if not found. */
export function findItemPosition(grid: InventoryGrid, uid: string): Placement | null {
  for (let r = 0; r < INV_ROWS; r++) {
    for (let c = 0; c < INV_COLS; c++) {
      if (grid.cells[r][c] === uid) return { col: c, row: r }
    }
  }
  return null
}

/**
 * Find the first available slot for an item (top-left scan).
 * Returns null if no space.
 */
export function findSlot(grid: InventoryGrid, item: Item): Placement | null {
  for (let r = 0; r < INV_ROWS; r++) {
    for (let c = 0; c < INV_COLS; c++) {
      const pos = { col: c, row: r }
      if (canPlace(grid, item, pos)) return pos
    }
  }
  return null
}

/**
 * Auto-place an item in the first available slot.
 * Returns updated grid, or null if no space.
 */
export function autoPlace(grid: InventoryGrid, item: Item): InventoryGrid | null {
  const pos = findSlot(grid, item)
  if (!pos) return null
  return placeItem(grid, item, pos)
}

/** Rotate item size (swap width and height). Returns new item with swapped size. */
export function rotateItem(item: Item): Item {
  return { ...item, size: [item.size[1], item.size[0]] }
}

/** Count used cells. */
export function usedCells(grid: InventoryGrid): number {
  return grid.cells.flat().filter(c => c !== null).length
}

/** Count free cells. */
export function freeCells(grid: InventoryGrid): number {
  return INV_COLS * INV_ROWS - usedCells(grid)
}

/** Get all items in inventory. */
export function getItems(grid: InventoryGrid): Item[] {
  return Object.values(grid.items)
}

/**
 * Collect all passive stats from charms in inventory.
 * Charms provide bonuses just by sitting in the grid.
 */
export function getCharmBonuses(grid: InventoryGrid): Record<string, number> {
  const bonuses: Record<string, number> = {}
  for (const item of getItems(grid)) {
    if (item.slot === 'charm') {
      for (const [key, val] of Object.entries(item.effectiveStats)) {
        bonuses[key] = (bonuses[key] ?? 0) + val
      }
    }
  }
  return bonuses
}

/**
 * Resolve which equipment slot an item should fill.
 * Rings smart-route: ring1 first, then ring2.
 * Returns null if no valid slot exists (both ring slots occupied, or unknown slot).
 * Callers should prompt the player to choose a ring slot explicitly when null is returned
 * for a ring item with both slots filled.
 */
export function itemToEquipSlot(item: Item, equipped: Partial<Record<EquipSlot, Item>>): EquipSlot | null {
  const map: Partial<Record<ItemSlot, EquipSlot>> = {
    weapon: 'weapon', offhand: 'offhand', helmet: 'helmet', chest: 'chest',
    gloves: 'gloves', legs: 'legs', boots: 'boots', amulet: 'amulet',
    belt: 'belt', circlet: 'circlet',
  }
  if (item.slot === 'ring') {
    if (!equipped.ring1) return 'ring1'
    if (!equipped.ring2) return 'ring2'
    return null  // both slots occupied — caller must ask player which to replace
  }
  return map[item.slot as ItemSlot] ?? null
}

/** Calculate total magic find from equipped items and inventory charms. */
export function calcMF(equipped: Partial<Record<EquipSlot, Item>>, bag: InventoryGrid): number {
  let mf = 0
  for (const item of Object.values(equipped)) {
    if (item) mf += item.effectiveStats['magicFind'] ?? 0
  }
  mf += getCharmBonuses(bag)['magicFind'] ?? 0
  return mf
}
