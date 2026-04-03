import { describe, test, expect } from 'bun:test'
import { makeRng } from './rng'
import { generateItem, generateRune, insertRune, rollLoot, transmute, generateHpPotion, type ItemQuality } from './loot'

describe('generateItem', () => {
  test('returns a valid item', () => {
    const rng = makeRng(1)
    const item = generateItem(rng, { floor: 1 })
    expect(item.uid).toBeTruthy()
    expect(item.baseId).toBeTruthy()
    expect(item.slot).toBeTruthy()
    expect(['normal', 'magic', 'rare', 'unique']).toContain(item.quality)
  })

  test('same seed same item', () => {
    const a = generateItem(makeRng(42), { floor: 3 })
    const b = generateItem(makeRng(42), { floor: 3 })
    expect(a.baseId).toBe(b.baseId)
    expect(a.quality).toBe(b.quality)
    expect(a.displayName).toBe(b.displayName)
  })

  test('forceQuality is respected', () => {
    const rng = makeRng(7)
    for (let i = 0; i < 20; i++) {
      const item = generateItem(rng, { floor: 5, forceQuality: 'rare' })
      expect(item.quality).toBe('rare')
    }
  })

  test('rare items have 4-6 affixes', () => {
    const rng = makeRng(99)
    for (let i = 0; i < 50; i++) {
      const item = generateItem(rng, { floor: 5, forceQuality: 'rare' })
      expect(item.affixes.length).toBeGreaterThanOrEqual(4)
      expect(item.affixes.length).toBeLessThanOrEqual(6)
    }
  })

  test('magic items have 1-2 affixes', () => {
    const rng = makeRng(13)
    for (let i = 0; i < 50; i++) {
      const item = generateItem(rng, { floor: 3, forceQuality: 'magic' })
      expect(item.affixes.length).toBeGreaterThanOrEqual(1)
      expect(item.affixes.length).toBeLessThanOrEqual(2)
    }
  })

  test('normal items have 0 affixes', () => {
    const rng = makeRng(22)
    for (let i = 0; i < 20; i++) {
      const item = generateItem(rng, { floor: 2, forceQuality: 'normal' })
      expect(item.affixes).toHaveLength(0)
    }
  })

  test('only normal items get sockets', () => {
    const rng = makeRng(5)
    for (let i = 0; i < 50; i++) {
      const item = generateItem(rng, { floor: 5, forceQuality: 'magic' })
      expect(item.sockets).toBe(0)
    }
  })

  test('effectiveStats is superset of baseStats keys', () => {
    const rng = makeRng(3)
    const item = generateItem(rng, { floor: 5, forceQuality: 'rare' })
    for (const key of Object.keys(item.baseStats)) {
      expect(item.effectiveStats[key]).toBeDefined()
    }
  })

  test('slot filter works', () => {
    const rng = makeRng(88)
    for (let i = 0; i < 20; i++) {
      const item = generateItem(rng, { floor: 5, slot: 'weapon' })
      expect(item.slot).toBe('weapon')
    }
  })
})

describe('quality distribution over 1000 items', () => {
  function counts(floor: number, mf = 0) {
    const rng = makeRng(55)
    const c: Record<ItemQuality, number> = { normal: 0, magic: 0, rare: 0, unique: 0 }
    for (let i = 0; i < 1000; i++) c[generateItem(rng, { floor, magicFind: mf }).quality]++
    return c
  }

  test('normal is most common at floor 1', () => {
    const c = counts(1)
    expect(c.normal).toBeGreaterThan(c.magic)
    expect(c.normal).toBeGreaterThan(c.rare)
  })

  test('magic find increases rare+ drops', () => {
    const low = counts(8, 0)
    const high = counts(8, 200)
    expect(high.rare + high.unique).toBeGreaterThan(low.rare + low.unique)
  })

  test('unique is always rarest', () => {
    const c = counts(10)
    expect(c.unique).toBeLessThan(c.rare)
    expect(c.unique).toBeLessThan(c.magic)
  })
})

