/**
 * balanceSim — Comprehensive balance harness.
 * Tests win rate, TTK, and HP remaining across scenarios.
 * bun run src/sim/balanceSim.ts
 *
 * Questions answered:
 *  1. Win rate by floor (tier 1) — naked player
 *  2. Win rate by floor (tier 1) — naked player vs ALL encounter tiers
 *  3. Level impact: floor 5, level 0 → 15
 *  4. Dexterity impact: floor 5, dex 0 → 40
 *  5. Block impact: floor 5, block 0% → 75%
 *  6. Tier scaling: floor 5, tiers 1 → 8 — where does it break?
 *  7. Elemental gear vs enchanted monsters
 *  8. Loot quality distribution by tier (MF bonus)
 */

import { makeRng, type Rng } from '../engine/rng'
import { spawnMonster, type EncounterTier } from '../engine/monsters'
import type { MonsterAffix } from '../data/monsters'
import { simulateCombat, type PlayerCombatStats } from '../engine/combat'
import { generateItem } from '../engine/loot'

// ── Headless buildPlayerStats (mirrors combatStore.buildPlayerStats) ──────────

function buildStats(opts: {
  floor?:          number
  level?:          number
  dexterity?:      number
  blockChance?:    number
  fireDamage?:     number
  coldDamage?:     number
  lightningDamage?: number
  fireResist?:     number
  coldResist?:     number
  lightResist?:    number
  extraLife?:      number
  extraDamage?:    number
  extraDefense?:   number
  extraAttackSpeed?: number
}): PlayerCombatStats {
  const f   = opts.floor   ?? 1
  const lvl = opts.level   ?? 0
  return {
    hp:              80 + f * 5 + lvl * 5 + (opts.extraLife ?? 0),
    maxHp:           80 + f * 5 + lvl * 5 + (opts.extraLife ?? 0),
    damage: [
      8  + f * 2 + lvl + (opts.extraDamage ?? 0),
      16 + f * 3 + lvl + (opts.extraDamage ?? 0),
    ],
    defense:         5 + f * 2 + lvl + (opts.extraDefense ?? 0),
    critChance:      10 + Math.floor(lvl / 5) * 2,
    attackSpeed:     50 + (opts.extraAttackSpeed ?? 0),
    stamina:         100,
    dexterity:       opts.dexterity      ?? 0,
    blockChance:     Math.min(75, opts.blockChance ?? 0),
    fireDamage:      opts.fireDamage     ?? 0,
    coldDamage:      opts.coldDamage     ?? 0,
    lightningDamage: opts.lightningDamage ?? 0,
    fireResist:      Math.min(75, opts.fireResist  ?? 0),
    coldResist:      Math.min(75, opts.coldResist  ?? 0),
    lightResist:     Math.min(75, opts.lightResist ?? 0),
  }
}

// ── Tier monster scaling (mirrors combatStore.applyTierScaling) ───────────────

function scaledMonster(rng: Rng, floor: number, encTier: EncounterTier, diffTier: number) {
  let m = spawnMonster(rng, floor, encTier)
  if (diffTier <= 1) return m
  const hpMult  = 1 + (diffTier - 1) * 0.40
  const dmgMult = 1 + (diffTier - 1) * 0.28
  const scaledHp = Math.round(m.maxHp * hpMult)
  return {
    ...m,
    maxHp:     scaledHp,
    currentHp: scaledHp,
    damage: [
      Math.round(m.damage[0] * dmgMult),
      Math.round(m.damage[1] * dmgMult),
    ] as [number, number],
  }
}

// ── Simulation runner ──────────────────────────────────────────────────────────

interface SimResult {
  wins: number
  losses: number
  totalRounds: number
  totalHpLeft: number
  hitCap: number
  N: number
}

function runScenario(
  N: number,
  baseSeed: number,
  floor: number,
  encTier: EncounterTier,
  diffTier: number,
  player: PlayerCombatStats,
): SimResult {
  let wins = 0, losses = 0, totalRounds = 0, totalHpLeft = 0, hitCap = 0
  for (let i = 0; i < N; i++) {
    const rng = makeRng(baseSeed + i * 7919)
    const monster = scaledMonster(rng, floor, encTier, diffTier)
    const result  = simulateCombat(rng, player, monster)
    if (result.outcome === 'victory') {
      wins++
      totalHpLeft += result.hpRemaining
    } else {
      losses++
    }
    totalRounds += result.rounds.length
    if (result.rounds.length >= 50) hitCap++
  }
  return { wins, losses, totalRounds, totalHpLeft, hitCap, N }
}

