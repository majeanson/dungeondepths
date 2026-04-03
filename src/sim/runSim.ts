/**
 * sim:floors — Simulate N floors headless and print encounters + drops.
 * bun run src/sim/runSim.ts [floors] [magicFind]
 */

import { makeRng } from '../engine/rng'
import { generateFloor, GRID_W, GRID_H, TileType } from '../engine/grid'
import { rollEncounter, EncounterType } from '../engine/encounter'
import { rollLoot } from '../engine/loot'
import { spawnMonster, type EncounterTier } from '../engine/monsters'
import { simulateCombat, type PlayerCombatStats } from '../engine/combat'

const floors = parseInt(process.argv[2] ?? '5')
const magicFind = parseInt(process.argv[3] ?? '0')

const masterRng = makeRng(Date.now())

let totalItems = 0
let totalEncounters = 0
const encounterCounts: Record<string, number> = {}
const qualityCounts: Record<string, number> = { normal: 0, magic: 0, rare: 0, unique: 0 }
let combatVictories = 0
let combatDefeats = 0

// Simulated player — grows slightly each floor
function playerForFloor(floor: number): PlayerCombatStats {
  return {
    hp: 80 + floor * 5,
    maxHp: 80 + floor * 5,
    damage: [8 + floor * 2, 16 + floor * 3],
    defense: 5 + floor * 2,
    critChance: 10,
    attackSpeed: 50,
    stamina: 100,
  }
}

function tierForEncounter(type: EncounterType): EncounterTier {
  const map: Record<string, EncounterTier> = {
    normal: 'normal', elite: 'elite', rare: 'rare', ancient: 'ancient'
  }
  return map[type] ?? 'normal'
}

console.log(`\n=== Floor Sim — ${floors} floors | Magic Find ${magicFind}% ===\n`)

for (let f = 1; f <= floors; f++) {
  const floorRng = makeRng(masterRng() * 2 ** 32)
  const { grid, playerStart, rooms } = generateFloor(f, floorRng)

  // Count walkable tiles
  let walkable = 0
  for (let y = 0; y < GRID_H; y++)
    for (let x = 0; x < GRID_W; x++)
      if (grid[y][x].type !== TileType.Wall) walkable++

  // Simulate walking all walkable tiles and rolling encounters
  const floorDrops: string[] = []
  let floorEncounters = 0

  for (let i = 0; i < walkable; i++) {
    const enc = rollEncounter(floorRng, f)
    encounterCounts[enc] = (encounterCounts[enc] ?? 0) + 1

    if (enc === EncounterType.Empty) continue
    floorEncounters++
    totalEncounters++

    if ([EncounterType.Normal, EncounterType.Elite, EncounterType.Rare, EncounterType.Ancient].includes(enc)) {
      const tier = tierForEncounter(enc)
      const monster = spawnMonster(floorRng, f, tier)
      const player = playerForFloor(f)
      const combat = simulateCombat(floorRng, player, monster)
      if (combat.outcome === 'victory') combatVictories++
      else combatDefeats++
    }

    const drops = rollLoot(floorRng, enc, f, magicFind)
    for (const item of drops) {
      totalItems++
      qualityCounts[item.quality] = (qualityCounts[item.quality] ?? 0) + 1
      if (item.quality !== 'normal') {
        floorDrops.push(`  ${item.quality.toUpperCase().padEnd(7)} ${item.displayName} [${item.slot}]`)
      }
    }
  }

  console.log(`Floor ${f} — ${walkable} walkable tiles, ${rooms.length} rooms, ${floorEncounters} encounters`)
  if (floorDrops.length > 0) {
    const shown = floorDrops.slice(0, 8)
    shown.forEach(d => console.log(d))
    if (floorDrops.length > 8) console.log(`  ... +${floorDrops.length - 8} more drops`)
  }
  console.log()
}

console.log('=== Summary ===')
console.log(`Total Encounters: ${totalEncounters}`)
console.log(`Combat: ${combatVictories} wins / ${combatDefeats} losses`)
console.log(`Total Item Drops: ${totalItems}`)
console.log('Quality breakdown:')
for (const [q, n] of Object.entries(qualityCounts)) {
  if (n > 0) console.log(`  ${q.padEnd(8)} ${n}  (${((n / totalItems) * 100).toFixed(1)}%)`)
}
console.log()
