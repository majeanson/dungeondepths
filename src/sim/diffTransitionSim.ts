/**
 * diffTransitionSim — Difficulty ramp fairness harness.
 *
 * Answers: "Is the Normal→Nightmare→Hell jump balanced for a player
 * who cleared the previous tier with their full progression gear?"
 *
 * Flow per player:
 *   Phase 1: Run Normal until first F10 clear (up to MAX_NORMAL_ATTEMPTS tries).
 *            On clear, carry endEquipped + endGemStash + full XP to Phase 2.
 *   Phase 2: Run Nightmare from F1, 5 attempts, with Normal-cleared gear.
 *            On first NM clear, carry gear to Phase 3.
 *   Phase 3: Run Hell from F1, 5 attempts, with NM-cleared gear.
 *
 * Reports:
 *   - Normal clear rate and attempts distribution
 *   - NM attempt 1 survival rate (cold transition), avg floor, gear score
 *   - NM attempts 1-5 floor progression
 *   - Hell attempt 1 survival rate and floor progression
 *   - Per-class comparison: which class transitions best?
 *
 * bun run src/sim/diffTransitionSim.ts [players=600]
 */

import { makeRng } from '../engine/rng'
import { simulateRun, avg, CLASS_IDS, type RunOptions } from './fullRunSim'
import type { ClassId } from '../data/classes'
import type { EquipSlot } from '../engine/inventory'
import type { Item } from '../engine/loot'

const PLAYERS              = parseInt(process.argv[2] ?? '600')
const MAX_NORMAL_ATTEMPTS  = 12   // attempts to clear Normal before "DNF"
const TRANSITION_ATTEMPTS  = 5    // attempts per difficulty after first clear

// ─── Learning curve (veteran who cleared Normal — skilled player) ─────────────
function expertOpts(attempt: number): RunOptions {
  // Player who cleared Normal is already decent — tighter sloppy rate
  const decay = Math.pow(0.75, attempt)
  return {
    sloppyRate:      Math.max(0.02, 0.25 * decay),
    potionThreshold: Math.min(0.45, 0.30 + 0.15 * (1 - decay)),
    defSkipRate:     Math.max(0.05, 0.40 * decay),
  }
}

interface TransitionResult {
  normalCleared:    boolean
  normalAttempts:   number   // attempts before first Normal clear (or MAX if never)
  normalGearScore:  number   // total gear score at end of winning Normal run
  normalXp:         number   // XP accumulated by Normal clear
  nmFloors:         number[] // floor reached on each of the 5 NM attempts
  nmCleared:        boolean  // did they clear NM at all in 5 attempts?
  hellFloors:       number[] // floor reached on each of the 5 Hell attempts (if NM cleared)
  hellCleared:      boolean
}

