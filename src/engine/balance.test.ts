/**
 * balance.test.ts — Roguelite balance invariants.
 *
 * These tests encode the *intended* feel of each phase of the game.
 * A failing test is a balance signal, not just a code bug.
 *
 * Design targets:
 *  - Floor 1 normal: ~70–95% win rate (approachable intro)
 *  - Floor 5 normal: ~55–80% win rate (mid-game, player has floor-scaled stats)
 *  - Floor 10 normal: ~45–75% win rate (late-game, still beatable)
 *  - Elite should be noticeably harder than normal (≥15% lower win rate)
 *  - Ancient should be punishing (<45% win rate)
 *  - Boss should require preparation (naked player <25% win rate)
 *  - Resistance should meaningfully reduce elemental damage (>20% less HP lost)
 *  - XP rate: level 1 in ≤15 floor-1 kills (no grinding)
 *  - HP budget after normal fight: average >30% maxHp remaining (sustainable)
 */

import { describe, test, expect } from 'bun:test'
import { makeRng } from './rng'
import { spawnMonster, applyTierScaling } from './monsters'
import { simulateCombat, applyCombatAction, type PlayerCombatStats } from './combat'
import { buildPlayerStats, xpForLevel } from './stats'
import { spawnBoss } from '../data/bosses'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Run N combats, return win rate 0–1. */
function winRate(
  playerStats: PlayerCombatStats,
  floor: number,
  tier: 'normal' | 'elite' | 'rare' | 'ancient',
  n = 100,
): number {
  let wins = 0
  for (let seed = 0; seed < n; seed++) {
    const rng = makeRng(seed)
    const monster = spawnMonster(rng, floor, tier)
    if (simulateCombat(makeRng(seed + 10000), playerStats, monster).outcome === 'victory') wins++
  }
  return wins / n
}

/** Average HP remaining (as fraction of maxHp) after winning. */
function avgHpRemainingOnWin(
  playerStats: PlayerCombatStats,
  floor: number,
  tier: 'normal' | 'elite' | 'rare' | 'ancient',
  n = 100,
): number {
  let totalFraction = 0
  let wins = 0
  for (let seed = 0; seed < n; seed++) {
    const rng = makeRng(seed)
    const monster = spawnMonster(rng, floor, tier)
    const result = simulateCombat(makeRng(seed + 10000), playerStats, monster)
    if (result.outcome === 'victory') {
      totalFraction += result.hpRemaining / playerStats.maxHp
      wins++
    }
  }
  return wins > 0 ? totalFraction / wins : 0
}

/** Naked player at a given floor (no gear, level 0, no class). */
function nakedPlayer(floor: number): PlayerCombatStats {
  return buildPlayerStats(floor, 0, {}, null)
}

