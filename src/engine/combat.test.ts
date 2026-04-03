import { describe, test, expect } from 'bun:test'
import { makeRng } from './rng'
import { spawnMonster } from './monsters'
import { simulateCombat, applyCombatAction, type PlayerCombatStats } from './combat'
import { spawnBoss } from '../data/bosses'

const BASE_PLAYER: PlayerCombatStats = {
  hp: 100,
  maxHp: 100,
  damage: [10, 20],
  defense: 10,
  critChance: 10,
  attackSpeed: 50,
  stamina: 100,
}

const WEAK_PLAYER: PlayerCombatStats = {
  ...BASE_PLAYER,
  hp: 5,
  maxHp: 100,
  damage: [1, 2],
}

describe('simulateCombat', () => {
  test('outcome is victory or defeat', () => {
    const rng = makeRng(1)
    const monster = spawnMonster(rng, 1, 'normal')
    const result = simulateCombat(makeRng(2), BASE_PLAYER, monster)
    expect(['victory', 'defeat']).toContain(result.outcome)
  })

  test('same seed same outcome', () => {
    const m1 = spawnMonster(makeRng(5), 1, 'normal')
    const m2 = spawnMonster(makeRng(5), 1, 'normal')
    const r1 = simulateCombat(makeRng(10), BASE_PLAYER, m1)
    const r2 = simulateCombat(makeRng(10), BASE_PLAYER, m2)
    expect(r1.outcome).toBe(r2.outcome)
    expect(r1.rounds.length).toBe(r2.rounds.length)
  })

  test('never exceeds MAX_ROUNDS (no infinite loop)', () => {
    const rng = makeRng(42)
    for (let i = 0; i < 50; i++) {
      const monster = spawnMonster(rng, Math.floor(i / 5) + 1, 'normal')
      const result = simulateCombat(rng, BASE_PLAYER, monster)
      expect(result.rounds.length).toBeLessThanOrEqual(50)
    }
  })

  test('strong player beats floor 1 normal monster', () => {
    let victories = 0
    for (let seed = 0; seed < 20; seed++) {
      const rng = makeRng(seed)
      const monster = spawnMonster(rng, 1, 'normal')
      if (simulateCombat(rng, BASE_PLAYER, monster).outcome === 'victory') victories++
    }
    expect(victories).toBeGreaterThan(15)
  })

  test('weak player loses to ancient monster', () => {
    let defeats = 0
    for (let seed = 0; seed < 10; seed++) {
      const rng = makeRng(seed)
      const monster = spawnMonster(rng, 10, 'ancient')
      if (simulateCombat(rng, WEAK_PLAYER, monster).outcome === 'defeat') defeats++
    }
    expect(defeats).toBeGreaterThan(8)
  })

  test('victory sets xp gained', () => {
    const rng = makeRng(1)
    const monster = spawnMonster(rng, 1, 'normal')
    const result = simulateCombat(makeRng(3), BASE_PLAYER, monster)
    if (result.outcome === 'victory') {
      expect(result.xpGained).toBeGreaterThan(0)
    }
  })

  test('hpRemaining is <= maxHp', () => {
    const rng = makeRng(7)
    const monster = spawnMonster(rng, 1, 'normal')
    const result = simulateCombat(rng, BASE_PLAYER, monster)
    expect(result.hpRemaining).toBeLessThanOrEqual(BASE_PLAYER.maxHp)
    expect(result.hpRemaining).toBeGreaterThanOrEqual(0)
  })

  test('last round has monsterDied=true on victory', () => {
    for (let seed = 0; seed < 20; seed++) {
      const rng = makeRng(seed)
      const monster = spawnMonster(rng, 1, 'normal')
      const result = simulateCombat(rng, BASE_PLAYER, monster)
      if (result.outcome === 'victory') {
        const last = result.rounds[result.rounds.length - 1]
        expect(last.monsterDied).toBe(true)
      }
    }
  })
})

describe('applyCombatAction - flee', () => {
  test('flee action returns fled=true', () => {
    const rng = makeRng(1)
    const monster = spawnMonster(rng, 1, 'normal')
    const { result } = applyCombatAction(rng, { type: 'flee' }, 1, 100, BASE_PLAYER, monster)
    expect(result.fled).toBe(true)
    expect(result.monsterDied).toBe(false)
    expect(result.playerDied).toBe(false)
  })
})

describe('applyCombatAction - potion', () => {
  test('potion heals the player', () => {
    const rng = makeRng(1)
    const monster = spawnMonster(rng, 1, 'normal')
    const { result, newPlayerHp } = applyCombatAction(
      rng, { type: 'potion', healAmount: 30 }, 1, 50, BASE_PLAYER, monster
    )
    expect(newPlayerHp).toBeGreaterThan(50)
    expect(newPlayerHp).toBeLessThanOrEqual(BASE_PLAYER.maxHp)
  })
})

