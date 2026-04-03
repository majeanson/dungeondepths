import { describe, test, expect } from 'bun:test'
import {
  createInventory, canPlace, placeItem, removeItem,
  findItemPosition, findSlot, autoPlace, rotateItem,
  usedCells, freeCells, getCharmBonuses,
  itemToEquipSlot,
  INV_COLS, INV_ROWS
} from './inventory'
import type { Item } from './loot'

function mockItem(overrides: Partial<Item> = {}): Item {
  return {
    uid: `test_${Math.random().toString(36).slice(2)}`,
    baseId: 'dagger',
    baseName: 'Dagger',
    slot: 'weapon',
    size: [1, 2],
    quality: 'normal',
    sockets: 0,
    insertedRunes: [],
    runewordId: null,
    affixes: [],
    baseStats: {},
    effectiveStats: {},
    displayName: 'Dagger',
    ...overrides,
  }
}

describe('createInventory', () => {
  test('creates empty INV_ROWS × INV_COLS grid', () => {
    const inv = createInventory()
    expect(inv.cells).toHaveLength(INV_ROWS)
    expect(inv.cells[0]).toHaveLength(INV_COLS)
    expect(inv.cells.flat().every(c => c === null)).toBe(true)
  })
})

describe('canPlace', () => {
  test('1×1 item fits in empty grid', () => {
    const inv = createInventory()
    const ring = mockItem({ size: [1, 1] })
    expect(canPlace(inv, ring, { col: 0, row: 0 })).toBe(true)
  })

  test('out-of-bounds returns false', () => {
    const inv = createInventory()
    const sword = mockItem({ size: [2, 3] })
    expect(canPlace(inv, sword, { col: INV_COLS - 1, row: 0 })).toBe(false) // width=2 at col=9: 9+2=11 > 10
    expect(canPlace(inv, sword, { col: 0, row: INV_ROWS - 2 })).toBe(false) // height=3, row=2, 2+3>4
  })

  test('overlapping items returns false', () => {
    const inv = createInventory()
    const a = mockItem({ size: [2, 2], uid: 'a' })
    const b = mockItem({ size: [2, 2], uid: 'b' })
    const placed = placeItem(inv, a, { col: 0, row: 0 })
    expect(canPlace(placed, b, { col: 1, row: 1 })).toBe(false)
    expect(canPlace(placed, b, { col: 2, row: 0 })).toBe(true)
  })
})

describe('placeItem', () => {
  test('all cells occupied after placement', () => {
    const inv = createInventory()
    const sword = mockItem({ size: [1, 3], uid: 'sword1' })
    const placed = placeItem(inv, sword, { col: 0, row: 0 })
    expect(placed.cells[0][0]).toBe('sword1')
    expect(placed.cells[1][0]).toBe('sword1')
    expect(placed.cells[2][0]).toBe('sword1')
    expect(placed.cells[0][1]).toBeNull()
  })

  test('throws on invalid placement', () => {
    const inv = createInventory()
    const a = mockItem({ size: [2, 2], uid: 'a' })
    const b = mockItem({ size: [2, 2], uid: 'b' })
    const placed = placeItem(inv, a, { col: 0, row: 0 })
    expect(() => placeItem(placed, b, { col: 0, row: 0 })).toThrow()
  })

  test('does not mutate original grid', () => {
    const inv = createInventory()
    const item = mockItem({ size: [1, 1] })
    placeItem(inv, item, { col: 0, row: 0 })
    expect(inv.cells[0][0]).toBeNull()
  })
})

describe('removeItem', () => {
  test('cells become null after removal', () => {
    const inv = createInventory()
    const item = mockItem({ size: [2, 2], uid: 'x' })
    const placed = placeItem(inv, item, { col: 0, row: 0 })
    const removed = removeItem(placed, 'x')
    expect(removed.cells.flat().every(c => c === null)).toBe(true)
    expect(removed.items['x']).toBeUndefined()
  })
})

describe('findItemPosition', () => {
  test('finds placed item top-left', () => {
    const inv = createInventory()
    const item = mockItem({ size: [1, 2], uid: 'findme' })
    const placed = placeItem(inv, item, { col: 3, row: 1 })
    expect(findItemPosition(placed, 'findme')).toEqual({ col: 3, row: 1 })
  })

  test('returns null for missing item', () => {
    expect(findItemPosition(createInventory(), 'nope')).toBeNull()
  })
})

describe('findSlot', () => {
  test('finds first available slot in empty grid', () => {
    const inv = createInventory()
    const item = mockItem({ size: [1, 1] })
    expect(findSlot(inv, item)).toEqual({ col: 0, row: 0 })
  })

  test('returns null when full', () => {
    // Fill grid with 1×1 items
    let inv = createInventory()
    for (let r = 0; r < INV_ROWS; r++) {
      for (let c = 0; c < INV_COLS; c++) {
        const item = mockItem({ size: [1, 1], uid: `r${r}c${c}` })
        inv = placeItem(inv, item, { col: c, row: r })
      }
    }
    const extra = mockItem({ size: [1, 1] })
    expect(findSlot(inv, extra)).toBeNull()
  })

  test('skips occupied cells', () => {
    let inv = createInventory()
    // Place a 2×2 at top-left
    const blocker = mockItem({ size: [2, 2], uid: 'blocker' })
    inv = placeItem(inv, blocker, { col: 0, row: 0 })
    const small = mockItem({ size: [1, 1] })
    const slot = findSlot(inv, small)
    expect(slot).not.toBeNull()
    expect(slot!.col).toBeGreaterThanOrEqual(2)  // not overlapping the 2×2
  })
})