function simulateTransition(seed: number, cls: ClassId): TransitionResult {
  const rng = makeRng(seed)

  // ── Phase 1: Normal until clear ──────────────────────────────────────────────
  let gear: Partial<Record<EquipSlot, Item>> = {}
  let stash: Map<string, number> = new Map()
  let xp   = 0
  let normalCleared = false
  let normalAttempts = 0

  for (let a = 0; a < MAX_NORMAL_ATTEMPTS; a++) {
    normalAttempts = a + 1
    const r = simulateRun(makeRng(rng() * 2 ** 32), cls, {
      ...expertOpts(a),
      startingXp:       xp,
      startingEquipped: gear,
      startingGemStash: stash,
      diffTier:         1,
    })
    xp    = r.earnedXp + xp   // accumulate (full carry)
    gear  = r.endEquipped
    stash = r.endGemStash
    if (r.survived) { normalCleared = true; break }
  }

  const normalGearScore = Object.values(gear).reduce((sum, item) =>
    sum + Object.values(item?.effectiveStats ?? {}).reduce((s, v) => s + Math.max(0, v as number), 0), 0)

  if (!normalCleared) {
    return { normalCleared: false, normalAttempts, normalGearScore, normalXp: xp, nmFloors: [], nmCleared: false, hellFloors: [], hellCleared: false }
  }

  // ── Phase 2: Nightmare — 5 attempts with Normal gear ─────────────────────────
  let nmGear  = gear
  let nmStash = stash
  let nmXp    = xp
  const nmFloors: number[] = []
  let nmCleared = false
  let nmClearGear: Partial<Record<EquipSlot, Item>> = {}
  let nmClearStash: Map<string, number> = new Map()
  let nmClearXp = xp

  for (let a = 0; a < TRANSITION_ATTEMPTS; a++) {
    const r = simulateRun(makeRng(rng() * 2 ** 32), cls, {
      ...expertOpts(a),
      startingXp:       nmXp,
      startingEquipped: nmGear,
      startingGemStash: nmStash,
      diffTier:         2,
    })
    nmFloors.push(r.floorReached)
    nmXp    += r.earnedXp
    nmGear   = r.endEquipped
    nmStash  = r.endGemStash
    if (r.survived && !nmCleared) {
      nmCleared = true
      nmClearGear  = r.endEquipped
      nmClearStash = r.endGemStash
      nmClearXp    = nmXp
    }
  }

  // ── Phase 3: Hell — 5 attempts (only if NM cleared) ──────────────────────────
  const hellFloors: number[] = []
  let hellCleared = false

  if (nmCleared) {
    let hellGear  = nmClearGear
    let hellStash = nmClearStash
    let hellXp    = nmClearXp
    for (let a = 0; a < TRANSITION_ATTEMPTS; a++) {
      const r = simulateRun(makeRng(rng() * 2 ** 32), cls, {
        ...expertOpts(a),
        startingXp:       hellXp,
        startingEquipped: hellGear,
        startingGemStash: hellStash,
        diffTier:         3,
      })
      hellFloors.push(r.floorReached)
      hellXp    += r.earnedXp
      hellGear   = r.endEquipped
      hellStash  = r.endGemStash
      if (r.survived) hellCleared = true
    }
  }

  return { normalCleared, normalAttempts, normalGearScore, normalXp: xp, nmFloors, nmCleared, hellFloors, hellCleared }
}

// ─── Run all players per class ────────────────────────────────────────────────
console.log(`\n${'═'.repeat(72)}`)
console.log(`  DIFFICULTY TRANSITION SIM  ${PLAYERS} players per class`)
console.log(`  Normal (up to ${MAX_NORMAL_ATTEMPTS} attempts) → Nightmare (${TRANSITION_ATTEMPTS} attempts) → Hell (${TRANSITION_ATTEMPTS} attempts)`)
console.log(`  Gear fully carries forward. Stash persists. 100% XP carry.`)
console.log(`${'═'.repeat(72)}\n`)

function pct(n: number, d: number): string {
  return d === 0 ? ' n/a' : `${((n / d) * 100).toFixed(0)}%`.padStart(5)
}
function fmtFloor(f: number): string { return f.toFixed(1).padStart(5) }

const allResults: Record<ClassId, TransitionResult[]> = {} as never

for (const cls of CLASS_IDS) {
  process.stdout.write(`  Simulating ${cls.padEnd(12)}`)
  const t0    = Date.now()
  const seed0 = 0xd1ff ^ cls.charCodeAt(0)
  allResults[cls] = Array.from({ length: PLAYERS }, (_, i) => simulateTransition(seed0 + i * 1337, cls))
  console.log(`  ${PLAYERS} players  (${Date.now() - t0}ms)`)
}
console.log()

// ─── 1. Normal clear rate ─────────────────────────────────────────────────────
console.log('NORMAL CLEAR RATE  (% who cleared F10 Normal within attempt limit)')
console.log(`  ${'Class'.padEnd(12)} ${'Cleared'.padStart(8)} ${'P25 atts'.padStart(10)} ${'Median'.padStart(8)} ${'P75'.padStart(6)} ${'Never%'.padStart(8)} ${'Gear@clear'.padStart(12)}`)
console.log('  ' + '─'.repeat(70))
for (const cls of CLASS_IDS) {
  const rs = allResults[cls]
  const cleared = rs.filter(r => r.normalCleared)
  const atts = cleared.map(r => r.normalAttempts).sort((a, b) => a - b)
  const p25 = atts[Math.floor(atts.length * 0.25)] ?? 0
  const med = atts[Math.floor(atts.length * 0.50)] ?? 0
  const p75 = atts[Math.floor(atts.length * 0.75)] ?? 0
  const avgGear = avg(cleared.map(r => r.normalGearScore))
  const neverPct = (((rs.length - cleared.length) / rs.length) * 100).toFixed(0) + '%'
  console.log(`  ${cls.padEnd(12)} ${pct(cleared.length, rs.length).padStart(8)} ${p25.toString().padStart(10)} ${med.toString().padStart(8)} ${p75.toString().padStart(6)} ${neverPct.padStart(8)} ${avgGear.toFixed(0).padStart(12)}`)
}
console.log()