describe('generateRune', () => {
  test('returns a rune item', () => {
    const rng = makeRng(1)
    const rune = generateRune(rng, 5)
    expect(rune.slot).toBe('rune')
    expect(rune.quality).toBe('normal')
    expect(rune.size).toEqual([1, 1])
  })
})

describe('insertRune + runewords', () => {
  test('inserting correct sequence activates runeword', () => {
    // Steelstorm = Sol + El + Ith on a 3-socket weapon
    const rng = makeRng(1)
    let sword = generateItem(rng, { floor: 10, forceQuality: 'normal', slot: 'weapon' })
    // Force 3 sockets for test
    sword = { ...sword, sockets: 3, insertedRunes: [] }
    sword = insertRune(sword, 'rune_sol')
    sword = insertRune(sword, 'rune_el')
    sword = insertRune(sword, 'rune_ith')
    expect(sword.runewordId).toBe('rw_steelstorm')
    expect(sword.displayName).toBe('Steelstorm')
  })

  test('wrong order does not activate runeword', () => {
    const rng = makeRng(1)
    let sword = generateItem(rng, { floor: 10, forceQuality: 'normal', slot: 'weapon' })
    sword = { ...sword, sockets: 3 }
    sword = insertRune(sword, 'rune_el')  // wrong order
    sword = insertRune(sword, 'rune_sol')
    sword = insertRune(sword, 'rune_ith')
    expect(sword.runewordId).toBeNull()
  })

  test('cannot insert rune into magic item', () => {
    const rng = makeRng(1)
    const magic = generateItem(rng, { floor: 5, forceQuality: 'magic', slot: 'weapon' })
    const after = insertRune(magic, 'rune_el')
    expect(after.insertedRunes).toHaveLength(0)
  })

  test('cannot exceed socket count', () => {
    const rng = makeRng(1)
    let item = generateItem(rng, { floor: 5, forceQuality: 'normal', slot: 'weapon' })
    item = { ...item, sockets: 2 }
    item = insertRune(item, 'rune_el')
    item = insertRune(item, 'rune_el')
    item = insertRune(item, 'rune_el') // should be ignored
    expect(item.insertedRunes).toHaveLength(2)
  })
})