function fmt(r: SimResult) {
  const winPct  = (r.wins / r.N * 100).toFixed(1).padStart(5)
  const avgRnd  = (r.totalRounds / r.N).toFixed(1).padStart(5)
  const avgHp   = r.wins > 0 ? (r.totalHpLeft / r.wins).toFixed(0).padStart(4) : ' N/A'
  const capWarn = r.hitCap > 0 ? ` ⚠ ${r.hitCap} cap` : ''
  const flag    = r.wins / r.N < 0.40 ? ' ❌ TOO HARD' : r.wins / r.N > 0.97 ? ' 😴 TRIVIAL' : ''
  return `${winPct}% win  ${avgRnd} rnd  ${avgHp} hp left${capWarn}${flag}`
}

const N = 500
const BASE_SEED = 0xdeadbeef

// ── 1. Win rate by floor, naked player, tier-1 diff ───────────────────────────

console.log('\n══════════════════════════════════════════════════════')
console.log('  1. WIN RATE BY FLOOR — naked player (lvl 0) — T1')
console.log('══════════════════════════════════════════════════════')
console.log('  Scenario                  Result')
console.log('  ─────────────────────────────────────────────────────')

for (const encTier of ['normal','elite','rare','ancient'] as EncounterTier[]) {
  for (const floor of [1, 3, 5, 8, 10]) {
    const player = buildStats({ floor, level: 0 })
    const r = runScenario(N, BASE_SEED, floor, encTier, 1, player)
    const label = `F${floor} vs ${encTier.padEnd(7)}`
    console.log(`  ${label.padEnd(24)}  ${fmt(r)}`)
  }
  console.log()
}

// ── 2. Level impact at floor 5, vs normal/elite/rare ─────────────────────────

console.log('\n══════════════════════════════════════════════════════')
console.log('  2. LEVEL IMPACT — floor 5 — diff T1')
console.log('══════════════════════════════════════════════════════')
console.log('  Scenario                  Result')
console.log('  ─────────────────────────────────────────────────────')

for (const encTier of ['normal','elite','rare','ancient'] as EncounterTier[]) {
  for (const level of [0, 3, 5, 8, 10, 15]) {
    const player = buildStats({ floor: 5, level })
    const r = runScenario(N, BASE_SEED + 1, 5, encTier, 1, player)
    const label = `LVL ${String(level).padStart(2)} vs ${encTier.padEnd(7)}`
    console.log(`  ${label.padEnd(24)}  ${fmt(r)}`)
  }
  console.log()
}

// ── 3. Dexterity impact at floor 5, vs normal ────────────────────────────────

console.log('\n══════════════════════════════════════════════════════')
console.log('  3. DEXTERITY IMPACT — floor 5 vs normal/ancient, T1')
console.log('══════════════════════════════════════════════════════')
console.log('  Scenario                  Result')
console.log('  ─────────────────────────────────────────────────────')

for (const encTier of ['normal','ancient'] as EncounterTier[]) {
  for (const dex of [0, 5, 10, 20, 30, 40]) {
    const player = buildStats({ floor: 5, level: 5, dexterity: dex })
    const r = runScenario(N, BASE_SEED + 2, 5, encTier, 1, player)
    const label = `DEX ${String(dex).padStart(2)} vs ${encTier.padEnd(7)}`
    console.log(`  ${label.padEnd(24)}  ${fmt(r)}`)
  }
  console.log()
}

// ── 4. Block impact at floor 5, vs ancient ────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════')
console.log('  4. BLOCK IMPACT — floor 5 vs ancient, T1')
console.log('══════════════════════════════════════════════════════')
console.log('  Scenario                  Result')
console.log('  ─────────────────────────────────────────────────────')

for (const block of [0, 10, 25, 40, 55, 75]) {
  const player = buildStats({ floor: 5, level: 5, blockChance: block })
  const r = runScenario(N, BASE_SEED + 3, 5, 'ancient', 1, player)
  const label = `BLOCK ${String(block).padStart(2)}% vs ancient`
  console.log(`  ${label.padEnd(24)}  ${fmt(r)}`)
}

// ── 5. Tier scaling — floor 5, level 5 player ─────────────────────────────────

