/**
 * playerJourneySim — Roguelite player progression harness.
 *
 * Three measurement axes:
 *
 * 1. WITHIN-RUN IMPACT: How much does gear/XP accumulated during a run
 *    change survival on later floors? Bins runs by gear score at F3 and
 *    shows survival to F5/F8. If the gap is huge → high variance / lucky-run bias.
 *
 * 2. PLAYER LEARNING: Repeated attempts with decaying sloppy rate (50%→2%).
 *    Shows floor progression improvement over 30 attempts for each class.
 *
 * 3. META-PROGRESSION MODES: Three carry-over strategies compared:
 *    - Baseline:    each run starts fresh (level 0, no gear, F1, Normal)
 *    - Full carry:  all equipped items + 100% XP persist; start F1, Normal
 *    - Waypoint:    full carry + waypoint start floor + Normal→Nightmare→Hell progression
 *    Shows avg floor reached per attempt across all three modes.
 *
 * bun run src/sim/playerJourneySim.ts [players=400] [attempts=30] [floors=10] [--html]
 * HTML output: src/sim/journey.html
 */

import { makeRng } from '../engine/rng'
import { simulateRun, avg, type RunResult, type RunOptions, CLASS_IDS } from './fullRunSim'
import type { ClassId } from '../data/classes'
import type { EquipSlot } from '../engine/inventory'
import type { Item } from '../engine/loot'

// ─── Config ───────────────────────────────────────────────────────────────────
const PLAYERS     = parseInt(process.argv[2] ?? '400')
const ATTEMPTS    = parseInt(process.argv[3] ?? '30')
const FLOOR_COUNT = parseInt(process.argv[4] ?? '10')   // default 10; pass 30 for late-game meta
const WRITE_HTML  = process.argv.includes('--html')

// ─── Learning curve ───────────────────────────────────────────────────────────
/**
 * Player skill parameters by attempt index (0-based).
 * Three axes all decay exponentially — skill improves fast early, then plateaus.
 *   sloppyRate:      50%→2%  (learns skill rotations)
 *   potionThreshold: 20%→45% (proactive healing vs panic healing)
 *   defSkipRate:     70%→5%  (learns defensive skills: iron_skin, smoke_bomb, etc.)
 */
function optsForAttempt(attemptIdx: number, extras: Partial<RunOptions> = {}): RunOptions {
  const decay = Math.pow(0.82, attemptIdx)
  return {
    sloppyRate:      Math.max(0.02, 0.50 * decay),
    potionThreshold: Math.min(0.45, 0.20 + 0.25 * (1 - decay)),
    defSkipRate:     Math.max(0.05, 0.70 * decay),
    floorCount:      FLOOR_COUNT,   // override the module-level default (10) when imported
    ...extras,
  }
}

// ─── Waypoint helpers ─────────────────────────────────────────────────────────
/** Returns the highest unlockable waypoint start floor (multiples of 5: 1, 6, 11, …) */
function bestWaypoint(floorReached: number): number {
  return Math.max(1, Math.floor((floorReached - 1) / 5) * 5 + 1)
}

// ─── Player record ────────────────────────────────────────────────────────────
interface AttemptSnapshot {
  floorReached:     number
  survived:         boolean
  earnedXp:         number
  gearScoreAtFloor: number[]
  diffTier?:        1 | 2 | 3   // set in waypoint mode
}

interface PlayerJourney {
  baseline:  AttemptSnapshot[]
  fullCarry: AttemptSnapshot[]
  waypoint:  AttemptSnapshot[]
}