describe('transmute', () => {
  // ── Helpers ──────────────────────────────────────────────────────────────
  function makeRune(runeId: string): ReturnType<typeof generateItem> {
    return {
      uid: `test-${runeId}`, baseId: runeId, baseName: runeId,
      slot: 'rune', size: [1, 1] as [number, number], quality: 'normal',
      sockets: 0, insertedRunes: [], runewordId: null,
      affixes: [], baseStats: {}, effectiveStats: {},
      displayName: runeId, identified: true,
    }
  }

  test('unknown recipe returns failure', () => {
    const result = transmute(makeRng(1), 'recipe_does_not_exist', [], 5)
    expect(result.success).toBe(false)
    expect(result.item).toBeNull()
  })

  test('recipe_normal_to_magic produces a magic item of the same slot', () => {
    const rng = makeRng(1)
    const input = generateItem(rng, { floor: 3, forceQuality: 'normal', slot: 'weapon' })
    const result = transmute(makeRng(10), 'recipe_normal_to_magic', [input], 3)
    expect(result.success).toBe(true)
    expect(result.item?.quality).toBe('magic')
    expect(result.item?.slot).toBe('weapon')
  })

  test('recipe_magic_to_rare produces a rare item', () => {
    const rng = makeRng(2)
    const inputs = Array.from({ length: 3 }, () =>
      generateItem(rng, { floor: 5, forceQuality: 'magic' })
    )
    const result = transmute(makeRng(20), 'recipe_magic_to_rare', inputs, 5)
    expect(result.success).toBe(true)
    expect(result.item?.quality).toBe('rare')
  })

  test('recipe_rune_upgrade returns a rune item', () => {
    const inputs = [makeRune('rune_el'), makeRune('rune_el'), makeRune('rune_el')]
    const result = transmute(makeRng(3), 'recipe_rune_upgrade', inputs, 5)
    expect(result.success).toBe(true)
    expect(result.item?.slot).toBe('rune')
    expect(result.item?.quality).toBe('normal')
  })

  test('recipe_identify_rare fails without a rare in inputs', () => {
    const rng = makeRng(4)
    const magic = generateItem(rng, { floor: 5, forceQuality: 'magic' })
    const result = transmute(makeRng(4), 'recipe_identify_rare', [magic, makeRune('rune_el')], 5)
    expect(result.success).toBe(false)
    expect(result.item).toBeNull()
  })

  test('recipe_identify_rare with rare + El Rune produces a rare item', () => {
    const rng = makeRng(5)
    const rare = generateItem(rng, { floor: 5, forceQuality: 'rare', slot: 'helmet' })
    const result = transmute(makeRng(50), 'recipe_identify_rare', [rare, makeRune('rune_el')], 5)
    expect(result.success).toBe(true)
    expect(result.item?.quality).toBe('rare')
    expect(result.item?.slot).toBe('helmet')
  })

  test('recipe_potion_upgrade always produces a mana potion', () => {
    const inputs = [generateHpPotion(), generateHpPotion(), generateHpPotion()]
    const result = transmute(makeRng(6), 'recipe_potion_upgrade', inputs, 1)
    expect(result.success).toBe(true)
    expect(result.item?.baseId).toBe('mana_potion')
  })

  test('recipe_rare_to_unique: result is either success(unique) or failure over many seeds', () => {
    const rng = makeRng(7)
    const rare = generateItem(rng, { floor: 5, forceQuality: 'rare', slot: 'weapon' })
    let successes = 0
    for (let seed = 0; seed < 40; seed++) {
      const r = transmute(makeRng(seed), 'recipe_rare_to_unique',
        [rare, makeRune('rune_sol'), makeRune('rune_tir')], 5)
      if (r.success) {
        // unique if base has a unique def, falls back to rare if not
        expect(['unique', 'rare']).toContain(r.item?.quality)
        expect(r.item).not.toBeNull()
        successes++
      } else {
        expect(r.item).toBeNull()
      }
    }
    // 30% chance over 40 trials — expect at least 1 success and 1 failure
    expect(successes).toBeGreaterThan(0)
    expect(successes).toBeLessThan(40)
  })

  test('recipe_floor_push produces a magic item from a deeper floor', () => {
    const rng = makeRng(8)
    const magic = generateItem(rng, { floor: 3, forceQuality: 'magic', slot: 'chest' })
    const result = transmute(makeRng(80), 'recipe_floor_push', [magic, makeRune('rune_nef')], 3)
    expect(result.success).toBe(true)
    expect(result.item?.quality).toBe('magic')
    expect(result.item?.slot).toBe('chest')
  })

  test('same seed → same transmute result (deterministic)', () => {
    const rng1 = makeRng(9)
    const rng2 = makeRng(9)
    const input1 = generateItem(rng1, { floor: 5, forceQuality: 'normal', slot: 'weapon' })
    const input2 = generateItem(rng2, { floor: 5, forceQuality: 'normal', slot: 'weapon' })
    const r1 = transmute(makeRng(99), 'recipe_normal_to_magic', [input1], 5)
    const r2 = transmute(makeRng(99), 'recipe_normal_to_magic', [input2], 5)
    expect(r1.success).toBe(r2.success)
    expect(r1.item?.quality).toBe(r2.item?.quality)
    expect(r1.item?.displayName).toBe(r2.item?.displayName)
  })
})

describe('rollLoot', () => {
  test('ancient always drops at least 2 items', () => {
    const rng = makeRng(7)
    for (let i = 0; i < 20; i++) {
      const drops = rollLoot(rng, 'ancient', 10)
      expect(drops.length).toBeGreaterThanOrEqual(2)
    }
  })

  test('normal encounter can drop 0 items', () => {
    const rng = makeRng(1)
    let sawZero = false
    for (let i = 0; i < 50; i++) {
      if (rollLoot(rng, 'normal', 1).length === 0) sawZero = true
    }
    expect(sawZero).toBe(true)
  })
})