console.log('\n\n══════════════════════════════════════════════════════')
console.log('  5. TIER SCALING — floor 5 vs normal/ancient, LVL 5')
console.log('══════════════════════════════════════════════════════')
console.log('  Scenario                  Result')
console.log('  ─────────────────────────────────────────────────────')

for (const encTier of ['normal','elite','rare','ancient'] as EncounterTier[]) {
  for (const diffTier of [1, 2, 3, 4, 5, 6, 8]) {
    const player = buildStats({ floor: 5, level: 5 })
    const r = runScenario(N, BASE_SEED + 4, 5, encTier, diffTier, player)
    const label = `T${diffTier} vs ${encTier.padEnd(7)}`
    console.log(`  ${label.padEnd(24)}  ${fmt(r)}`)
  }
  console.log()
}

// ── 6. Elemental gear vs enchanted monsters ────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════')
console.log('  6. RESIST VALUE — floor 5 vs enchanted, T2, LVL 5')
console.log('     (forced fireEnchanted affix via seed selection)')
console.log('══════════════════════════════════════════════════════')
console.log('  Scenario                  Result')
console.log('  ─────────────────────────────────────────────────────')

// Simulate with 0% vs 50% vs 75% fire resist
for (const resist of [0, 25, 50, 75]) {
  const player = buildStats({ floor: 5, level: 5, fireResist: resist })
  const r = runScenario(N, BASE_SEED + 5, 5, 'elite', 2, player)
  const label = `fireResist ${String(resist).padStart(2)}% T2`
  console.log(`  ${label.padEnd(24)}  ${fmt(r)}`)
}
console.log()
for (const resist of [0, 25, 50, 75]) {
  const player = buildStats({ floor: 5, level: 5, coldResist: resist })
  const r = runScenario(N, BASE_SEED + 6, 5, 'elite', 2, player)
  const label = `coldResist  ${String(resist).padStart(2)}% T2`
  console.log(`  ${label.padEnd(24)}  ${fmt(r)}`)
}

// ── 6b. Resist value — FORCED enchanted monster ──────────────────────────────

console.log('\n\n══════════════════════════════════════════════════════')
console.log('  6b. RESIST — FORCED fire/cold enchanted, F5 T2 LVL5')
console.log('══════════════════════════════════════════════════════')
console.log('  Scenario                  Result')
console.log('  ─────────────────────────────────────────────────────')

function runForcedAffix(
  N: number, seed: number, floor: number, encTier: EncounterTier, diffTier: number,
  player: PlayerCombatStats, affix: MonsterAffix,
): SimResult {
  let wins = 0, losses = 0, totalRounds = 0, totalHpLeft = 0, hitCap = 0
  for (let i = 0; i < N; i++) {
    const rng = makeRng(seed + i * 7919)
    let monster = scaledMonster(rng, floor, encTier, diffTier)
    // Force the affix
    if (!monster.affixes.includes(affix)) {
      monster = { ...monster, affixes: [affix, ...monster.affixes.slice(0, 2)] }
    }
    const result = simulateCombat(rng, player, monster)
    if (result.outcome === 'victory') { wins++; totalHpLeft += result.hpRemaining }
    else losses++
    totalRounds += result.rounds.length
    if (result.rounds.length >= 50) hitCap++
  }
  return { wins, losses, totalRounds, totalHpLeft, hitCap, N }
}

for (const resist of [0, 25, 50, 75]) {
  const player = buildStats({ floor: 5, level: 5, fireResist: resist })
  const r = runForcedAffix(N, BASE_SEED + 10, 5, 'elite', 2, player, 'fireEnchanted')
  console.log(`  fireEnchanted resist ${String(resist).padStart(2)}%   ${fmt(r)}`)
}
console.log()
for (const resist of [0, 25, 50, 75]) {
  const player = buildStats({ floor: 5, level: 5, coldResist: resist })
  const r = runForcedAffix(N, BASE_SEED + 11, 5, 'elite', 2, player, 'coldEnchanted')
  console.log(`  coldEnchanted resist ${String(resist).padStart(2)}%   ${fmt(r)}`)
}

// ── 7. Loot quality distribution by tier ──────────────────────────────────────

console.log('\n\n══════════════════════════════════════════════════════')
console.log('  7. LOOT QUALITY BY TIER — floor 5 — N=5000 items')
console.log('══════════════════════════════════════════════════════')