// ─── Simulate one player doing ATTEMPTS runs ──────────────────────────────────
function simulatePlayer(seed: number, cls: ClassId): PlayerJourney {
  const rngB = makeRng(seed)
  const rngC = makeRng(seed + 0x1000)
  const rngW = makeRng(seed + 0x2000)

  const baseline:  AttemptSnapshot[] = []
  const fullCarry: AttemptSnapshot[] = []
  const waypoint:  AttemptSnapshot[] = []

  // Mode 2: Full carry state (all items + 100% XP, always F1, Normal)
  let carryXp   = 0
  let carryGear: Partial<Record<EquipSlot, Item>> = {}

  // Mode 3: Waypoint + Full carry + Difficulty progression state
  let wpXp    = 0
  let wpGear: Partial<Record<EquipSlot, Item>> = {}
  let wpFloor  = 1          // current waypoint start (within active difficulty)
  let wpDiff: 1 | 2 | 3 = 1  // 1=Normal, 2=Nightmare, 3=Hell
  let wpStash: Map<string, number> = new Map()  // gem/rune stash (town stash across runs)

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const learningOpts = optsForAttempt(attempt)

    // ── Mode 1: Baseline — fresh each run ────────────────────────────────────
    {
      const r = simulateRun(makeRng(rngB() * 2 ** 32), cls, learningOpts)
      baseline.push({ floorReached: r.floorReached, survived: r.survived, earnedXp: r.earnedXp, gearScoreAtFloor: r.gearScoreAtFloor })
    }

    // ── Mode 2: Full carry — all items + 100% XP, F1, Normal ─────────────────
    {
      const r = simulateRun(makeRng(rngC() * 2 ** 32), cls, {
        ...learningOpts,
        startingXp:       carryXp,
        startingEquipped: carryGear,
      })
      fullCarry.push({ floorReached: r.floorReached, survived: r.survived, earnedXp: r.earnedXp, gearScoreAtFloor: r.gearScoreAtFloor })
      carryXp  += r.earnedXp      // full XP carry — character level persists
      carryGear = r.endEquipped   // all equipped slots persist (real game has no limit)
    }

    // ── Mode 3: Waypoint + Full carry + Difficulty progression ───────────────
    {
      const r = simulateRun(makeRng(rngW() * 2 ** 32), cls, {
        ...learningOpts,
        startingXp:       wpXp,
        startingEquipped: wpGear,
        startFloor:       wpFloor,
        diffTier:         wpDiff,
        startingGemStash: wpStash,
      })
      waypoint.push({
        floorReached:     r.floorReached,
        survived:         r.survived,
        earnedXp:         r.earnedXp,
        gearScoreAtFloor: r.gearScoreAtFloor,
        diffTier:         wpDiff,
      })

      // Full carry — gear, XP, and stash all persist
      wpXp   += r.earnedXp
      wpGear  = r.endEquipped
      wpStash = r.endGemStash   // unsocketed gems/runes bank to stash

      // Advance waypoint within this difficulty
      const newWp = bestWaypoint(r.floorReached)
      if (newWp > wpFloor) wpFloor = newWp

      // Difficulty unlock on clear
      if (r.survived && wpDiff < 3) {
        wpDiff = (wpDiff + 1) as 2 | 3
        wpFloor = 1   // reset waypoint on entering new difficulty tier
      }
    }
  }

  return { baseline, fullCarry, waypoint }
}

// ─── Simulate all players ─────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(72)}`)
console.log(`  PLAYER JOURNEY SIM  ${PLAYERS} players × ${ATTEMPTS} attempts/player`)
console.log(`  Full carry | Waypoints every 5 floors | Normal→Nightmare→Hell`)
console.log(`${'═'.repeat(72)}\n`)

const allJourneys: Record<ClassId, PlayerJourney[]> = {} as never
for (const cls of CLASS_IDS) {
  process.stdout.write(`  Simulating ${cls.padEnd(10)}`)
  const t0    = Date.now()
  const seed0 = 0xc0ffee ^ cls.charCodeAt(0)
  allJourneys[cls] = Array.from({ length: PLAYERS }, (_, i) => simulatePlayer(seed0 + i * 997, cls))
  console.log(`  ${PLAYERS} players × ${ATTEMPTS} attempts  (${Date.now() - t0}ms)`)
}
console.log()

// ─── Helpers ─────────────────────────────────────────────────────────────────
function pctStr(n: number, d: number): string {
  return d === 0 ? '  n/a' : `${((n / d) * 100).toFixed(0)}%`.padStart(5)
}
const REPORT_ATTEMPTS = [0, 1, 2, 4, 7, 9, 14, 19, 24].filter(i => i < ATTEMPTS)
const attemptHeader = '  ' + 'Class/Mode'.padEnd(20) + REPORT_ATTEMPTS.map(a => `R${a + 1}`.padStart(6)).join('')

// ─── 1. AVG FLOOR REACHED per mode ───────────────────────────────────────────
type Mode = 'baseline' | 'fullCarry' | 'waypoint'
const MODE_LABEL: Record<Mode, string> = {
  baseline:  'Baseline',
  fullCarry: '+ Full carry',
  waypoint:  '+ Waypoint',
}

console.log('AVG FLOOR REACHED — three meta-progression modes compared')
console.log(attemptHeader)
console.log('  ' + '─'.repeat(attemptHeader.length - 2))
for (const cls of CLASS_IDS) {
  const journeys = allJourneys[cls]
  let first = true
  for (const mode of ['baseline', 'fullCarry', 'waypoint'] as Mode[]) {
    const label = first ? cls.padEnd(10) + MODE_LABEL[mode].padEnd(13) : '          '.padEnd(10) + MODE_LABEL[mode].padEnd(13)
    first = false
    const row = REPORT_ATTEMPTS.map(a => {
      const vals = journeys.map(j => j[mode][a]?.floorReached ?? 0)
      return avg(vals).toFixed(1).padStart(6)
    })
    console.log(`  ${label} ${row.join('')}`)
  }
  console.log()
}

