/**
 * debug:state — Pretty-print a game state snapshot from a JSON file or stdin.
 * bun run src/sim/debugState.ts [path-to-state.json]
 *
 * State shape matches the Zustand store slices combined.
 * Can also be used programmatically: import { printState } from './debugState'
 */

import type { Item, ItemQuality } from '../engine/loot'
import type { InventoryGrid, EquipSlot } from '../engine/inventory'

export interface DebugGameState {
  floor: number
  stamina: number
  maxStamina: number
  hp: number
  maxHp: number
  revealedTiles: number
  totalFloorTiles: number
  rooms: number
  inventory: InventoryGrid
  equipped: Partial<Record<EquipSlot, Item | null>>
  lastDrop?: Item | null
}

const QUALITY_COLORS: Record<ItemQuality, string> = {
  normal:  '\x1b[37m',   // white
  magic:   '\x1b[34m',   // blue
  rare:    '\x1b[33m',   // yellow
  unique:  '\x1b[33;1m', // bright gold
}
const RESET = '\x1b[0m'

function colorItem(item: Item): string {
  const c = QUALITY_COLORS[item.quality] ?? ''
  return `${c}${item.displayName} [${item.slot}]${RESET}`
}

export function printState(state: DebugGameState): void {
  const { floor, stamina, maxStamina, hp, maxHp, revealedTiles, totalFloorTiles, rooms } = state
  const staminaBar = '█'.repeat(Math.round((stamina / maxStamina) * 20)).padEnd(20, '░')
  const hpBar = '█'.repeat(Math.round((hp / maxHp) * 20)).padEnd(20, '░')

  console.log('\n' + '─'.repeat(60))
  console.log(`  Floor ${floor}`)
  console.log(`  HP      [${hpBar}] ${hp}/${maxHp}`)
  console.log(`  Stamina [${staminaBar}] ${stamina}/${maxStamina}`)
  console.log(`  Grid: ${revealedTiles}/${totalFloorTiles} tiles revealed | ${rooms} rooms`)
  console.log()

  // Equipped items
  const equippedSlots = Object.entries(state.equipped)
  const hasEquipped = equippedSlots.some(([, v]) => v !== null)
  if (hasEquipped) {
    console.log('  Equipped:')
    for (const [slot, item] of equippedSlots) {
      if (item) console.log(`    ${slot.padEnd(10)} ${colorItem(item)}`)
    }
    console.log()
  }

  // Inventory contents
  const invItems = Object.values(state.inventory.items)
  const usedCells = state.inventory.cells.flat().filter(c => c !== null).length
  const totalCells = state.inventory.cells.flat().length
  console.log(`  Inventory: ${usedCells}/${totalCells} cells used`)
  for (const item of invItems) {
    const size = `${item.size[0]}×${item.size[1]}`
    const sockets = item.sockets > 0 ? ` [${item.sockets}S]` : ''
    const runes = item.insertedRunes.length > 0 ? ` (${item.insertedRunes.length} runes)` : ''
    const rwNote = item.sockets > 0 && item.quality === 'normal' && item.insertedRunes.length === 0
      ? ' ← runeword candidate'
      : ''
    console.log(`    ${size.padEnd(5)} ${colorItem(item)}${sockets}${runes}${rwNote}`)
  }

  if (state.lastDrop) {
    console.log()
    console.log(`  Last drop: ${colorItem(state.lastDrop)}`)
  }

  console.log('─'.repeat(60) + '\n')
}

// CLI entry point
if (import.meta.main) {
  const filePath = process.argv[2]
  if (!filePath) {
    // Print a demo state
    const demo: DebugGameState = {
      floor: 5,
      stamina: 34,
      maxStamina: 100,
      hp: 72,
      maxHp: 80,
      revealedTiles: 312,
      totalFloorTiles: 580,
      rooms: 8,
      inventory: {
        cells: Array.from({ length: 4 }, (_, r) =>
          Array.from({ length: 10 }, (_, c) => {
            if (r === 0 && c < 3) return 'sword1'
            if (r === 0 && c === 3) return 'charm1'
            if (r === 0 && c === 4) return 'rune1'
            if (r === 0 && c === 5) return 'rune2'
            return null
          })
        ),
        items: {
          sword1: { uid: 'sword1', baseId: 'long_sword', baseName: 'Long Sword', slot: 'weapon', size: [1, 3], quality: 'rare', sockets: 0, insertedRunes: [], runewordId: null, affixes: [], baseStats: { damage: [14, 22] }, effectiveStats: { damage: 28 }, displayName: 'Cruel Fleshreaver of Speed' },
          charm1: { uid: 'charm1', baseId: 'small_charm', baseName: 'Small Charm', slot: 'charm', size: [1, 1], quality: 'magic', sockets: 0, insertedRunes: [], runewordId: null, affixes: [], baseStats: {}, effectiveStats: { life: 12 }, displayName: 'Amber Jewel of the Fox' },
          rune1:  { uid: 'rune1',  baseId: 'rune_el',    baseName: 'El Rune',     slot: 'rune',  size: [1, 1], quality: 'normal', sockets: 0, insertedRunes: [], runewordId: null, affixes: [], baseStats: {}, effectiveStats: {}, displayName: 'El Rune' },
          rune2:  { uid: 'rune2',  baseId: 'rune_el',    baseName: 'El Rune',     slot: 'rune',  size: [1, 1], quality: 'normal', sockets: 0, insertedRunes: [], runewordId: null, affixes: [], baseStats: {}, effectiveStats: {}, displayName: 'El Rune' },
          helm1:  { uid: 'helm1',  baseId: 'iron_helm',  baseName: 'Iron Helm',   slot: 'helmet',size: [2, 2], quality: 'normal', sockets: 2, insertedRunes: [], runewordId: null, affixes: [], baseStats: { defense: 10 }, effectiveStats: { defense: 10 }, displayName: 'Iron Helm' },
        },
      },
      equipped: {
        weapon: { uid: 'eq_sword', baseId: 'broad_sword', baseName: 'Broad Sword', slot: 'weapon', size: [2, 3], quality: 'rare', sockets: 0, insertedRunes: [], runewordId: null, affixes: [], baseStats: { damage: [18, 28] }, effectiveStats: { damage: 36 }, displayName: 'Cruel Fleshreaver of Speed' },
      },
      lastDrop: { uid: 'ring1', baseId: 'ring', baseName: 'Ring', slot: 'ring', size: [1, 1], quality: 'unique', sockets: 0, insertedRunes: [], runewordId: null, affixes: [], baseStats: {}, effectiveStats: { fireDamage: 15, fireResist: 20, life: 25 }, displayName: 'Emberheart Ring' },
    }
    printState(demo)
  } else {
    const fs = await import('fs')
    const raw = fs.readFileSync(filePath, 'utf-8')
    const state: DebugGameState = JSON.parse(raw)
    printState(state)
  }
}