const LOOT_N = 5000
for (const tier of [1, 2, 4, 6]) {
  const mf = (tier - 1) * 20
  const rng = makeRng(BASE_SEED + tier)
  const counts: Record<string, number> = { normal: 0, magic: 0, rare: 0, unique: 0 }
  for (let i = 0; i < LOOT_N; i++) {
    const item = generateItem(rng, { floor: 5, magicFind: mf })
    counts[item.quality]++
  }
  const line = Object.entries(counts).map(([q, n]) =>
    `${q} ${(n/LOOT_N*100).toFixed(1)}%`
  ).join('  ')
  console.log(`  T${tier} (MF+${mf.toString().padStart(3)}):  ${line}`)
}

// ── 8. XP per floor — how long to level up ────────────────────────────────────

console.log('\n\n══════════════════════════════════════════════════════')
console.log('  8. XP PER FLOOR — expected encounters & XP yield')
console.log('══════════════════════════════════════════════════════')

import { BASE_WEIGHTS } from '../engine/encounter'
import { MONSTERS, getMonstersForFloor } from '../data/monsters'

const TOTAL_W = Object.values(BASE_WEIGHTS).reduce((a, b) => a + b, 0)

function xpForLevel(n: number) { return n * (n + 1) / 2 * 100 }

console.log('  Floor  Avg encounters  Approx XP/floor  Lvl-up XP needed')
console.log('  ─────────────────────────────────────────────────────────')

for (const floor of [1, 2, 3, 5, 8, 10]) {
  // Estimate walkable tiles per floor (~40% of 50×50=2500)
  const walkable = 900 // conservative
  const bonus = Math.max(0, floor - 1)
  const empty = Math.max(100, 600 - bonus * 5)
  const normalW = 250
  const eliteW  = 100 + bonus * 3
  const rareW   = 30  + bonus * 2
  const ancW    = 5   + bonus
  const totalW  = empty + normalW + eliteW + rareW + 10 + 5 + ancW
  const encounterRate = (totalW - empty) / totalW
  const avgEncounters = walkable * encounterRate

  // Avg monster XP per encounter type
  const defs = getMonstersForFloor(floor)
  const avgBaseXp = defs.reduce((s, d) => s + d.baseXp, 0) / (defs.length || 1)
  const floorScale = 1 + (floor - 1) * 0.1
  const avgXp = (
    (normalW / totalW) * avgBaseXp * 1 +
    (eliteW  / totalW) * avgBaseXp * 2 +
    (rareW   / totalW) * avgBaseXp * 4 +
    (ancW    / totalW) * avgBaseXp * 8
  ) * floorScale

  const xpPerFloor = Math.round(avgEncounters * avgXp)
  const lvl1Needed = xpForLevel(1)
  const lvl5Needed = xpForLevel(5) - xpForLevel(4)

  console.log(`  F${floor}     ~${Math.round(avgEncounters).toString().padStart(3)} encounters  ~${String(xpPerFloor).padStart(6)} XP/floor  (lvl1=${lvl1Needed} lvl5-6=${lvl5Needed})`)
}

console.log('\n')

// ── 9. OPTIMIZED RUN — gear accumulation simulation ────────────────────────────

import { rollLoot, type Item } from '../engine/loot'

console.log('\n\n══════════════════════════════════════════════════════')
console.log('  9. OPTIMIZED RUN — gear accumulation, 50 runs × 10 floors')
console.log('     Compares: naked | geared (25 fights) | full-explore (45 fights)')
console.log('     Then: tier wall analysis (T1–T5) naked vs geared')
console.log('══════════════════════════════════════════════════════')

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Combat value heuristic — how a min-maxer ranks an item. */
function scoreItem(item: Item): number {
  const s = item.effectiveStats
  return (
    (s.damage          ?? 0) * 3.0 +
    (s.defense         ?? 0) * 1.2 +
    (s.life            ?? 0) * 1.5 +
    (s.critChance      ?? 0) * 4.0 +
    (s.blockChance     ?? 0) * 2.5 +
    (s.fireDamage      ?? 0) * 2.0 +
    (s.coldDamage      ?? 0) * 2.5 +  // cold = chilled = extra dodge
    (s.lightningDamage ?? 0) * 1.8 +
    (s.fireResist      ?? 0) * 0.8 +
    (s.coldResist      ?? 0) * 0.8 +
    (s.lightResist     ?? 0) * 0.8 +
    (s.attackSpeed     ?? 0) * 0.5 +
    (s.dexterity       ?? 0) * 1.5 +
    (s.magicFind       ?? 0) * 0.3
  )
}