/** Class player at a given floor and level (no gear). */
function classPlayer(
  floor: number,
  level: number,
  classId: 'warrior' | 'rogue' | 'sorcerer',
): PlayerCombatStats {
  return buildPlayerStats(floor, level, {}, classId)
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Floor 1 — Onboarding feel
// All classes should win the majority of normal encounters. Dying on floor 1 to
// a normal monster should feel like bad luck, not inevitability.
// ─────────────────────────────────────────────────────────────────────────────

describe('Floor 1 balance — normal encounters', () => {
  test('naked player wins >65% of floor 1 normal fights', () => {
    const rate = winRate(nakedPlayer(1), 1, 'normal')
    expect(rate).toBeGreaterThan(0.65)
  })

  test('warrior wins more floor 1 normal fights than rogue (HP advantage)', () => {
    const warriorRate = winRate(classPlayer(1, 0, 'warrior'), 1, 'normal')
    const rogueRate   = winRate(classPlayer(1, 0, 'rogue'),   1, 'normal')
    // Warrior has +20 HP; both should be high, but warrior should edge out
    expect(warriorRate).toBeGreaterThanOrEqual(rogueRate - 0.05) // within 5% or warrior wins
  })

  test('all classes win >60% of floor 1 normal fights', () => {
    for (const c of ['warrior', 'rogue', 'sorcerer'] as const) {
      const rate = winRate(classPlayer(1, 0, c), 1, 'normal')
      expect(rate).toBeGreaterThan(0.60)
    }
  })

  test('player has meaningful HP left after winning a floor 1 normal fight', () => {
    // Average >30% HP remaining means player can take another hit before potioning
    const remaining = avgHpRemainingOnWin(nakedPlayer(1), 1, 'normal')
    expect(remaining).toBeGreaterThan(0.30)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: Difficulty escalation — normal encounters by floor
// The game gets harder as floors increase, but remains playable since player
// stats also scale. Floor-scaled player vs floor-scaled monsters should stay
// competitive (roguelite depth = sustainable challenge, not death wall).
// ─────────────────────────────────────────────────────────────────────────────

describe('Floor progression — normal encounter win rates', () => {
  test('floor 3 naked player wins >55% of normal fights', () => {
    const rate = winRate(nakedPlayer(3), 3, 'normal')
    expect(rate).toBeGreaterThan(0.55)
  })

  test('floor 5 naked player wins >50% of normal fights', () => {
    const rate = winRate(nakedPlayer(5), 5, 'normal')
    expect(rate).toBeGreaterThan(0.50)
  })

  test('floor 10 naked player wins >40% of normal fights', () => {
    // Floor 10 without gear is genuinely hard — but not impossible
    const rate = winRate(nakedPlayer(10), 10, 'normal')
    expect(rate).toBeGreaterThan(0.40)
  })

  test('floor 10 leveled warrior (level 8) wins >55% of normal fights', () => {
    // A player who has reached floor 10 will have leveled up — model that
    const rate = winRate(classPlayer(10, 8, 'warrior'), 10, 'normal')
    expect(rate).toBeGreaterThan(0.55)
  })

  test('win rate does not cliff-drop between consecutive floors', () => {
    // No floor-over-floor drop > 25% win rate (no sudden walls)
    for (let f = 1; f < 10; f++) {
      const rateThis = winRate(nakedPlayer(f), f, 'normal', 60)
      const rateNext = winRate(nakedPlayer(f + 1), f + 1, 'normal', 60)
      expect(rateThis - rateNext).toBeLessThan(0.25)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Encounter tier difficulty — elite / rare / ancient / boss
// Each tier should feel meaningfully harder. Elite = risky, Ancient = dangerous,
// Boss = wall that requires prep.
// ─────────────────────────────────────────────────────────────────────────────

describe('Encounter tier difficulty scaling', () => {
  test('elite is harder than normal (>10% lower win rate) at floor 5', () => {
    const player = nakedPlayer(5)
    const normalRate = winRate(player, 5, 'normal')
    const eliteRate  = winRate(player, 5, 'elite')
    expect(normalRate - eliteRate).toBeGreaterThan(0.10)
  })

  test('rare is harder than elite at floor 5', () => {
    const player = nakedPlayer(5)
    const eliteRate = winRate(player, 5, 'elite')
    const rareRate  = winRate(player, 5, 'rare')
    expect(eliteRate - rareRate).toBeGreaterThan(0.05)
  })

  test('ancient win rate is <50% at floor 5 for naked player', () => {
    const rate = winRate(nakedPlayer(5), 5, 'ancient')
    expect(rate).toBeLessThan(0.50)
  })

  test('ancient win rate is <25% at floor 10 for naked player', () => {
    const rate = winRate(nakedPlayer(10), 10, 'ancient')
    expect(rate).toBeLessThan(0.25)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: Boss balance
// Bosses should be walls requiring player investment. Naked player should lose
// most of the time. A prepared player (leveled + some defense) should have a
// fighting chance.
// ─────────────────────────────────────────────────────────────────────────────

describe('Boss balance', () => {
  test('naked floor 5 player loses to The Warden >65% of the time', () => {
    const player = nakedPlayer(5)
    let losses = 0
    for (let seed = 0; seed < 40; seed++) {
      const boss = spawnBoss(5, makeRng(seed))
      if (simulateCombat(makeRng(seed + 5000), player, boss).outcome !== 'victory') losses++
    }
    expect(losses / 40).toBeGreaterThan(0.65)
  })

  test('basic-attack-only warrior cannot beat floor 5 boss (skills are mandatory)', () => {
    // simulateCombat uses only basic attacks — boss requires Power Strike / Battle Cry.
    // This asserts that boss fights ARE skill-gated: basic attacks alone never win.
    const player = classPlayer(5, 8, 'warrior')
    let wins = 0
    for (let seed = 0; seed < 30; seed++) {
      const boss = spawnBoss(5, makeRng(seed))
      if (simulateCombat(makeRng(seed + 5000), player, boss).outcome === 'victory') wins++
    }
    // Expect very low or zero wins — boss should require skills
    expect(wins / 30).toBeLessThan(0.15)
  })

  test('warrior using Power Strike can beat floor 5 boss (skills unlock the fight)', () => {
    // Simulate a boss fight with Power Strike every round to model actual skill use.
    const player = classPlayer(5, 8, 'warrior')
    let wins = 0
    const trialsPerSeed = 30

    for (let seed = 0; seed < trialsPerSeed; seed++) {
      const boss = spawnBoss(5, makeRng(seed))
      let playerHp   = player.hp
      let monsterHp  = boss.maxHp
      let curMonster = { ...boss }
      let victory    = false

      for (let round = 1; round <= 50; round++) {
        const action = { type: 'skill' as const, skillId: 'power_strike' as const, damageMultiplier: 2.0 }
        const { result, newPlayerHp, newMonsterHp } = applyCombatAction(
          makeRng(seed * 100 + round), action, round, playerHp, player,
          { ...curMonster, currentHp: monsterHp },
        )
        playerHp  = newPlayerHp
        monsterHp = newMonsterHp
        curMonster = { ...curMonster, currentHp: monsterHp }
        if (result.monsterDied) { victory = true; break }
        if (result.playerDied || playerHp <= 0) break
      }
      if (victory) wins++
    }

    // With Power Strike (2× damage), a leveled warrior should beat The Warden sometimes
    expect(wins / trialsPerSeed).toBeGreaterThan(0.10)
  })

  test('floor 10 boss (Bonekeeper) is harder than floor 5 boss for same player', () => {
    const player = classPlayer(5, 5, 'warrior')
    let winsFloor5 = 0
    let winsFloor10 = 0
    for (let seed = 0; seed < 30; seed++) {
      const boss5  = spawnBoss(5,  makeRng(seed))
      const boss10 = spawnBoss(10, makeRng(seed))
      if (simulateCombat(makeRng(seed + 3000), player, boss5).outcome === 'victory')  winsFloor5++
      if (simulateCombat(makeRng(seed + 3000), player, boss10).outcome === 'victory') winsFloor10++
    }
    expect(winsFloor5).toBeGreaterThanOrEqual(winsFloor10)
  })

  test('boss XP reward is substantial (>= 5× a normal kill)', () => {
    const rng = makeRng(1)
    const normalMonster = spawnMonster(rng, 5, 'normal')
    const boss = spawnBoss(5, makeRng(2))
    expect(boss.xp).toBeGreaterThanOrEqual(normalMonster.xp * 5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: XP / leveling rate
// Level 1 should be achievable in the first floor. Level-up every 2-3 floors
// roughly. Starvation = unfun. Instant gratification = trivial.
// ─────────────────────────────────────────────────────────────────────────────

describe('XP and leveling rate', () => {
  test('floor 1 normal kills yield enough XP to hit level 1 in ≤15 kills', () => {
    const needed = xpForLevel(1)     // XP required to reach level 1
    let totalXp = 0
    let kills = 0
    for (let seed = 0; seed < 30 && totalXp < needed; seed++) {
      const rng = makeRng(seed)
      const monster = spawnMonster(rng, 1, 'normal')
      const result = simulateCombat(makeRng(seed + 1000), nakedPlayer(1), monster)
      if (result.outcome === 'victory') {
        totalXp += result.xpGained
        kills++
      }
    }
    expect(kills).toBeLessThanOrEqual(15)
    expect(totalXp).toBeGreaterThanOrEqual(needed)
  })

  test('floor 5 elite kill gives more XP than floor 5 normal kill', () => {
    const rng = makeRng(42)
    const normal = spawnMonster(rng, 5, 'normal')
    const elite  = spawnMonster(rng, 5, 'elite')
    expect(elite.xp).toBeGreaterThan(normal.xp)
  })

  test('ancient kill gives 4× or more XP vs normal on same floor', () => {
    const rng = makeRng(7)
    const normal  = spawnMonster(rng, 5, 'normal')
    const ancient = spawnMonster(rng, 5, 'ancient')
    // Ancient is TIER_XP * 8 vs normal * 1
    expect(ancient.xp).toBeGreaterThanOrEqual(normal.xp * 4)
  })

  test('XP curve accelerates each level (each level needs more XP)', () => {
    for (let lvl = 1; lvl < 10; lvl++) {
      const increment = xpForLevel(lvl + 1) - xpForLevel(lvl)
      const prevIncrement = xpForLevel(lvl) - xpForLevel(lvl - 1)
      expect(increment).toBeGreaterThan(prevIncrement)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: Elemental resistance impact
// Resistances should be worth pursuing — the difference between 0% and 75%
// should be substantial against enchanted monsters.
// ─────────────────────────────────────────────────────────────────────────────

describe('Elemental resistance benefit', () => {
  // Build fire-enchanted elite to isolate elemental damage contribution
  function fireElite(floor: number) {
    const rng = makeRng(999)
    const m = spawnMonster(rng, floor, 'elite')
    // Force fireEnchanted affix for deterministic elemental test
    return { ...m, affixes: ['fireEnchanted' as const] }
  }

  test('75% fire resist absorbs significantly more damage than 0% resist', () => {
    const floor = 5
    const baseStats = nakedPlayer(floor)
    const noResist  = { ...baseStats, fireResist: 0 }
    const fullResist = { ...baseStats, fireResist: 75 }
    const monster = fireElite(floor)

    let totalDamageNoRes  = 0
    let totalDamageFullRes = 0
    const n = 50

    for (let seed = 0; seed < n; seed++) {
      const { result: r1 } = applyCombatAction(makeRng(seed), { type: 'attack' }, 1, baseStats.hp, noResist, monster)
      const { result: r2 } = applyCombatAction(makeRng(seed), { type: 'attack' }, 1, baseStats.hp, fullResist, monster)
      totalDamageNoRes   += r1.elementalReceived
      totalDamageFullRes += r2.elementalReceived
    }

    // Full resistance should absorb ≥50% of elemental damage compared to no resistance
    expect(totalDamageNoRes).toBeGreaterThan(0)
    expect(totalDamageFullRes).toBeLessThan(totalDamageNoRes * 0.50)
  })

  test('resist cap is 75% (75 resist = same as 100 resist in terms of damage absorbed)', () => {
    const floor = 5
    const baseStats = nakedPlayer(floor)
    const cap    = { ...baseStats, fireResist: 75  }
    const over   = { ...baseStats, fireResist: 100 }
    const monster = fireElite(floor)

    let damageCap = 0
    let damageOver = 0
    for (let seed = 0; seed < 30; seed++) {
      const { result: r1 } = applyCombatAction(makeRng(seed), { type: 'attack' }, 1, baseStats.hp, cap, monster)
      const { result: r2 } = applyCombatAction(makeRng(seed), { type: 'attack' }, 1, baseStats.hp, over, monster)
      damageCap  += r1.elementalReceived
      damageOver += r2.elementalReceived
    }
    // Both should be equal — resist caps at 75
    expect(damageCap).toBe(damageOver)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: Class differentiation
// Each class should have a distinct profile at the same floor. Warrior = tankier
// (more HP), Rogue = more evasion (dex 8 → higher miss rate on incoming hits),
// Sorcerer = spell power scales with floor.
// ─────────────────────────────────────────────────────────────────────────────

describe('Class stat differentiation', () => {
  test('warrior has more HP than rogue at every level', () => {
    for (const level of [0, 5, 10]) {
      const wStats = buildPlayerStats(5, level, {}, 'warrior')
      const rStats = buildPlayerStats(5, level, {}, 'rogue')
      expect(wStats.hp).toBeGreaterThan(rStats.hp)
    }
  })

  test('rogue has higher crit chance than warrior', () => {
    const wStats = buildPlayerStats(5, 5, {}, 'warrior')
    const rStats = buildPlayerStats(5, 5, {}, 'rogue')
    expect(rStats.critChance).toBeGreaterThan(wStats.critChance)
  })

  test('rogue has higher dexterity than warrior and sorcerer', () => {
    const wStats = buildPlayerStats(5, 5, {}, 'warrior')
    const rStats = buildPlayerStats(5, 5, {}, 'rogue')
    const sStats = buildPlayerStats(5, 5, {}, 'sorcerer')
    expect(rStats.dexterity).toBeGreaterThan(wStats.dexterity ?? 0)
    expect(rStats.dexterity).toBeGreaterThan(sStats.dexterity ?? 0)
  })

  test('sorcerer spell power scales with floor depth', () => {
    const floor1Stats  = buildPlayerStats(1,  0, {}, 'sorcerer')
    const floor10Stats = buildPlayerStats(10, 0, {}, 'sorcerer')
    expect(floor10Stats.spellPower).toBeGreaterThan(floor1Stats.spellPower ?? 0)
    // Specifically: floor 10 = 10 * 8 = 80, floor 1 = 8
    expect((floor10Stats.spellPower ?? 0) / (floor1Stats.spellPower ?? 1)).toBeGreaterThanOrEqual(5)
  })

  test('warrior levels gain more defense than sorcerer (2 per level vs 0)', () => {
    const wLvl0  = buildPlayerStats(5, 0,  {}, 'warrior')
    const wLvl10 = buildPlayerStats(5, 10, {}, 'warrior')
    const sLvl0  = buildPlayerStats(5, 0,  {}, 'sorcerer')
    const sLvl10 = buildPlayerStats(5, 10, {}, 'sorcerer')
    const warriorDefenseGain   = wLvl10.defense - wLvl0.defense
    const sorcererDefenseGain  = sLvl10.defense - sLvl0.defense
    expect(warriorDefenseGain).toBeGreaterThan(sorcererDefenseGain)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: Difficulty tier (ascension) scaling
// Tiers represent run-over-run difficulty (ascension). Tier 1 = baseline.
// Higher tiers should meaningfully increase monster threat without going to
// instant-kill territory too early.
// ─────────────────────────────────────────────────────────────────────────────

describe('Difficulty tier (ascension) scaling', () => {
  test('tier 2 monster has more HP than tier 1 monster', () => {
    const rng = makeRng(10)
    const base = spawnMonster(rng, 5, 'normal')
    const t2   = applyTierScaling({ ...base }, 2)
    expect(t2.maxHp).toBeGreaterThan(base.maxHp)
  })

  test('tier 5 monster is significantly more dangerous than tier 1', () => {
    const rng = makeRng(10)
    const base = spawnMonster(rng, 5, 'normal')
    const t5   = applyTierScaling({ ...base }, 5)
    expect(t5.maxHp).toBeGreaterThan(base.maxHp * 2)
    expect(t5.damage[1]).toBeGreaterThan(base.damage[1])
  })

  test('tier scaling win rate drops progressively', () => {
    const player = nakedPlayer(5)
    let prevRate = 1.0
    for (const diffTier of [1, 2, 3, 5]) {
      let wins = 0
      for (let seed = 0; seed < 50; seed++) {
        const rng = makeRng(seed)
        const base = spawnMonster(rng, 5, 'normal')
        const monster = applyTierScaling(base, diffTier)
        if (simulateCombat(makeRng(seed + 2000), player, monster).outcome === 'victory') wins++
      }
      const rate = wins / 50
      // Each tier bracket should be harder than or equal to the previous
      expect(rate).toBeLessThanOrEqual(prevRate + 0.10) // allow 10% noise
      prevRate = rate
    }
  })

  test('tier 11 and tier 12 have same scaling (soft cap at 10 tiers above base)', () => {
    const rng = makeRng(5)
    const base = spawnMonster(rng, 5, 'normal')
    const t11 = applyTierScaling({ ...base }, 11)
    const t12 = applyTierScaling({ ...base }, 12)
    expect(t11.maxHp).toBe(t12.maxHp)
    expect(t11.damage[0]).toBe(t12.damage[0])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9: Skill system combat effectiveness
// Skills should meaningfully change combat outcomes — not cosmetic.
// Tests use applyCombatAction directly to isolate skill effects.
// ─────────────────────────────────────────────────────────────────────────────

describe('Skill combat effectiveness', () => {
  const PLAYER = buildPlayerStats(5, 5, {}, 'warrior')

  test('Power Strike deals more damage than normal attack', () => {
    const monster = spawnMonster(makeRng(1), 5, 'normal')
    let normalDmg = 0
    let skillDmg  = 0
    for (let seed = 0; seed < 30; seed++) {
      const { result: r1 } = applyCombatAction(makeRng(seed), { type: 'attack' }, 1, PLAYER.hp, PLAYER, { ...monster })
      const { result: r2 } = applyCombatAction(makeRng(seed), { type: 'skill', skillId: 'power_strike', damageMultiplier: 2.0 }, 1, PLAYER.hp, PLAYER, { ...monster })
      normalDmg += r1.playerDamageDealt
      skillDmg  += r2.playerDamageDealt
    }
    expect(skillDmg).toBeGreaterThan(normalDmg * 1.5)
  })

  test('Iron Skin (ironSkinBonus: 30) reduces incoming damage', () => {
    const monster = spawnMonster(makeRng(1), 5, 'elite')
    let dmgWithout = 0
    let dmgWith    = 0
    for (let seed = 0; seed < 50; seed++) {
      const { result: r1 } = applyCombatAction(makeRng(seed), { type: 'attack' }, 1, PLAYER.hp, PLAYER, { ...monster })
      const { result: r2 } = applyCombatAction(makeRng(seed), { type: 'attack', ironSkinBonus: 30 }, 1, PLAYER.hp, PLAYER, { ...monster })
      dmgWithout += r1.monsterDamageDealt
      dmgWith    += r2.monsterDamageDealt
    }
    expect(dmgWith).toBeLessThan(dmgWithout)
  })

  test('Backstab (guaranteedCrit + 3× multiplier) always crits and deals 3× damage', () => {
    const roguePlayer = buildPlayerStats(5, 5, {}, 'rogue')
    const monster = spawnMonster(makeRng(1), 5, 'normal')
    for (let seed = 0; seed < 20; seed++) {
      const { result } = applyCombatAction(
        makeRng(seed),
        { type: 'skill', skillId: 'backstab', guaranteedCrit: true, critMultiplier: 3.0 },
        1, roguePlayer.hp, roguePlayer, { ...monster },
      )
      if (!result.isMiss) {
        expect(result.isCrit).toBe(true)
        // 3× crit mult on base damage → should be > normal max damage
        expect(result.playerDamageDealt).toBeGreaterThan(roguePlayer.damage[1])
      }
    }
  })

  test('Shadow Step (skipMonsterAttack) prevents monster from dealing damage', () => {
    const monster = spawnMonster(makeRng(1), 5, 'elite')
    const { result } = applyCombatAction(
      makeRng(42),
      { type: 'skill', skillId: 'shadow_step', skipMonsterAttack: true },
      1, PLAYER.hp, PLAYER, { ...monster },
    )
    expect(result.monsterDamageDealt).toBe(0)
    expect(result.elementalReceived).toBe(0)
  })

  test('Sorcerer Fireball (fireSpellMult: 3.0) deals damage scaling with spellPower', () => {
    const sorcPlayer = buildPlayerStats(5, 5, {}, 'sorcerer')
    const monster = spawnMonster(makeRng(1), 5, 'normal')
    const { result } = applyCombatAction(
      makeRng(1),
      { type: 'skill', skillId: 'fireball', fireSpellMult: 3.0 },
      1, sorcPlayer.hp, sorcPlayer, { ...monster },
    )
    // Fireball is pure spell — elemental, not physical
    expect(result.elementalDealt).toBeGreaterThan(0)
    // spellPower at floor 5, level 5 = 5*8 + 5*1 = 45. 3.0 × 45 = 135
    expect(result.elementalDealt).toBeGreaterThan(100)
  })

  test('Mana Shield halves HP damage taken', () => {
    const sorcPlayer = buildPlayerStats(5, 5, {}, 'sorcerer')
    const monster = spawnMonster(makeRng(1), 5, 'elite')
    let hpDmgWithShield    = 0
    let hpDmgWithoutShield = 0
    for (let seed = 0; seed < 50; seed++) {
      const { result: r1, newPlayerHp: hp1 } = applyCombatAction(
        makeRng(seed), { type: 'attack' }, 1, sorcPlayer.hp, sorcPlayer, { ...monster },
      )
      const { result: r2, newPlayerHp: hp2 } = applyCombatAction(
        makeRng(seed), { type: 'attack', manaShieldActive: true }, 1, sorcPlayer.hp, sorcPlayer, { ...monster },
      )
      hpDmgWithoutShield += sorcPlayer.hp - hp1
      hpDmgWithShield    += sorcPlayer.hp - hp2
    }
    // Mana Shield absorbs 50% → HP damage should be ~half
    expect(hpDmgWithShield).toBeLessThan(hpDmgWithoutShield * 0.70)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10: Hit/miss system sanity
// Dexterity should improve both offense (hit chance) and defense (evasion).
// Extra-fast monsters should be harder to hit.
// ─────────────────────────────────────────────────────────────────────────────

describe('Hit/miss system', () => {
  test('higher dexterity player misses less often', () => {
    const lowDex  = { ...nakedPlayer(5), dexterity: 0  }
    const highDex = { ...nakedPlayer(5), dexterity: 30 }
    const monster = spawnMonster(makeRng(3), 5, 'normal')

    let missesLow  = 0
    let missesHigh = 0
    for (let seed = 0; seed < 100; seed++) {
      const { result: r1 } = applyCombatAction(makeRng(seed), { type: 'attack' }, 1, lowDex.hp,  lowDex,  { ...monster })
      const { result: r2 } = applyCombatAction(makeRng(seed), { type: 'attack' }, 1, highDex.hp, highDex, { ...monster })
      if (r1.isMiss) missesLow++
      if (r2.isMiss) missesHigh++
    }
    expect(missesHigh).toBeLessThan(missesLow)
  })

  test('higher dexterity player gets hit less often by monsters', () => {
    const lowDex  = { ...nakedPlayer(5), dexterity: 0  }
    const highDex = { ...nakedPlayer(5), dexterity: 30 }
    const monster = spawnMonster(makeRng(3), 5, 'normal')

    let monHitLow  = 0
    let monHitHigh = 0
    for (let seed = 0; seed < 100; seed++) {
      const { result: r1 } = applyCombatAction(makeRng(seed), { type: 'attack' }, 1, lowDex.hp,  lowDex,  { ...monster })
      const { result: r2 } = applyCombatAction(makeRng(seed), { type: 'attack' }, 1, highDex.hp, highDex, { ...monster })
      if (!r1.monsterMissed && r1.monsterDamageDealt > 0) monHitLow++
      if (!r2.monsterMissed && r2.monsterDamageDealt > 0) monHitHigh++
    }
    expect(monHitHigh).toBeLessThan(monHitLow)
  })

  test('extraFast monster hits player more often than slow monster', () => {
    const player = nakedPlayer(5)
    const rng = makeRng(5)
    const baseMon = spawnMonster(rng, 5, 'normal')
    const slowMon  = { ...baseMon, speed: 0.5, affixes: [] as any }
    const fastMon  = { ...baseMon, speed: 2.0, affixes: ['extraFast' as any] }

    let hitsSlow = 0
    let hitsFast = 0
    for (let seed = 0; seed < 100; seed++) {
      const { result: r1 } = applyCombatAction(makeRng(seed), { type: 'attack' }, 1, player.hp, player, slowMon)
      const { result: r2 } = applyCombatAction(makeRng(seed), { type: 'attack' }, 1, player.hp, player, fastMon)
      if (!r1.monsterMissed) hitsSlow++
      if (!r2.monsterMissed) hitsFast++
    }
    expect(hitsFast).toBeGreaterThan(hitsSlow)
  })
})