// ─── 2. META-PROGRESSION DELTA (vs baseline) ─────────────────────────────────
console.log('META-PROGRESSION BOOST  (+floors vs baseline per attempt)')
console.log(attemptHeader)
console.log('  ' + '─'.repeat(attemptHeader.length - 2))
for (const cls of CLASS_IDS) {
  const journeys = allJourneys[cls]
  for (const mode of ['fullCarry', 'waypoint'] as Mode[]) {
    const label = `${cls.padEnd(10)}${MODE_LABEL[mode].padEnd(13)}`
    const row = REPORT_ATTEMPTS.map(a => {
      const base  = avg(journeys.map(j => j.baseline[a]?.floorReached ?? 0))
      const meta  = avg(journeys.map(j => j[mode][a]?.floorReached ?? 0))
      const delta = meta - base
      return (delta >= 0 ? '+' : '') + delta.toFixed(1).padStart(5)
    })
    console.log(`  ${label} ${row.join('')}`)
  }
  console.log()
}

// ─── 3. DIFFICULTY DISTRIBUTION (waypoint mode) ───────────────────────────────
console.log('DIFFICULTY DISTRIBUTION  (waypoint mode — which tier each attempt was on)')
console.log('  ' + 'Class'.padEnd(12) + 'Difficulty'.padEnd(12) + REPORT_ATTEMPTS.map(a => `R${a + 1}`.padStart(6)).join(''))
console.log('  ' + '─'.repeat(70))
for (const cls of CLASS_IDS) {
  const journeys = allJourneys[cls]
  const tiers: Array<[1 | 2 | 3, string]> = [[1, 'Normal'], [2, 'Nightmare'], [3, 'Hell']]
  let first = true
  for (const [tier, label] of tiers) {
    const row = REPORT_ATTEMPTS.map(a => {
      const n = journeys.filter(j => (j.waypoint[a]?.diffTier ?? 1) === tier).length
      return pctStr(n, journeys.length)
    })
    const clsLabel = first ? cls.padEnd(12) : ''.padEnd(12)
    first = false
    console.log(`  ${clsLabel}${label.padEnd(12)}${row.join('')}`)
  }
  console.log()
}

// ─── 4. WAYPOINT — AVG FLOOR BY DIFFICULTY PHASE ─────────────────────────────
// Segments waypoint mode by which difficulty was active — the real balance signal.
// Low floors on NM/Hell = that tier is too hard. Near-ceiling = too easy.
console.log('WAYPOINT AVG FLOOR BY DIFFICULTY  (floor reached within active difficulty)')
console.log('  ' + 'Class'.padEnd(12) + 'Difficulty'.padEnd(12) + REPORT_ATTEMPTS.map(a => `R${a + 1}`.padStart(6)).join(''))
console.log('  ' + '─'.repeat(70))
for (const cls of CLASS_IDS) {
  const journeys = allJourneys[cls]
  const tiers: Array<[1 | 2 | 3, string]> = [[1, 'Normal'], [2, 'Nightmare'], [3, 'Hell']]
  let first = true
  for (const [tier, label] of tiers) {
    const row = REPORT_ATTEMPTS.map(a => {
      const vals = journeys
        .map(j => j.waypoint[a])
        .filter(s => s?.diffTier === tier)
        .map(s => s!.floorReached)
      if (vals.length < 5) return '   —  '   // fewer than 5 players on this tier yet
      return avg(vals).toFixed(1).padStart(6)
    })
    const clsLabel = first ? cls.padEnd(12) : ''.padEnd(12)
    first = false
    console.log(`  ${clsLabel}${label.padEnd(12)}${row.join('')}`)
  }
  console.log()
}