/** Mirrors combatStore.buildPlayerStats exactly. */
function buildStatsFromEquipped(
  floor: number,
  level: number,
  equipped: Record<string, Item>,
): PlayerCombatStats {
  const eq: Record<string, number> = {}
  const hasOffhand = !!equipped.offhand
  for (const item of Object.values(equipped)) {
    for (const [k, v] of Object.entries(item.effectiveStats)) {
      eq[k] = (eq[k] ?? 0) + (v as number)
    }
  }
  return {
    hp:              80 + floor * 5 + level * 5 + (eq.life ?? 0),
    maxHp:           80 + floor * 5 + level * 5 + (eq.life ?? 0),
    damage:          [8  + floor * 2 + level + (eq.damage ?? 0),
                      16 + floor * 3 + level + (eq.damage ?? 0)],
    defense:         5 + floor * 2 + level + (eq.defense ?? 0) + (eq.armor ?? 0),
    critChance:      10 + Math.floor(level / 5) * 2 + (eq.critChance ?? 0),
    attackSpeed:     50 + (eq.attackSpeed ?? 0),
    stamina:         100,
    dexterity:       eq.dexterity       ?? 0,
    blockChance:     Math.min(75, (hasOffhand ? 10 : 0) + (eq.blockChance ?? 0)),
    fireDamage:      eq.fireDamage      ?? 0,
    coldDamage:      eq.coldDamage      ?? 0,
    lightningDamage: eq.lightningDamage ?? 0,
    fireResist:      Math.min(75, (eq.fireResist  ?? 0) + (eq.resistFire      ?? 0)),
    coldResist:      Math.min(75, (eq.coldResist  ?? 0) + (eq.resistCold      ?? 0)),
    lightResist:     Math.min(75, (eq.lightResist ?? 0) + (eq.resistLightning ?? 0)),
  }
}

function xpForLevel(n: number): number { return n * (n + 1) / 2 * 100 }

// Realistic encounter distribution (of combat-only tiles, based on BASE_WEIGHTS)
const ENC_MIX = [
  { type: 'normal'  as EncounterTier, weight: 65, xpMult: 1 },
  { type: 'elite'   as EncounterTier, weight: 26, xpMult: 2 },
  { type: 'rare'    as EncounterTier, weight:  8, xpMult: 4 },
  { type: 'ancient' as EncounterTier, weight:  1, xpMult: 8 },
]
const ENC_TOTAL_W = ENC_MIX.reduce((s, e) => s + e.weight, 0)

interface FloorRow {
  floor:     number
  level:     number
  winRate:   number
  hpPct:     number
  gearScore: number
  slots:     number
  mf:        number
  deaths:    number
}

function runOptimized(
  runSeed:        number,
  useGear:        boolean,
  fightsPerFloor: number,
  floors:         number,
  diffTier:       number,
): FloorRow[] {
  const rng = makeRng(runSeed)
  let level = 0, xp = 0
  const equipped: Record<string, Item> = {}
  const rows: FloorRow[] = []

  for (let floor = 1; floor <= floors; floor++) {
    let wins = 0, losses = 0, hpSum = 0

    for (let f = 0; f < fightsPerFloor; f++) {
      // Weighted encounter pick
      let pick = rng() * ENC_TOTAL_W
      let enc = ENC_MIX[0]
      for (const e of ENC_MIX) { pick -= e.weight; if (pick <= 0) { enc = e; break } }

      const player  = useGear
        ? buildStatsFromEquipped(floor, level, equipped)
        : buildStats({ floor, level })
      const monster = scaledMonster(rng, floor, enc.type, diffTier)
      const result  = simulateCombat(rng, player, monster)

      if (result.outcome === 'victory') {
        wins++
        hpSum += result.hpRemaining / player.maxHp
        // XP — simplified: base=20+floor*5, scaled by enc xpMult
        xp += Math.round((20 + floor * 5) * enc.xpMult)
        while (xp >= xpForLevel(level + 1)) level++
        // Greedy auto-equip
        if (useGear) {
          const curMF = Object.values(equipped).reduce(
            (s, it) => s + ((it.effectiveStats.magicFind ?? 0) as number), 0
          )
          const lootRng = makeRng(runSeed ^ (floor * 997 + f * 31))
          const drops = rollLoot(lootRng, enc.type as string, floor, curMF)
          for (const item of drops) {
            if (item.slot === 'charm' || item.slot === 'rune') continue
            const cur = equipped[item.slot]
            if (!cur || scoreItem(item) > scoreItem(cur)) equipped[item.slot] = item
          }
        }
      } else {
        losses++
      }
    }

    const total = wins + losses
    const curMF = useGear
      ? Object.values(equipped).reduce((s, it) => s + ((it.effectiveStats.magicFind ?? 0) as number), 0) : 0
    rows.push({
      floor,
      level,
      winRate:   wins / total,
      hpPct:     wins > 0 ? hpSum / wins : 0,
      gearScore: useGear ? Object.values(equipped).reduce((s, it) => s + scoreItem(it), 0) : 0,
      slots:     useGear ? Object.keys(equipped).length : 0,
      mf:        curMF,
      deaths:    losses,
    })
  }
  return rows
}

