import { describe, test, expect } from 'bun:test'
import { makeRng } from './rng'
import { rollEncounter, sampleEncounterRates, getBaseRates, EncounterType, BASE_WEIGHTS } from './encounter'

describe('rollEncounter', () => {
  test('returns a valid encounter type', () => {
    const rng = makeRng(1)
    const valid = Object.values(EncounterType)
    for (let i = 0; i < 100; i++) {
      expect(valid).toContain(rollEncounter(rng))
    }
  })

  test('same seed same results', () => {
    const a = Array.from({ length: 20 }, () => rollEncounter(makeRng(99)))
    const b = Array.from({ length: 20 }, () => rollEncounter(makeRng(99)))
    expect(a).toEqual(b)
  })
})

describe('encounter distribution (floor 1)', () => {
  test('empty is most common (~70% on warmup floor 1)', () => {
    // Floor 1 uses warmup pacing (empty=700 weight) — more breathing room for new players
    const rng = makeRng(42)
    const rates = sampleEncounterRates(rng, 10000, 1)
    const emptyPct = rates[EncounterType.Empty] / 10000
    expect(emptyPct).toBeGreaterThan(0.60)
    expect(emptyPct).toBeLessThan(0.75)
  })

  test('normal combat is second most common (~25%)', () => {
    const rng = makeRng(42)
    const rates = sampleEncounterRates(rng, 10000, 1)
    const pct = rates[EncounterType.Normal] / 10000
    expect(pct).toBeGreaterThan(0.20)
    expect(pct).toBeLessThan(0.30)
  })

  test('ancient is rare (<1%)', () => {
    const rng = makeRng(42)
    const rates = sampleEncounterRates(rng, 10000, 1)
    const pct = rates[EncounterType.Ancient] / 10000
    expect(pct).toBeLessThan(0.015)
  })

  test('all rollable types appear in 10k samples', () => {
    const rng = makeRng(7)
    const rates = sampleEncounterRates(rng, 10000, 1)
    // Boss is not rolled via rollEncounter — it is forced by gridStore on boss floors
    const rollableTypes = Object.values(EncounterType).filter(t => t !== EncounterType.Boss)
    for (const type of rollableTypes) {
      expect(rates[type]).toBeGreaterThan(0)
    }
  })
})

describe('encounter distribution scaling with floor', () => {
  test('higher floors have more elite encounters', () => {
    const rng1 = makeRng(1)
    const rng2 = makeRng(1)
    const floor1 = sampleEncounterRates(rng1, 5000, 1)
    const floor15 = sampleEncounterRates(rng2, 5000, 15)
    expect(floor15[EncounterType.Elite]).toBeGreaterThan(floor1[EncounterType.Elite])
  })

  test('higher floors have fewer empty tiles', () => {
    const rng1 = makeRng(5)
    const rng2 = makeRng(5)
    const floor1 = sampleEncounterRates(rng1, 5000, 1)
    const floor20 = sampleEncounterRates(rng2, 5000, 20)
    expect(floor20[EncounterType.Empty]).toBeLessThan(floor1[EncounterType.Empty])
  })

  test('empty never drops below 10% even at high floors', () => {
    const rng = makeRng(3)
    const rates = sampleEncounterRates(rng, 5000, 50)
    const pct = rates[EncounterType.Empty] / 5000
    expect(pct).toBeGreaterThan(0.10)
  })
})

describe('getBaseRates', () => {
  test('rates sum to ~1', () => {
    const rates = getBaseRates()
    const sum = Object.values(rates).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 5)
  })
})