// ─── 5. WITHIN-RUN GEAR IMPACT ────────────────────────────────────────────────
// Bin baseline runs by gear score at F3 (low / mid / high third) → show F5+ survival
console.log('WITHIN-RUN GEAR IMPACT  (gear score at F3 → survival to F5/F8)')
console.log(`  ${'Class'.padEnd(10)} ${'Gear@F3'.padStart(8)} ${'F5+ reach'.padStart(10)} ${'F8+ reach'.padStart(10)} ${'runs'.padStart(7)}`)
console.log('  ' + '─'.repeat(50))
for (const cls of CLASS_IDS) {
  const journeys = allJourneys[cls]
  // Collect all baseline runs that reached F3 (have gearScoreAtFloor[2])
  const runsAtF3 = journeys.flatMap(j => j.baseline).filter(r => r.gearScoreAtFloor[2] != null)
  if (runsAtF3.length === 0) { console.log(`  ${cls.padEnd(10)} (no data)`); continue }

  const scores = runsAtF3.map(r => r.gearScoreAtFloor[2])
  scores.sort((a, b) => a - b)
  const lo = scores[Math.floor(scores.length * 0.33)]
  const hi = scores[Math.floor(scores.length * 0.67)]

  const bands: Array<[string, (s: number) => boolean]> = [
    ['Low gear', s => s <= lo],
    ['Mid gear', s => s > lo && s <= hi],
    ['High gear', s => s > hi],
  ]
  let first = true
  for (const [label, pred] of bands) {
    const band = runsAtF3.filter(r => pred(r.gearScoreAtFloor[2]))
    const avgGear = avg(band.map(r => r.gearScoreAtFloor[2]))
    const f5 = band.filter(r => r.floorReached >= 5 || r.survived).length
    const f8 = band.filter(r => r.floorReached >= 8 || r.survived).length
    const clsLabel = first ? cls.padEnd(10) : ''.padEnd(10)
    first = false
    console.log(`  ${clsLabel} ${label.padEnd(8)} ${avgGear.toFixed(0).padStart(8)} ${pctStr(f5, band.length).padStart(10)} ${pctStr(f8, band.length).padStart(10)} ${band.length.toString().padStart(7)}`)
  }
  console.log()
}

// ─── 5. WITHIN-RUN LEVEL IMPACT ───────────────────────────────────────────────
// Compare: baseline runs grouped by level at F3 (low 0-2 / mid 3-5 / high 6+)
console.log('WITHIN-RUN LEVEL IMPACT  (level at F3 entry → survival to F5/F8)')
console.log(`  ${'Class'.padEnd(10)} ${'Level@F3'.padStart(9)} ${'F5+ reach'.padStart(10)} ${'F8+ reach'.padStart(10)} ${'runs'.padStart(7)}`)
console.log('  ' + '─'.repeat(52))
for (const cls of CLASS_IDS) {
  const journeys = allJourneys[cls]
  const runsAtF3 = journeys.flatMap(j => j.baseline).filter(r => r.gearScoreAtFloor[2] != null)

  // Use earnedXp at F3 to approximate level: XP earned by F3 ≈ earnedXp × (3/floorReached)
  const levelAtF3 = (r: AttemptSnapshot): number => {
    const estXp = r.floorReached >= 3 ? r.earnedXp * Math.min(1, 3 / r.floorReached) : r.earnedXp
    // Invert xpForLevel: level*(level+1)/2*100 <= estXp
    let lv = 0; while ((lv + 1) * (lv + 2) / 2 * 100 <= estXp) lv++
    return lv
  }

  const groups: Array<[string, (l: number) => boolean]> = [
    ['Lv 0-2', l => l <= 2],
    ['Lv 3-5', l => l >= 3 && l <= 5],
    ['Lv 6+',  l => l >= 6],
  ]

  let first = true
  for (const [label, pred] of groups) {
    const band = runsAtF3.filter(r => r.floorReached >= 3 && pred(levelAtF3(r)))
    if (band.length === 0) continue
    const avgLvl = avg(band.map(r => levelAtF3(r)))
    const f5 = band.filter(r => r.floorReached >= 5 || r.survived).length
    const f8 = band.filter(r => r.floorReached >= 8 || r.survived).length
    const clsLabel = first ? cls.padEnd(10) : ''.padEnd(10)
    first = false
    console.log(`  ${clsLabel} ${label.padEnd(9)} ${avgLvl.toFixed(1).padStart(9)} ${pctStr(f5, band.length).padStart(10)} ${pctStr(f8, band.length).padStart(10)} ${band.length.toString().padStart(7)}`)
  }
  console.log()
}

// ─── 6. FIRST CLEAR ──────────────────────────────────────────────────────────
console.log(`FIRST FULL CLEAR  (by mode — % of players that cleared F${FLOOR_COUNT} at least once by R<N>)`)
console.log(attemptHeader)
console.log('  ' + '─'.repeat(attemptHeader.length - 2))
for (const cls of CLASS_IDS) {
  const journeys = allJourneys[cls]
  for (const mode of ['baseline', 'fullCarry', 'waypoint'] as Mode[]) {
    const label = `${cls.padEnd(10)}${MODE_LABEL[mode].padEnd(13)}`
    const firstClears = journeys.map(j => j[mode].findIndex(s => s.survived))
    const row = REPORT_ATTEMPTS.map(a => {
      const cleared = firstClears.filter(i => i !== -1 && i <= a).length
      return pctStr(cleared, journeys.length)
    })
    console.log(`  ${label} ${row.join('')}`)
  }
  console.log()
}