// ─── 2. NM first-attempt cold start ───────────────────────────────────────────
console.log('NIGHTMARE FIRST ATTEMPT  (attempt 1 with Normal-cleared gear — cold transition)')
console.log(`  ${'Class'.padEnd(12)} ${'Survived'.padStart(9)} ${'Avg floor'.padStart(10)} ${'F8+ reach'.padStart(10)} ${'F5+ reach'.padStart(10)}`)
console.log('  ' + '─'.repeat(56))
for (const cls of CLASS_IDS) {
  const rs = allResults[cls].filter(r => r.nmFloors.length > 0)
  if (rs.length === 0) { console.log(`  ${cls.padEnd(12)} (no NM data — none cleared Normal)`); continue }
  const first = rs.map(r => r.nmFloors[0])
  const survived = rs.filter(r => r.nmFloors[0] >= 10).length  // floor 10 = cleared
  const f8 = rs.filter(r => r.nmFloors[0] >= 8).length
  const f5 = rs.filter(r => r.nmFloors[0] >= 5).length
  console.log(`  ${cls.padEnd(12)} ${pct(survived, rs.length).padStart(9)} ${avg(first).toFixed(1).padStart(10)} ${pct(f8, rs.length).padStart(10)} ${pct(f5, rs.length).padStart(10)}`)
}
console.log()

// ─── 3. NM progression over 5 attempts ───────────────────────────────────────
console.log('NIGHTMARE PROGRESSION  (avg floor reached per attempt, all players who entered NM)')
console.log(`  ${'Class'.padEnd(12)}` + Array.from({ length: TRANSITION_ATTEMPTS }, (_, i) => `NM${i + 1}`.padStart(7)).join('') + '  cleared')
console.log('  ' + '─'.repeat(52))
for (const cls of CLASS_IDS) {
  const rs = allResults[cls].filter(r => r.nmFloors.length > 0)
  if (rs.length === 0) continue
  const cols = Array.from({ length: TRANSITION_ATTEMPTS }, (_, a) => {
    const vals = rs.filter(r => r.nmFloors[a] != null).map(r => r.nmFloors[a])
    return vals.length ? avg(vals).toFixed(1).padStart(7) : '    — '
  })
  const nmClearRate = pct(rs.filter(r => r.nmCleared).length, rs.length)
  console.log(`  ${cls.padEnd(12)}${cols.join('')}  ${nmClearRate}`)
}
console.log()

// ─── 4. Hell first-attempt cold start ─────────────────────────────────────────
console.log('HELL FIRST ATTEMPT  (attempt 1 with NM-cleared gear — cold transition)')
console.log(`  ${'Class'.padEnd(12)} ${'Survived'.padStart(9)} ${'Avg floor'.padStart(10)} ${'F8+ reach'.padStart(10)} ${'F5+ reach'.padStart(10)} ${'Players'.padStart(9)}`)
console.log('  ' + '─'.repeat(62))
for (const cls of CLASS_IDS) {
  const rs = allResults[cls].filter(r => r.hellFloors.length > 0)
  if (rs.length === 0) { console.log(`  ${cls.padEnd(12)} (no Hell data — none cleared NM)`); continue }
  const first = rs.map(r => r.hellFloors[0])
  const survived = rs.filter(r => r.hellFloors[0] >= 10).length
  const f8 = rs.filter(r => r.hellFloors[0] >= 8).length
  const f5 = rs.filter(r => r.hellFloors[0] >= 5).length
  console.log(`  ${cls.padEnd(12)} ${pct(survived, rs.length).padStart(9)} ${avg(first).toFixed(1).padStart(10)} ${pct(f8, rs.length).padStart(10)} ${pct(f5, rs.length).padStart(10)} ${rs.length.toString().padStart(9)}`)
}
console.log()

