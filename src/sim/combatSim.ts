/**
 * sim:combat — Run 1000 combats, assert no infinite loops, print avg TTK stats.
 * bun run src/sim/combatSim.ts [floor] [tier]
 */

import { makeRng } from '../engine/rng'
import { spawnMonster, type EncounterTier } from '../engine/monsters'
import { simulateCombat, type PlayerCombatStats } from '../engine/combat'

const floor = parseInt(process.argv[2] ?? '5')
const tier = (process.argv[3] ?? 'normal') as EncounterTier
const N = 1000

const PLAYER: PlayerCombatStats = {
  hp: 80 + floor * 5,
  maxHp: 80 + floor * 5,
  damage: [8 + floor * 2, 16 + floor * 3],
  defense: 5 + floor * 2,
  critChance: 10,
  attackSpeed: 50,
  stamina: 100,
}

const rng = makeRng(42)
let victories = 0
let defeats = 0
let totalRounds = 0
let maxRounds = 0
let totalHpRemaining = 0

for (let i = 0; i < N; i++) {
  const monster = spawnMonster(rng, floor, tier)
  const result = simulateCombat(rng, PLAYER, monster)
  if (result.outcome === 'victory') {
    victories++
    totalHpRemaining += result.hpRemaining
  } else {
    defeats++
  }
  totalRounds += result.rounds.length
  maxRounds = Math.max(maxRounds, result.rounds.length)
}

const avgRounds = (totalRounds / N).toFixed(1)
const winRate = ((victories / N) * 100).toFixed(1)
const avgHpLeft = victories > 0 ? (totalHpRemaining / victories).toFixed(1) : 'N/A'

console.log(`\n=== Combat Sim — Floor ${floor} | Tier: ${tier} | N=${N} ===\n`)
console.log(`  Player HP:     ${PLAYER.hp}`)
console.log(`  Player Damage: ${PLAYER.damage[0]}–${PLAYER.damage[1]}`)
console.log(`  Player Def:    ${PLAYER.defense}`)
console.log()
console.log(`  Win Rate:      ${winRate}%  (${victories}/${N})`)
console.log(`  Avg Rounds:    ${avgRounds}`)
console.log(`  Max Rounds:    ${maxRounds}  (cap=50)`)
console.log(`  Avg HP Left:   ${avgHpLeft}`)

if (maxRounds >= 50) {
  console.warn('\n  ⚠ WARNING: Some combats hit the MAX_ROUNDS cap — balance check needed')
} else {
  console.log('\n  ✓ No infinite loops detected')
}
console.log()