describe('autoPlace', () => {
  test('places item in first available slot', () => {
    const inv = createInventory()
    const item = mockItem({ size: [1, 1], uid: 'auto' })
    const result = autoPlace(inv, item)
    expect(result).not.toBeNull()
    expect(result!.items['auto']).toBeDefined()
  })

  test('returns null when no space', () => {
    let inv = createInventory()
    for (let r = 0; r < INV_ROWS; r++)
      for (let c = 0; c < INV_COLS; c++)
        inv = placeItem(inv, mockItem({ size: [1, 1], uid: `r${r}c${c}` }), { col: c, row: r })
    expect(autoPlace(inv, mockItem({ size: [1, 1] }))).toBeNull()
  })
})

describe('rotateItem', () => {
  test('swaps width and height', () => {
    const item = mockItem({ size: [1, 3] })
    const rotated = rotateItem(item)
    expect(rotated.size).toEqual([3, 1])
  })

  test('rotated item can fit differently', () => {
    const inv = createInventory()
    const tall = mockItem({ size: [1, 5] })  // too tall for 4-row grid
    expect(canPlace(inv, tall, { col: 0, row: 0 })).toBe(false)
    const wide = rotateItem(tall)  // [5, 1] — fits in 1 row
    expect(canPlace(inv, wide, { col: 0, row: 0 })).toBe(true)
  })
})

describe('usedCells / freeCells', () => {
  test('empty inventory has 0 used cells', () => {
    expect(usedCells(createInventory())).toBe(0)
    expect(freeCells(createInventory())).toBe(INV_COLS * INV_ROWS)
  })

  test('counts correctly after placement', () => {
    const inv = placeItem(createInventory(), mockItem({ size: [2, 3], uid: 'big' }), { col: 0, row: 0 })
    expect(usedCells(inv)).toBe(6)
    expect(freeCells(inv)).toBe(INV_COLS * INV_ROWS - 6)
  })
})

describe('autoPlace — edge cases', () => {
  test('2×4 item places successfully in empty grid', () => {
    const inv = createInventory()
    const item = mockItem({ size: [2, 4], uid: 'big2x4' })
    const result = autoPlace(inv, item)
    expect(result).not.toBeNull()
    expect(result!.items['big2x4']).toBeDefined()
    expect(usedCells(result!)).toBe(8)
  })

  test('single-fit: item fills the only remaining gap exactly', () => {
    // Fill entire grid with 1×1 items, then remove one — that 1×1 gap is the only fit
    let inv = createInventory()
    const target = mockItem({ size: [1, 1], uid: 'target' })
    for (let r = 0; r < INV_ROWS; r++) {
      for (let c = 0; c < INV_COLS; c++) {
        const uid = r === 0 && c === 0 ? target.uid : `r${r}c${c}`
        inv = placeItem(inv, mockItem({ size: [1, 1], uid }), { col: c, row: r })
      }
    }
    // Remove the target, leaving exactly one 1×1 gap
    inv = removeItem(inv, target.uid)
    expect(freeCells(inv)).toBe(1)
    const newItem = mockItem({ size: [1, 1], uid: 'filler' })
    const result = autoPlace(inv, newItem)
    expect(result).not.toBeNull()
    // A 2×1 item cannot fit that single gap
    const tooBig = mockItem({ size: [2, 1], uid: 'toobig' })
    expect(autoPlace(inv, tooBig)).toBeNull()
  })
})

describe('itemToEquipSlot — ring routing', () => {
  test('routes to ring1 when both slots empty', () => {
    const ring = mockItem({ size: [1, 1], slot: 'ring', uid: 'r1' })
    const slot = itemToEquipSlot(ring, {})
    expect(slot).toBe('ring1')
  })

  test('routes to ring2 when ring1 occupied', () => {
    const ring = mockItem({ size: [1, 1], slot: 'ring', uid: 'r2' })
    const equipped = { ring1: mockItem({ uid: 'existing' }) }
    const slot = itemToEquipSlot(ring, equipped)
    expect(slot).toBe('ring2')
  })

  test('returns null when both ring slots occupied', () => {
    const ring = mockItem({ size: [1, 1], slot: 'ring', uid: 'r3' })
    const equipped = {
      ring1: mockItem({ uid: 'ring_a' }),
      ring2: mockItem({ uid: 'ring_b' }),
    }
    const slot = itemToEquipSlot(ring, equipped)
    expect(slot).toBeNull()
  })

  test('non-ring item routes directly to its slot', () => {
    const helm = mockItem({ size: [2, 2], slot: 'helmet', uid: 'h1' })
    const slot = itemToEquipSlot(helm, {})
    expect(slot).toBe('helmet')
  })
})

describe('getCharmBonuses', () => {
  test('sums charm stats from all charms in inventory', () => {
    let inv = createInventory()
    const charm1 = mockItem({
      size: [1, 1], slot: 'charm', uid: 'c1',
      effectiveStats: { life: 10, fireResist: 5 },
    })
    const charm2 = mockItem({
      size: [1, 1], slot: 'charm', uid: 'c2',
      effectiveStats: { life: 8, coldResist: 7 },
    })
    inv = placeItem(inv, charm1, { col: 0, row: 0 })
    inv = placeItem(inv, charm2, { col: 1, row: 0 })
    const bonuses = getCharmBonuses(inv)
    expect(bonuses.life).toBe(18)
    expect(bonuses.fireResist).toBe(5)
    expect(bonuses.coldResist).toBe(7)
  })

  test('non-charm items do not contribute charm bonuses', () => {
    let inv = createInventory()
    const sword = mockItem({ size: [1, 3], slot: 'weapon', uid: 'sw', effectiveStats: { damage: 20 } })
    inv = placeItem(inv, sword, { col: 0, row: 0 })
    const bonuses = getCharmBonuses(inv)
    expect(bonuses.damage).toBeUndefined()
  })
})