/** Aggregate N runs — average each floor's metrics. */
function aggregate(
  n: number, baseSeed: number, useGear: boolean, fightsPerFloor: number,
  floors: number, diffTier: number,
): FloorRow[] {
  const all = Array.from({ length: n }, (_, i) =>
    runOptimized(baseSeed + i * 13337, useGear, fightsPerFloor, floors, diffTier)
  )
  return Array.from({ length: floors }, (_, f) => ({
    floor:     f + 1,
    level:     all.reduce((s, r) => s + r[f].level, 0) / n,
    winRate:   all.reduce((s, r) => s + r[f].winRate, 0) / n,
    hpPct:     all.reduce((s, r) => s + r[f].hpPct, 0) / n,
    gearScore: all.reduce((s, r) => s + r[f].gearScore, 0) / n,
    slots:     all.reduce((s, r) => s + r[f].slots, 0) / n,
    mf:        all.reduce((s, r) => s + r[f].mf, 0) / n,
    deaths:    all.reduce((s, r) => s + r[f].deaths, 0) / n,
  }))
}

function printTable(rows: FloorRow[], showGear: boolean) {
  if (showGear) {
    console.log('  Flr  Lvl   Win%    HP%    Slots  GScore   +MF    Deaths/floor')
    console.log('  ──────────────────────────────────────────────────────────────')
    for (const r of rows) {
      const flag = r.winRate < 0.50 ? ' ❌ DEATH WALL' : r.winRate > 0.97 ? ' 😴 TRIVIAL' : ''
      console.log(
        `  F${String(r.floor).padStart(2)}` +
        `  ${r.level.toFixed(1).padStart(4)}` +
        `  ${(r.winRate * 100).toFixed(1).padStart(5)}%` +
        `  ${(r.hpPct * 100).toFixed(0).padStart(4)}%` +
        `  ${r.slots.toFixed(1).padStart(5)}` +
        `  ${r.gearScore.toFixed(0).padStart(6)}` +
        `  +${r.mf.toFixed(0).padStart(3)}%` +
        `  ${r.deaths.toFixed(1).padStart(4)}${flag}`
      )
    }
  } else {
    console.log('  Flr  Lvl   Win%    HP%    Deaths/floor')
    console.log('  ────────────────────────────────────────')
    for (const r of rows) {
      const flag = r.winRate < 0.50 ? ' ❌ DEATH WALL' : r.winRate > 0.97 ? ' 😴 TRIVIAL' : ''
      console.log(
        `  F${String(r.floor).padStart(2)}` +
        `  ${r.level.toFixed(1).padStart(4)}` +
        `  ${(r.winRate * 100).toFixed(1).padStart(5)}%` +
        `  ${(r.hpPct * 100).toFixed(0).padStart(4)}%` +
        `  ${r.deaths.toFixed(1).padStart(4)}${flag}`
      )
    }
  }
}

const OPT_RUNS   = 50
const OPT_FLOORS = 10
const OPT_SEED   = BASE_SEED + 100

// Run the three modes
const naked      = aggregate(OPT_RUNS, OPT_SEED,     false, 25, OPT_FLOORS, 1)
const geared     = aggregate(OPT_RUNS, OPT_SEED,     true,  25, OPT_FLOORS, 1)
const fullExplore= aggregate(OPT_RUNS, OPT_SEED + 1, true,  45, OPT_FLOORS, 1)

