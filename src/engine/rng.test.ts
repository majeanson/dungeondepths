import { describe, test, expect } from 'bun:test'
import { makeRng, roll, pick, shuffle, weightedPick, chance, pickN } from './rng'

describe('makeRng', () => {
  test('same seed produces same sequence', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b())
    }
  })

  test('different seeds produce different sequences', () => {
    const a = makeRng(1)
    const b = makeRng(2)
    const aVals = Array.from({ length: 10 }, () => a())
    const bVals = Array.from({ length: 10 }, () => b())
    expect(aVals).not.toEqual(bVals)
  })

  test('values are in [0, 1)', () => {
    const rng = makeRng(999)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('roll', () => {
  test('always returns value in [min, max]', () => {
    const rng = makeRng(7)
    for (let i = 0; i < 500; i++) {
      const v = roll(rng, 3, 10)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(10)
    }
  })

  test('min === max returns that value', () => {
    const rng = makeRng(1)
    expect(roll(rng, 5, 5)).toBe(5)
  })

  test('covers full range over many rolls', () => {
    const rng = makeRng(123)
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) seen.add(roll(rng, 1, 6))
    expect(seen.size).toBe(6)
  })
})

describe('pick', () => {
  test('returns element from array', () => {
    const rng = makeRng(5)
    const arr = ['a', 'b', 'c']
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(pick(rng, arr))
    }
  })

  test('covers all elements over many picks', () => {
    const rng = makeRng(11)
    const arr = [1, 2, 3, 4, 5]
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) seen.add(pick(rng, arr))
    expect(seen.size).toBe(5)
  })
})

describe('shuffle', () => {
  test('returns same elements in different order', () => {
    const rng = makeRng(33)
    const arr = [1, 2, 3, 4, 5, 6]
    const result = shuffle(rng, [...arr])
    expect(result.sort()).toEqual(arr.sort())
  })

  test('same seed same shuffle', () => {
    const a = shuffle(makeRng(77), [1, 2, 3, 4, 5])
    const b = shuffle(makeRng(77), [1, 2, 3, 4, 5])
    expect(a).toEqual(b)
  })
})

describe('weightedPick', () => {
  test('heavily weighted option is picked most often', () => {
    const rng = makeRng(55)
    const counts = { a: 0, b: 0, c: 0 }
    for (let i = 0; i < 1000; i++) {
      const v = weightedPick(rng, ['a', 'b', 'c'] as const, [90, 5, 5])
      counts[v]++
    }
    expect(counts.a).toBeGreaterThan(800)
  })

  test('zero-weight item is never picked', () => {
    const rng = makeRng(1)
    for (let i = 0; i < 200; i++) {
      const v = weightedPick(rng, ['a', 'b'], [0, 1])
      expect(v).toBe('b')
    }
  })
})

describe('chance', () => {
  test('p=1 always true', () => {
    const rng = makeRng(1)
    for (let i = 0; i < 50; i++) expect(chance(rng, 1)).toBe(true)
  })

  test('p=0 always false', () => {
    const rng = makeRng(1)
    for (let i = 0; i < 50; i++) expect(chance(rng, 0)).toBe(false)
  })

  test('p=0.5 hits roughly half the time', () => {
    const rng = makeRng(42)
    let hits = 0
    for (let i = 0; i < 1000; i++) if (chance(rng, 0.5)) hits++
    expect(hits).toBeGreaterThan(400)
    expect(hits).toBeLessThan(600)
  })
})

describe('pickN', () => {
  test('returns exactly N items', () => {
    const rng = makeRng(1)
    expect(pickN(rng, [1, 2, 3, 4, 5], 3)).toHaveLength(3)
  })

  test('no duplicates', () => {
    const rng = makeRng(2)
    const result = pickN(rng, [1, 2, 3, 4, 5], 5)
    expect(new Set(result).size).toBe(5)
  })
})
