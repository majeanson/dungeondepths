/**
 * sim:loot — Generate 10k items and print tier distribution.
 * bun run src/sim/lootSim.ts [floor] [magicFind]
 */

import { makeRng } from '../engine/rng'
import { generateItem, type ItemQuality } from '../engine/loot'

const floor = parseInt(process.argv[2] ?? '5')
const magicFind = parseInt(process.argv[3] ?? '0')
const N = 10_000

const rng = makeRng(Date.now())
const counts: Record<ItemQuality, number> = { normal: 0, magic: 0, rare: 0, unique: 0 }
const slotCounts: Record<string, number> = {}

for (let i = 0; i < N; i++) {
  const item = generateItem(rng, { floor, magicFind })
  counts[item.quality]++
  slotCounts[item.slot] = (slotCounts[item.slot] ?? 0) + 1
}

console.log(`\n=== Loot Sim — Floor ${floor} | Magic Find ${magicFind}% | N=${N} ===\n`)

console.log('Quality Distribution:')
for (const [q, n] of Object.entries(counts)) {
  const pct = ((n / N) * 100).toFixed(1)
  const bar = '█'.repeat(Math.round(n / N * 40))
  console.log(`  ${q.padEnd(8)} ${pct.padStart(5)}%  ${bar}  (${n})`)
}

console.log('\nSlot Distribution:')
const sortedSlots = Object.entries(slotCounts).sort((a, b) => b[1] - a[1])
for (const [slot, n] of sortedSlots) {
  const pct = ((n / N) * 100).toFixed(1)
  console.log(`  ${slot.padEnd(14)} ${pct.padStart(5)}%  (${n})`)
}

console.log()