console.log('\n  A — NAKED PLAYER  (floor-scaled stats, no items equipped)')
console.log('      T1 diff, 25 fights/floor, 50 runs avg')
printTable(naked, false)

console.log('\n  B — GEARED PLAYER  (greedy auto-equip best drop per slot)')
console.log('      T1 diff, 25 fights/floor, 50 runs avg')
printTable(geared, true)

console.log('\n  C — FULL EXPLORER  (geared + explores all nodes, 45 fights/floor)')
console.log('      T1 diff, 45 fights/floor, 50 runs avg')
printTable(fullExplore, true)

// Delta table
console.log('\n  GEAR ADVANTAGE (B vs A) — T1 diff')
console.log('  Flr  Win%Δ    HP%Δ   GScore   Assessment')
console.log('  ───────────────────────────────────────────────────')
for (let f = 0; f < OPT_FLOORS; f++) {
  const n = naked[f], g = geared[f]
  const dw = (g.winRate - n.winRate) * 100
  const dh = (g.hpPct   - n.hpPct)  * 100
  const assess = dw < 2  ? '— gear barely matters here'
               : dw < 8  ? '✓ moderate advantage'
               : dw < 15 ? '✓✓ strong gear curve'
               :            '✓✓✓ gear is decisive'
  console.log(
    `  F${String(f+1).padStart(2)}` +
    `  ${(dw >= 0 ? '+' : '')}${dw.toFixed(1).padStart(5)}%` +
    `  ${(dh >= 0 ? '+' : '')}${dh.toFixed(0).padStart(4)}%` +
    `  ${g.gearScore.toFixed(0).padStart(7)}` +
    `   ${assess}`
  )
}

console.log('\n  EXPLORE BONUS (C vs B) — extra fights = extra loot = faster gear')
console.log('  Flr  Win%Δ    LvlΔ   GScoreΔ  MFΔ')
console.log('  ─────────────────────────────────────────')
for (let f = 0; f < OPT_FLOORS; f++) {
  const g = geared[f], e = fullExplore[f]
  const dw  = (e.winRate - g.winRate) * 100
  const dlv = e.level - g.level
  const dgs = e.gearScore - g.gearScore
  const dmf = e.mf - g.mf
  console.log(
    `  F${String(f+1).padStart(2)}` +
    `  ${(dw >= 0 ? '+' : '')}${dw.toFixed(1).padStart(5)}%` +
    `  ${(dlv >= 0 ? '+' : '')}${dlv.toFixed(1).padStart(5)}` +
    `  ${(dgs >= 0 ? '+' : '')}${dgs.toFixed(0).padStart(7)}` +
    `  ${(dmf >= 0 ? '+' : '')}${dmf.toFixed(0).padStart(4)}% MF`
  )
}

// ── Tier wall analysis ────────────────────────────────────────────────────────

console.log('\n\n  TIER WALL — where does gear become required?')
console.log('  Floor 5, 25 fights, 50 runs. Naked vs Geared.')
console.log('  Tier  Naked Win%  Geared Win%  Delta   Verdict')
console.log('  ──────────────────────────────────────────────────────────')

for (const diffTier of [1, 2, 3, 4, 5, 6]) {
  const nRows = aggregate(OPT_RUNS, OPT_SEED + diffTier * 77, false, 25, 5, diffTier)
  const gRows = aggregate(OPT_RUNS, OPT_SEED + diffTier * 77, true,  25, 5, diffTier)
  // Report floor 5 (end of this tier block)
  const n5 = nRows[4], g5 = gRows[4]
  const dw  = (g5.winRate - n5.winRate) * 100
  const verdict =
    n5.winRate > 0.80 ? 'naked fine'
    : n5.winRate > 0.60 ? 'gear recommended'
    : n5.winRate > 0.40 ? 'gear required'
    :                     '❌ naked hopeless'
  console.log(
    `  T${diffTier}    ` +
    `${(n5.winRate * 100).toFixed(1).padStart(7)}%` +
    `    ${(g5.winRate * 100).toFixed(1).padStart(7)}%` +
    `    ${(dw >= 0 ? '+' : '')}${dw.toFixed(1).padStart(5)}%` +
    `   ${verdict}`
  )
}

console.log('\n')