// ─── 7. ATTEMPTS TO FIRST CLEAR ──────────────────────────────────────────────
// Answers: "how many 'new run' clicks until first completion?"
console.log(`ATTEMPTS TO FIRST F${FLOOR_COUNT} CLEAR  (how many "new run" clicks needed?)`)
console.log(`  ${'Class/Mode'.padEnd(24)} ${'P25'.padStart(6)} ${'Median'.padStart(8)} ${'P75'.padStart(6)} ${'Never%'.padStart(8)}  (players who never cleared within ${ATTEMPTS} attempts)`)
console.log('  ' + '─'.repeat(72))
for (const cls of CLASS_IDS) {
  const journeys = allJourneys[cls]
  for (const mode of ['baseline', 'fullCarry', 'waypoint'] as Mode[]) {
    const label = `${cls.padEnd(10)}${MODE_LABEL[mode].padEnd(14)}`
    const firstClear = journeys.map(j => j[mode].findIndex(s => s.survived))
    const cleared    = firstClear.filter(i => i !== -1).sort((a, b) => a - b)
    const neverPct   = ((firstClear.filter(i => i === -1).length / journeys.length) * 100).toFixed(0) + '%'
    if (cleared.length === 0) {
      console.log(`  ${label}   n/a      n/a    n/a  ${neverPct.padStart(8)}`)
      continue
    }
    const p25    = cleared[Math.floor(cleared.length * 0.25)] + 1
    const median = cleared[Math.floor(cleared.length * 0.50)] + 1
    const p75    = cleared[Math.floor(cleared.length * 0.75)] + 1
    console.log(`  ${label} ${p25.toString().padStart(6)} ${median.toString().padStart(8)} ${p75.toString().padStart(6)} ${neverPct.padStart(8)}`)
  }
  console.log()
}

console.log(`${'═'.repeat(72)}\n`)