describe('combat stat interactions', () => {
  test('crit results in higher damage than base max', () => {
    // With 100% crit, damage should always be ~1.75× base
    const highCritPlayer = { ...BASE_PLAYER, critChance: 100 }
    const rng = makeRng(1)
    const monster = spawnMonster(rng, 1, 'normal')
    const { result } = applyCombatAction(rng, { type: 'attack' }, 1, 100, highCritPlayer, monster)
    expect(result.isCrit).toBe(true)
    expect(result.playerDamageDealt).toBeGreaterThan(BASE_PLAYER.damage[1])
  })
})

describe('boss mechanics', () => {
  const TOUGH_PLAYER: PlayerCombatStats = {
    ...BASE_PLAYER,
    hp: 5000,
    maxHp: 5000,
    damage: [200, 300],
    defense: 5,
    critChance: 0,
    attackSpeed: 50,
  }

  test('immune_round: player deals 0 damage on round 7', () => {
    const boss = spawnBoss(15, makeRng(1)) // Inferno Witch has immune_round
    expect(boss.bossMechanics).toContain('immune_round')

    // Simulate exactly round 7
    const { result } = applyCombatAction(makeRng(99), { type: 'attack' }, 7, TOUGH_PLAYER.hp, TOUGH_PLAYER, boss)
    expect(result.isImmuneRound).toBe(true)
    expect(result.playerDamageDealt).toBe(0)
    expect(result.elementalDealt).toBe(0)
    // Boss HP should not decrease
    expect(result.monsterHpAfter).toBe(boss.currentHp)
  })

  test('immune_round: rounds 1-6 are NOT immune', () => {
    const boss = spawnBoss(15, makeRng(1))
    for (let round = 1; round <= 6; round++) {
      const freshBoss = { ...boss, currentHp: boss.maxHp }
      const { result } = applyCombatAction(makeRng(42), { type: 'attack' }, round, TOUGH_PLAYER.hp, TOUGH_PLAYER, freshBoss)
      expect(result.isImmuneRound).toBe(false)
      // Player should deal some damage (unless miss, but with no dex penalty it's fine)
      if (!result.isMiss) {
        expect(result.playerDamageDealt).toBeGreaterThan(0)
      }
    }
  })

  test('enrage: isEnragedRound=true after round 5', () => {
    const boss = spawnBoss(5, makeRng(1)) // The Warden has enrage
    expect(boss.bossMechanics).toContain('enrage')

    const { result } = applyCombatAction(makeRng(1), { type: 'attack' }, 6, TOUGH_PLAYER.hp, TOUGH_PLAYER, boss)
    expect(result.isEnragedRound).toBe(true)
  })

  test('enrage: NOT active on round 5 or earlier', () => {
    const boss = spawnBoss(5, makeRng(1))
    const { result } = applyCombatAction(makeRng(1), { type: 'attack' }, 5, TOUGH_PLAYER.hp, TOUGH_PLAYER, boss)
    expect(result.isEnragedRound).toBe(false)
  })

  test('regen: boss HP increases after surviving a round', () => {
    const boss = spawnBoss(10, makeRng(1)) // Bonekeeper has regen
    expect(boss.bossMechanics).toContain('regen')

    // Deal some damage, but keep boss alive
    const damagedBoss = { ...boss, currentHp: Math.round(boss.maxHp * 0.7) }
    const regenRate   = boss.regenRate ?? 0.03
    const regenAmount = Math.round(boss.maxHp * regenRate)
    const { result } = applyCombatAction(makeRng(1), { type: 'attack' }, 1, TOUGH_PLAYER.hp, { ...TOUGH_PLAYER, damage: [1, 1] }, damagedBoss)

    expect(result.bossRegenHp).toBeGreaterThanOrEqual(regenAmount)
    // Monster HP after should be higher than (currentHp - any damage dealt from 1-1 damage)
    expect(result.monsterHpAfter).toBeGreaterThan(damagedBoss.currentHp - 10)
  })

  test('no_flee boss: bossMechanics includes no_flee', () => {
    const boss = spawnBoss(5, makeRng(1))
    expect(boss.bossMechanics).toContain('no_flee')
  })

  test('boss spawns with elevated HP compared to normal monster', () => {
    const rng = makeRng(1)
    const normal = spawnMonster(rng, 5, 'normal')
    const boss   = spawnBoss(5, makeRng(2))
    expect(boss.maxHp).toBeGreaterThan(normal.maxHp * 1.5)
  })

  test('boss fight can be won by a very strong player', () => {
    const superPlayer: PlayerCombatStats = {
      hp: 99999, maxHp: 99999,
      damage: [2000, 3000],
      defense: 999,
      critChance: 0,
      attackSpeed: 100,
      stamina: 999,
    }
    const boss   = spawnBoss(5, makeRng(1))
    const result = simulateCombat(makeRng(1), superPlayer, boss)
    expect(result.outcome).toBe('victory')
    expect(result.xpGained).toBeGreaterThan(0)
  })
})