// ─── 5. Hell progression over 5 attempts ─────────────────────────────────────
console.log('HELL PROGRESSION  (avg floor reached per attempt, all players who entered Hell)')
console.log(`  ${'Class'.padEnd(12)}` + Array.from({ length: TRANSITION_ATTEMPTS }, (_, i) => `H${i + 1}`.padStart(7)).join('') + '  cleared')
console.log('  ' + '─'.repeat(52))
for (const cls of CLASS_IDS) {
  const rs = allResults[cls].filter(r => r.hellFloors.length > 0)
  if (rs.length === 0) continue
  const cols = Array.from({ length: TRANSITION_ATTEMPTS }, (_, a) => {
    const vals = rs.filter(r => r.hellFloors[a] != null).map(r => r.hellFloors[a])
    return vals.length ? avg(vals).toFixed(1).padStart(7) : '    — '
  })
  const hellClearRate = pct(rs.filter(r => r.hellCleared).length, rs.length)
  console.log(`  ${cls.padEnd(12)}${cols.join('')}  ${hellClearRate}`)
}
console.log()

// ─── 6. Summary judgment ──────────────────────────────────────────────────────
console.log('BALANCE VERDICT')
console.log('  ' + '─'.repeat(72))
console.log('  Target zones:')
console.log('    Normal clear: >85% of players within 8 attempts (with learning curve)')
console.log('    NM attempt 1: 10-35% survival — hard but achievable, not a wall')
console.log('    NM attempt 5: 50-80% survival — character has improved enough')
console.log('    Hell attempt 1: 5-25% survival — prestige tier, expected to die')
console.log('    Hell attempt 5: 30-60% survival — still hard after 5 runs')
console.log()
for (const cls of CLASS_IDS) {
  const rs = allResults[cls]
  const nmRs = rs.filter(r => r.nmFloors.length > 0)
  const hellRs = rs.filter(r => r.hellFloors.length > 0)
  const normalClearRate = rs.filter(r => r.normalCleared).length / rs.length
  const nmA1Survive     = nmRs.length ? nmRs.filter(r => r.nmFloors[0] >= 10).length / nmRs.length : 0
  const nmA5Survive     = nmRs.length ? nmRs.filter(r => r.nmCleared).length / nmRs.length : 0
  const hellA1Survive   = hellRs.length ? hellRs.filter(r => r.hellFloors[0] >= 10).length / hellRs.length : 0
  const hellA5Survive   = hellRs.length ? hellRs.filter(r => r.hellCleared).length / hellRs.length : 0

  const flags: string[] = []
  if (normalClearRate < 0.85) flags.push(`⚠ Normal too hard (${(normalClearRate * 100).toFixed(0)}% clear rate, want >85%)`)
  if (nmA1Survive > 0.40)    flags.push(`⚠ NM A1 too easy (${(nmA1Survive * 100).toFixed(0)}% survive, want 10-35%)`)
  if (nmA1Survive < 0.05)    flags.push(`⚠ NM A1 too hard (${(nmA1Survive * 100).toFixed(0)}% survive, want 10-35%)`)
  if (nmA5Survive < 0.40)    flags.push(`⚠ NM A5 progression too slow (${(nmA5Survive * 100).toFixed(0)}% cleared, want >40%)`)
  if (hellA1Survive > 0.30)  flags.push(`⚠ Hell A1 too easy (${(hellA1Survive * 100).toFixed(0)}% survive, want 5-25%)`)
  if (hellA1Survive < 0.02)  flags.push(`⚠ Hell A1 too hard/impossible (${(hellA1Survive * 100).toFixed(0)}% survive, want 5-25%)`)
  if (hellA5Survive < 0.20)  flags.push(`⚠ Hell A5 barely beatable (${(hellA5Survive * 100).toFixed(0)}% cleared, want 20-60%)`)

  const status = flags.length === 0 ? '✓ BALANCED' : `${flags.length} ISSUE(S)`
  console.log(`  ${cls.padEnd(12)} ${status}`)
  for (const f of flags) console.log(`               ${f}`)
}
console.log()
console.log(`${'═'.repeat(72)}\n`)