// ─── HTML report ──────────────────────────────────────────────────────────────
if (WRITE_HTML) {
  const OUT_PATH = new URL('../sim/journey.html', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
  const CLS_COLOR: Record<ClassId, string> = { warrior: '#c87a3a', rogue: '#7ac85a', sorcerer: '#5a7ac8' }
  const CLS_LABEL: Record<ClassId, string> = { warrior: '⚔ Warrior', rogue: '† Rogue', sorcerer: '⊹ Sorcerer' }
  const MODE_COLOR: Record<Mode, string>   = { baseline: '#888', fullCarry: '#c8a060', waypoint: '#60c880' }

  // ── Avg floor SVG line chart ──────────────────────────────────────────────
  function avgFloorSvg(cls: ClassId): string {
    const journeys = allJourneys[cls]
    const modes: Mode[] = ['baseline', 'fullCarry', 'waypoint']
    const chartH = 160, colW = Math.max(16, Math.floor(560 / ATTEMPTS)), chartW = colW * ATTEMPTS + 70
    let svg = `<svg width="${chartW}" height="${chartH + 40}" style="display:block">`
    for (let f = 0; f <= FLOOR_COUNT; f += 2) {
      const y = chartH - (f / FLOOR_COUNT) * chartH + 10
      svg += `<line x1="60" y1="${y}" x2="${chartW - 10}" y2="${y}" stroke="#2a1e0e" stroke-width="1"/>`
      svg += `<text x="54" y="${y + 4}" fill="#5a4020" font-size="10" text-anchor="end">F${f}</text>`
    }
    for (let a = 0; a < ATTEMPTS; a += 5) {
      const x = 60 + a * colW + colW / 2
      svg += `<text x="${x}" y="${chartH + 28}" fill="#5a4020" font-size="10" text-anchor="middle">R${a + 1}</text>`
    }
    for (const mode of modes) {
      const points = Array.from({ length: ATTEMPTS }, (_, a) => {
        const vals = journeys.map(j => j[mode][a]?.floorReached ?? 0)
        const avgF = avg(vals)
        const x = 60 + a * colW + colW / 2
        const y = chartH - (avgF / FLOOR_COUNT) * chartH + 10
        return `${x},${y}`
      })
      const dash = mode === 'fullCarry' ? 'stroke-dasharray="4 2"' : mode === 'waypoint' ? '' : 'stroke-dasharray="2 4"'
      svg += `<polyline points="${points.join(' ')}" fill="none" stroke="${MODE_COLOR[mode]}" stroke-width="${mode === 'waypoint' ? 2.5 : 1.5}" ${dash} stroke-linejoin="round"/>`
    }
    // Legend
    let lx = 65
    for (const mode of modes) {
      svg += `<line x1="${lx}" y1="${chartH + 38}" x2="${lx + 20}" y2="${chartH + 38}" stroke="${MODE_COLOR[mode]}" stroke-width="2"/>`
      svg += `<text x="${lx + 24}" y="${chartH + 42}" fill="${MODE_COLOR[mode]}" font-size="10">${MODE_LABEL[mode]}</text>`
      lx += 110
    }
    svg += '</svg>'
    return svg
  }

  // ── Progression heat map ──────────────────────────────────────────────────
  function heatMap(cls: ClassId, mode: Mode): string {
    const journeys = allJourneys[cls]
    let html = `<div class="heatmap-wrap"><table class="heatmap"><thead><tr><th>F</th>`
    for (let a = 0; a < ATTEMPTS; a++) html += `<th>${a + 1}</th>`
    html += '</tr></thead><tbody>'
    for (let floor = 1; floor <= FLOOR_COUNT; floor++) {
      html += `<tr><td class="floor-label">F${floor}</td>`
      for (let a = 0; a < ATTEMPTS; a++) {
        const reached = journeys.filter(j => (j[mode][a]?.floorReached ?? 0) >= floor || j[mode][a]?.survived).length
        const rate = reached / journeys.length
        const r2 = rate < 0.5 ? 180 : Math.round((1 - (rate - 0.5) * 2) * 180)
        const g2 = rate < 0.5 ? Math.round(rate * 2 * 160) : 160
        const alpha = 0.15 + rate * 0.75
        html += `<td style="background:rgba(${r2},${g2},20,${alpha.toFixed(2)});text-align:center;font-size:9px;color:#ddd">${rate > 0.02 ? `${(rate * 100).toFixed(0)}%` : '·'}</td>`
      }
      html += '</tr>'
    }
    html += '</tbody></table></div>'
    return html
  }

  // ── Gear impact bar chart ─────────────────────────────────────────────────
  function gearImpactSection(): string {
    let html = ''
    for (const cls of CLASS_IDS) {
      const journeys = allJourneys[cls]
      const runsAtF3 = journeys.flatMap(j => j.baseline).filter(r => r.gearScoreAtFloor[2] != null)
      if (runsAtF3.length === 0) continue
      const scores = runsAtF3.map(r => r.gearScoreAtFloor[2]).sort((a, b) => a - b)
      const lo = scores[Math.floor(scores.length * 0.33)]
      const hi = scores[Math.floor(scores.length * 0.67)]
      const bands: Array<{ label: string; runs: AttemptSnapshot[] }> = [
        { label: 'Low gear (bottom third)',  runs: runsAtF3.filter(r => r.gearScoreAtFloor[2] <= lo) },
        { label: 'Mid gear (middle third)',  runs: runsAtF3.filter(r => r.gearScoreAtFloor[2] > lo && r.gearScoreAtFloor[2] <= hi) },
        { label: 'High gear (top third)',    runs: runsAtF3.filter(r => r.gearScoreAtFloor[2] > hi) },
      ]
      html += `<div style="margin-bottom:20px"><h3 class="snap-title" style="color:${CLS_COLOR[cls]}">${CLS_LABEL[cls]}</h3>`
      for (const { label, runs } of bands) {
        const f5 = runs.filter(r => r.floorReached >= 5 || r.survived).length / runs.length
        const f8 = runs.filter(r => r.floorReached >= 8 || r.survived).length / runs.length
        const avgG = avg(runs.map(r => r.gearScoreAtFloor[2]))
        html += `<div style="margin:4px 0;font-size:11px;color:#9a8060">${label} (avg score ${avgG.toFixed(0)})</div>`
        for (const [flr, rate] of [['F5+', f5], ['F8+', f8]] as [string, number][]) {
          html += `<div style="display:flex;align-items:center;gap:8px;margin:2px 0">`
          html += `<span style="min-width:32px;font-size:10px;color:#7a6040">${flr}</span>`
          html += `<div style="flex:1;max-width:300px;background:#1a1205;height:14px;border:1px solid #2a1e0e;position:relative">`
          html += `<div style="width:${(rate * 100).toFixed(0)}%;height:100%;background:${CLS_COLOR[cls]}55;border-right:2px solid ${CLS_COLOR[cls]}"></div>`
          html += `<span style="position:absolute;right:6px;top:0;line-height:14px;font-size:10px;color:#c8a060">${(rate * 100).toFixed(0)}%</span>`
          html += `</div></div>`
        }
      }
      html += '</div>'
    }
    return html
  }

  // ── Meta-progression delta table ──────────────────────────────────────────
  function metaDeltaTable(): string {
    const cols = REPORT_ATTEMPTS.map(a => `<th>R${a + 1}</th>`).join('')
    let html = `<table><thead><tr><th>Class</th><th>Mode</th>${cols}</tr></thead><tbody>`
    for (const cls of CLASS_IDS) {
      const journeys = allJourneys[cls]
      const modes: Mode[] = ['baseline', 'fullCarry', 'waypoint']
      for (const mode of modes) {
        html += `<tr><td class="cls" style="color:${CLS_COLOR[cls]}">${mode === 'baseline' ? CLS_LABEL[cls] : ''}</td>`
        html += `<td style="color:${MODE_COLOR[mode]}">${MODE_LABEL[mode]}</td>`
        for (const a of REPORT_ATTEMPTS) {
          const base = avg(journeys.map(j => j.baseline[a]?.floorReached ?? 0))
          const meta = avg(journeys.map(j => j[mode][a]?.floorReached ?? 0))
          const delta = meta - base
          const color = mode === 'baseline' ? '#888' : delta > 1.5 ? '#cc4444' : delta > 0.5 ? '#ccaa33' : '#44aa44'
          const text  = mode === 'baseline' ? meta.toFixed(1) : (delta >= 0 ? '+' : '') + delta.toFixed(1)
          html += `<td style="text-align:center;color:${color}">${text}</td>`
        }
        html += '</tr>'
      }
      html += `<tr><td colspan="${REPORT_ATTEMPTS.length + 2}" style="border:none;height:8px"></td></tr>`
    }
    html += '</tbody></table>'
    return html
  }

  const now = new Date().toLocaleString()
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>D2Game — Player Journey &amp; Meta-Progression Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0c0b09; color: #c8a96e; font-family: 'Courier New', Courier, monospace; font-size: 13px; padding: 24px; }
  h1 { font-size: 20px; color: #e8c87e; border-bottom: 2px solid #5a3a10; padding-bottom: 8px; margin-bottom: 4px; letter-spacing: 2px; text-transform: uppercase; }
  h2 { font-size: 13px; color: #e8c87e; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; border-left: 3px solid #c87a3a; padding-left: 8px; margin-top: 0; }
  h3.snap-title { font-size: 12px; color: #9a7848; margin-bottom: 6px; font-weight: normal; }
  p.meta { color: #8a7050; font-size: 11px; margin-bottom: 28px; }
  p.sub  { color: #7a6040; font-size: 11px; margin-bottom: 8px; }
  section { margin-bottom: 36px; }
  .callout { background: #100f0c; border: 1px solid #3a2a0e; border-left: 4px solid #c87a3a; padding: 10px 16px; margin-bottom: 12px; font-size: 12px; color: #b09050; }
  .callout.warn { border-left-color: #cc4444; color: #cc9090; }
  .callout.good { border-left-color: #44aa44; color: #90cc90; }
  .tscroll { overflow-x: auto; }
  table { border-collapse: collapse; }
  th, td { padding: 4px 8px; border: 1px solid #2a1e0e; font-size: 11px; white-space: nowrap; }
  th { background: #1a1205; color: #c8a060; font-weight: normal; text-align: center; }
  td.cls { font-weight: bold; min-width: 110px; }
  td.floor-label { color: #7a6040; font-size: 9px; text-align: right; min-width: 22px; }
  tr:nth-child(even) td:not([style]) { background: #0f0e0c; }
  .heatmap-wrap { overflow-x: auto; margin-bottom: 8px; }
  .heatmap th { font-size: 9px; padding: 2px 3px; min-width: 22px; }
  .heatmap td { font-size: 9px; padding: 2px 2px; min-width: 22px; }
  .grid3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; }
  .grid2 { display: grid; grid-template-columns: repeat(2,1fr); gap: 24px; }
  @media (max-width: 1200px) { .grid3 { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 800px)  { .grid3,.grid2 { grid-template-columns: 1fr; } }
  .legend { display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 12px; }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #9a8060; }
  .legend-line { width: 24px; height: 2px; }
</style>
</head>
<body>
<h1>D2Game — Player Journey &amp; Meta-Progression Report</h1>
<p class="meta">Generated ${now} &nbsp;|&nbsp; ${PLAYERS} players × ${ATTEMPTS} attempts &nbsp;|&nbsp; Full item carry &nbsp;|&nbsp; Waypoints every 5 floors &nbsp;|&nbsp; Normal → Nightmare → Hell</p>

<section>
  <h2>How It Works</h2>
  <div class="callout">
    <b>Baseline</b> — each run starts fresh (level 0, empty inventory). Pure skill-learning loop.<br>
    <b>+ Full carry</b> — 100% XP + all equipped items persist into next run. Start F1, Normal each time.<br>
    <b>+ Waypoint</b> — full carry + start from last unlocked waypoint (every 5 floors) + difficulty tiers unlock after clears (Normal → Nightmare → Hell).
  </div>
  <div class="callout good">
    Full carry removes the artificial 2-item cap from older sims — the real game has no equip limit.
    Waypoints let players focus on the hard floors rather than re-running early content.
    Difficulty tiers (Normal → Nightmare → Hell) provide escalating challenge for veteran characters.
  </div>
</section>

<section>
  <h2>Avg Floor Reached — Baseline vs Meta Modes</h2>
  <p class="sub">Solid = Waypoint. Dashed = Full carry. Dotted = Baseline.</p>
  <div class="legend">
    ${(['baseline', 'fullCarry', 'waypoint'] as Mode[]).map(m =>
      `<div class="legend-item"><div class="legend-line" style="background:${MODE_COLOR[m]}"></div>${MODE_LABEL[m]}</div>`).join('')}
  </div>
  <div class="grid3">
    ${CLASS_IDS.map(cls => `<div><h3 class="snap-title" style="color:${CLS_COLOR[cls]}">${CLS_LABEL[cls]}</h3>${avgFloorSvg(cls)}</div>`).join('')}
  </div>
</section>

<section>
  <h2>Meta-Progression Delta vs Baseline</h2>
  <p class="sub">
    Red (&gt;+1.5) = meta too strong — players skip learning the hard floors.<br>
    Yellow (+0.5–1.5) = healthy — meaningful but not trivialising.<br>
    Green (&lt;+0.5) = meta barely helps — may feel pointless to players.
  </p>
  <div class="tscroll">${metaDeltaTable()}</div>
</section>

<section>
  <h2>Progression Heat Maps</h2>
  <p class="sub">% of players reaching each floor on each attempt. Left = early attempts, right = veterans.</p>
  ${CLASS_IDS.map(cls => `
    <div style="margin-bottom:28px">
      <h3 class="snap-title" style="color:${CLS_COLOR[cls]}">${CLS_LABEL[cls]}</h3>
      <div class="grid3">
        ${(['baseline', 'fullCarry', 'waypoint'] as Mode[]).map(m =>
          `<div><p class="sub" style="color:${MODE_COLOR[m]}">${MODE_LABEL[m]}</p>${heatMap(cls, m)}</div>`
        ).join('')}
      </div>
    </div>
  `).join('')}
</section>

<section>
  <h2>Within-Run Gear Impact</h2>
  <p class="sub">
    Runs binned by total gear score at F3 entry. Shows whether lucky early drops dominate survival.
    If high-gear reaches F8 at 3× the rate of low-gear → gear variance is the primary driver.
  </p>
  ${gearImpactSection()}
</section>

<section>
  <h2>First Full Clear</h2>
  <p class="sub">% of players who have cleared all ${FLOOR_COUNT} floors at least once by attempt R&lt;N&gt;, per mode.</p>
  <div class="tscroll">
    <table><thead><tr><th>Class</th><th>Mode</th>${REPORT_ATTEMPTS.map(a => `<th>≤R${a+1}</th>`).join('')}</tr></thead><tbody>
    ${CLASS_IDS.flatMap(cls => (['baseline', 'fullCarry', 'waypoint'] as Mode[]).map((mode, mi) => {
      const journeys = allJourneys[cls]
      const firstClears = journeys.map(j => j[mode].findIndex(s => s.survived))
      return `<tr><td class="cls" style="color:${CLS_COLOR[cls]}">${mi === 0 ? CLS_LABEL[cls] : ''}</td><td style="color:${MODE_COLOR[mode]}">${MODE_LABEL[mode]}</td>` +
        REPORT_ATTEMPTS.map(a => {
          const n = firstClears.filter(i => i !== -1 && i <= a).length
          const r = n / journeys.length
          const c = r > 0.5 ? '#44aa44' : r > 0.2 ? '#aaaa44' : '#888'
          return `<td style="text-align:center;color:${c}">${(r * 100).toFixed(0)}%</td>`
        }).join('') + '</tr>'
    })).join('')}
    </tbody></table>
  </div>
</section>

</body>
</html>`

  require('fs').writeFileSync(OUT_PATH, html, 'utf8')
  console.log(`  HTML report written → ${OUT_PATH}\n`)
}
