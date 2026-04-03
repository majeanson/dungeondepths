/**
 * classBalanceSim — Per-class balance harness.
 *
 * Three scenarios per class (Warrior / Rogue / Sorcerer):
 *   A. Naked   — level 0, no gear, NO skills (Power Strike / Backstab / Fireball unlock at lvl 1)
 *   B. Skilled — level 5, no gear, optimal skill rotation
 *   C. Geared  — level 5, class-appropriate F1–F2 gear, optimal skill rotation
 *
 * Floor 1 model:
 *   Roll 80 encounter tiles (realistic partial-floor exploration before finding exit).
 *   Player must survive every combat encounter. HP + mana persist between fights.
 *   Shrines restore +25 HP. 3 HP potions (30 HP each) per run, consumed at HP < 50%.
 *
 * Key output: "runs until first floor done" = 1 / completion_rate
 *
 * bun run src/sim/classBalanceSim.ts
 */

import { makeRng, type Rng } from '../engine/rng'
import { rollEncounter, EncounterType } from '../engine/encounter'
import { spawnMonster, type EncounterTier, type MonsterInstance } from '../engine/monsters'
import { applyCombatAction, type PlayerCombatStats, type CombatAction } from '../engine/combat'
import type { SkillId } from '../data/skills'

// ─────────────────────────────────────────────────────────────────────────────
// Class stat builder (mirrors combatStore.buildPlayerStats)
// ─────────────────────────────────────────────────────────────────────────────

type ClassId = 'warrior' | 'rogue' | 'sorcerer'

const CLASS_DEFS: Record<ClassId, {
  bonusHp: number; defPerLevel: number; bonusCrit: number; bonusDex: number
  baseMana: number; manaPerLevel: number; spellPF: number; spellPL: number
}> = {
  warrior:  { bonusHp:  20, defPerLevel: 2, bonusCrit:  0, bonusDex:  0, baseMana: 50, manaPerLevel:  5, spellPF: 0, spellPL: 0 },
  rogue:    { bonusHp: -10, defPerLevel: 0, bonusCrit: 10, bonusDex:  8, baseMana: 60, manaPerLevel:  6, spellPF: 0, spellPL: 0 },
  sorcerer: { bonusHp:   5, defPerLevel: 0, bonusCrit:  0, bonusDex:  0, baseMana: 60, manaPerLevel:  6, spellPF: 0, spellPL: 7 },
}

interface GearBonus {
  life?:       number
  defense?:    number
  damage?:     number
  dexterity?:  number
  critChance?: number
  spellPower?: number
  blockChance?: number
}

interface BuiltStats extends PlayerCombatStats {
  maxMana: number
}

function buildStats(classId: ClassId, level: number, floor: number, gear: GearBonus = {}): BuiltStats {
  const c   = CLASS_DEFS[classId]
  const f   = floor
  const lvl = level

  const maxMana  = c.baseMana + lvl * c.manaPerLevel
  const spellPow = f * c.spellPF + lvl * c.spellPL + (gear.spellPower ?? 0)
  const hp       = 80 + f * 5 + lvl * 5 + c.bonusHp + (gear.life ?? 0)

  return {
    hp,
    maxHp: hp,
    damage:      [8 + f * 2 + lvl + (gear.damage ?? 0), 16 + f * 3 + lvl + (gear.damage ?? 0)],
    defense:     5 + f * 2 + lvl + c.defPerLevel * lvl + (gear.defense ?? 0),
    critChance:  10 + c.bonusCrit + Math.floor(lvl / 5) * 2 + (gear.critChance ?? 0),
    attackSpeed: 50,
    stamina:     100,
    dexterity:   c.bonusDex + (gear.dexterity ?? 0),
    blockChance: Math.min(75, gear.blockChance ?? 0),
    spellPower:  spellPow,
    maxMana,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill strategy — pick best action given combat state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Greedy-optimal action chooser per class.
 * `round` is 1-indexed. `level` determines what skills are unlocked.
 * Status trackers (battleCry/ironSkin/smoke/shield rounds left) handled externally.
 */
function chooseAction(
  classId: ClassId,
  level: number,
  mana: number,
  playerHp: number,
  maxHp: number,
  monsterHp: number,
  monsterMaxHp: number,
  round: number,
  statusRounds: { battleCry: number; ironSkin: number; smoke: number; manaShield: number },
): CombatAction {
  const hpPct = playerHp / maxHp
  const mHpPct = monsterHp / monsterMaxHp

  // Shared defensive buffs (passed through on every action anyway — here we just pick the primary action)
  const base: Partial<CombatAction> = {
    incomingDamageReduction: statusRounds.battleCry  > 0 ? 0.35  : undefined,
    ironSkinBonus:           statusRounds.ironSkin   > 0 ? 30    : undefined,
    smokeScreenActive:       statusRounds.smoke      > 0,
    manaShieldActive:        statusRounds.manaShield > 0,
  }

  // ── WARRIOR ────────────────────────────────────────────────────────────────
  if (classId === 'warrior') {
    // Iron Skin: free, use if HP < 55% and not already active
    if (level >= 8 && statusRounds.ironSkin === 0 && hpPct < 0.55) {
      return { ...base, type: 'skill', skillId: 'iron_skin', skipPlayerAttack: true,
               ironSkinBonus: 30, incomingDamageReduction: base.incomingDamageReduction }
    }
    // Battle Cry: 15mp, use round 1 vs any enemy if mana allows and no active BC
    if (level >= 5 && mana >= 15 && statusRounds.battleCry === 0 && round === 1) {
      return { ...base, type: 'skill', skillId: 'battle_cry', skipPlayerAttack: true,
               incomingDamageReduction: 0.35, ironSkinBonus: statusRounds.ironSkin > 0 ? 30 : undefined }
    }
    // Whirlwind: 28mp, use when enemy > 60% HP to maximize DPS
    if (level >= 12 && mana >= 28 && mHpPct > 0.60) {
      return { ...base, type: 'skill', skillId: 'whirlwind', attackTwice: true }
    }
    // Power Strike: 12mp, use vs high-HP enemy (burst finisher)
    if (level >= 1 && mana >= 12 && mHpPct > 0.40) {
      return { ...base, type: 'skill', skillId: 'power_strike', damageMultiplier: 2.0 }
    }
  }

  // ── ROGUE ──────────────────────────────────────────────────────────────────
  if (classId === 'rogue') {
    // Shadow Step: 10mp — use when HP critically low (skip retaliation)
    if (level >= 5 && mana >= 10 && hpPct < 0.30) {
      return { ...base, type: 'skill', skillId: 'shadow_step', skipMonsterAttack: true }
    }
    // Smoke Bomb: free, use when HP < 45% and smoke not active
    if (level >= 12 && statusRounds.smoke === 0 && hpPct < 0.45) {
      return { ...base, type: 'skill', skillId: 'smoke_bomb', skipPlayerAttack: true,
               smokeScreenActive: true }
    }
    // Backstab: 10mp, open every fight (guaranteed 3× crit — massive opener)
    if (level >= 1 && mana >= 10 && round === 1) {
      return { ...base, type: 'skill', skillId: 'backstab', guaranteedCrit: true, critMultiplier: 3.0 }
    }
    // Rapid Strike: 14mp, follow-up burst rounds 2-3
    if (level >= 8 && mana >= 14 && round <= 3) {
      return { ...base, type: 'skill', skillId: 'rapid_strike', attackCount: 3, perHitMultiplier: 0.7 }
    }
  }

  // ── SORCERER ───────────────────────────────────────────────────────────────
  if (classId === 'sorcerer') {
    // Mana Shield: free, enable if HP < 50% and shield not active
    if (level >= 14 && statusRounds.manaShield === 0 && hpPct < 0.50) {
      return { ...base, type: 'skill', skillId: 'mana_shield', skipPlayerAttack: true,
               manaShieldActive: true }
    }
    // Meditate: free, use when HP < 35% (conserve turns — only worth it when near-death)
    if (level >= 0 && hpPct < 0.35) {
      return { ...base, type: 'skill', skillId: 'meditate', healSelf: 15, skipPlayerAttack: true }
    }
    // Chain Lightning: 25mp, highest DPS at high mana
    if (level >= 10 && mana >= 25) {
      return { ...base, type: 'skill', skillId: 'chain_lightning', lightningSpellMult: 2.0 }
    }
    // Ice Blast: 20mp, deals cold + freeze
    if (level >= 6 && mana >= 20) {
      return { ...base, type: 'skill', skillId: 'ice_blast', coldSpellMult: 2.5, hardChill: true }
    }
    // Fireball: 28mp, primary damage spell (unlocks at level 4)
    if (level >= 4 && mana >= 28) {
      return { ...base, type: 'skill', skillId: 'fireball', fireSpellMult: 3.0 }
    }
  }

  // Fallback: basic attack
  return { ...base, type: 'attack' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Single combat simulation (with skill strategy + potion usage)
// ─────────────────────────────────────────────────────────────────────────────

interface CombatState {
  hp:      number
  mana:    number
  potions: number
  statusRounds: { battleCry: number; ironSkin: number; smoke: number; manaShield: number }
}

interface CombatOutcome {
  survived:   boolean
  hpAfter:    number
  manaAfter:  number
  potionsUsed: number
}

function simulateFight(
  rng: Rng,
  classId: ClassId,
  level: number,
  playerStats: BuiltStats,
  state: CombatState,
  monster: MonsterInstance,
  useSkills: boolean,
): CombatOutcome {
  const MAX = 50
  let hp      = state.hp
  let mana    = state.mana
  let potions = state.potions
  let potionsUsed = 0
  let mHp     = monster.maxHp
  const sr    = { ...state.statusRounds }

  for (let round = 1; round <= MAX; round++) {
    // Use HP potion before acting if below 50% hp and potions remain
    if (hp / playerStats.maxHp < 0.50 && potions > 0) {
      hp = Math.min(playerStats.maxHp, hp + 30)
      potions--
      potionsUsed++
    }

    // Choose action
    const action: CombatAction = useSkills
      ? chooseAction(classId, level, mana, hp, playerStats.maxHp, mHp, monster.maxHp, round, sr)
      : {
          type: 'attack',
          incomingDamageReduction: sr.battleCry  > 0 ? 0.35 : undefined,
          ironSkinBonus:           sr.ironSkin   > 0 ? 30   : undefined,
          smokeScreenActive:       sr.smoke      > 0,
          manaShieldActive:        sr.manaShield > 0,
        }

    // Deduct mana cost for skills
    const manaCosts: Partial<Record<SkillId, number>> = {
      power_strike: 12, battle_cry: 15, whirlwind: 28,
      backstab: 12, shadow_step: 14, rapid_strike: 14,
      fireball: 28, ice_blast: 20, chain_lightning: 25,
    }
    if (action.type === 'skill' && action.skillId && manaCosts[action.skillId]) {
      mana = Math.max(0, mana - manaCosts[action.skillId])
    }

    // Meditate mana restore (first tick only in sim — regen ticks simplified)
    if (action.skillId === 'meditate') mana = Math.min(playerStats.maxMana, mana + 12)

    const monsterInst: MonsterInstance = { ...monster, currentHp: mHp }
    const { result, newPlayerHp, newMonsterHp } = applyCombatAction(
      rng, action, round, hp, playerStats, monsterInst,
    )

    // Mana Shield absorbs mana
    if (result.manaAbsorbed > 0) mana = Math.max(0, mana - result.manaAbsorbed)

    hp   = newPlayerHp
    mHp  = newMonsterHp

    // Tick status counters
    if (action.skillId === 'battle_cry')  { sr.battleCry  = 2 } else { sr.battleCry  = Math.max(0, sr.battleCry  - 1) }
    if (action.skillId === 'iron_skin')   { sr.ironSkin   = 2 } else { sr.ironSkin   = Math.max(0, sr.ironSkin   - 1) }
    if (action.skillId === 'smoke_bomb')  { sr.smoke      = 2 } else { sr.smoke      = Math.max(0, sr.smoke      - 1) }
    if (action.skillId === 'mana_shield') { sr.manaShield = 2 } else { sr.manaShield = Math.max(0, sr.manaShield - 1) }

    if (result.playerDied) return { survived: false, hpAfter: 0, manaAfter: mana, potionsUsed }
    if (result.monsterDied) break
  }

  return { survived: mHp <= 0, hpAfter: hp, manaAfter: mana, potionsUsed }
}

// ─────────────────────────────────────────────────────────────────────────────
// Floor 1 run simulation
// ─────────────────────────────────────────────────────────────────────────────

interface FloorRunResult {
  completed:     boolean
  hpAtExit:      number
  potionsUsed:   number
  combatsFought: number
  deaths:        number  // always 0 or 1 per run (1 = run failed)
  shrinesUsed:   number
}

/**
 * How far the player explores before finding the exit.
 * 35 tile rolls ≈ realistic partial-floor path on F1.
 * At F1 base rates: ~38% are encounters → ~12 total, ~9 combat.
 */
const ENCOUNTER_TILES = 35

/**
 * Smart flee logic: player evaluates whether to fight based on HP% and tier.
 * Models realistic decision-making (not just "always fight elites").
 *
 *   naked   → fight Normal only (flee everything else — no tools to handle it)
 *   skilled → fight Normal always; fight Elite if HP > 80% (need full resources); flee Rare/Ancient
 *   geared  → fight Normal + Elite (HP > 75%); fight Rare if HP > 80%; flee Ancient
 */
function willingToFight(
  tier: EncounterTier, level: number, useSkills: boolean, hpPct: number,
  isGeared = false,
): boolean {
  if (tier === 'ancient') return false                              // never fight Ancient
  if (tier === 'rare')    return isGeared ? hpPct > 0.80 : (useSkills && level >= 5 && hpPct > 0.85)
  if (tier === 'elite')   return isGeared ? hpPct > 0.75 : (useSkills && hpPct > 0.80)
  if (tier === 'normal')  return true                              // always fight Normal
  return false
}

/** Post-combat recovery: regain small % of max HP after a victory ("catch your breath"). */
const POST_COMBAT_RECOVERY = 0.08  // 8% of max HP restored after each win

function runFloor1(
  seed: number,
  classId: ClassId,
  level: number,
  playerStats: BuiltStats,
  useSkills: boolean,
  isGeared = false,
  floor = 1,
  startPotions = 3,
): FloorRunResult {
  const rng = makeRng(seed)

  let hp      = playerStats.hp
  let mana    = playerStats.maxMana
  let potions = startPotions
  let potionsUsed   = 0
  let combatsFought = 0
  let shrinesUsed   = 0
  const sr = { battleCry: 0, ironSkin: 0, smoke: 0, manaShield: 0 }

  for (let tile = 0; tile < ENCOUNTER_TILES; tile++) {
    const enc = rollEncounter(rng, floor)

    if (enc === EncounterType.Shrine) {
      hp = Math.min(playerStats.maxHp, hp + 25)
      mana = Math.min(playerStats.maxMana, mana + 15)
      shrinesUsed++
      continue
    }

    if (enc === EncounterType.Chest) continue
    if (enc === EncounterType.Empty) continue

    const tierMap: Record<string, EncounterTier> = {
      [EncounterType.Normal]:  'normal',
      [EncounterType.Elite]:   'elite',
      [EncounterType.Rare]:    'rare',
      [EncounterType.Ancient]: 'ancient',
    }
    const tier = tierMap[enc]
    if (!tier) continue

    // FLEE if tier/HP makes fighting a bad idea
    const hpPct = hp / playerStats.maxHp
    if (!willingToFight(tier, level, useSkills, hpPct, isGeared)) continue

    combatsFought++
    const monster = spawnMonster(rng, floor, tier)
    const state: CombatState = { hp, mana, potions, statusRounds: { ...sr } }
    const outcome = simulateFight(rng, classId, level, playerStats, state, monster, useSkills)

    potionsUsed += outcome.potionsUsed
    potions     -= outcome.potionsUsed

    if (!outcome.survived) {
      return { completed: false, hpAtExit: 0, potionsUsed, combatsFought, deaths: 1, shrinesUsed }
    }

    hp   = Math.min(playerStats.maxHp, outcome.hpAfter + Math.round(playerStats.maxHp * POST_COMBAT_RECOVERY))
    mana = outcome.manaAfter
  }

  return { completed: true, hpAtExit: hp, potionsUsed, combatsFought, deaths: 0, shrinesUsed }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario definitions
// ─────────────────────────────────────────────────────────────────────────────

// Realistic F1–F2 gear (what you might have from stash after a few runs)
const WARRIOR_GEAR: GearBonus  = { life: 15, defense: 8, blockChance: 10 }
const ROGUE_GEAR: GearBonus    = { dexterity: 10, critChance: 8, life: 8 }
const SORCERER_GEAR: GearBonus = { spellPower: 12, life: 8, defense: 4 }

interface Scenario {
  classId:   ClassId
  label:     string
  level:     number
  floor:     number
  gear:      GearBonus
  useSkills: boolean
  isGeared:  boolean
}

// Mid-game gear (lvl 10, F3 — better rolls, some magic)
const WARRIOR_GEAR_MID:  GearBonus = { life: 30, defense: 18, blockChance: 20, damage: 5 }
const ROGUE_GEAR_MID:    GearBonus = { dexterity: 18, critChance: 15, life: 15, damage: 5 }
const SORCERER_GEAR_MID: GearBonus = { spellPower: 20, life: 15, defense: 6 }

// Late-game min-max gear (lvl 15, F5 — near best in slot)
const WARRIOR_GEAR_MAX:  GearBonus = { life: 50, defense: 30, blockChance: 35, damage: 10 }
const ROGUE_GEAR_MAX:    GearBonus = { dexterity: 28, critChance: 22, life: 25, damage: 10 }
const SORCERER_GEAR_MAX: GearBonus = { spellPower: 35, life: 25, defense: 10 }

const SCENARIOS: Scenario[] = [
  // ── Warrior ──────────────────────────────────────────────────────────────
  { classId: 'warrior',  label: 'Warrior  naked      (lvl 0,  F1)', level:  0, floor: 1, gear: {},              useSkills: false, isGeared: false },
  { classId: 'warrior',  label: 'Warrior  skilled    (lvl 5,  F1)', level:  5, floor: 1, gear: {},              useSkills: true,  isGeared: false },
  { classId: 'warrior',  label: 'Warrior  geared     (lvl 5,  F1)', level:  5, floor: 1, gear: WARRIOR_GEAR,    useSkills: true,  isGeared: true  },
  { classId: 'warrior',  label: 'Warrior  mid-game   (lvl 10, F3)', level: 10, floor: 3, gear: WARRIOR_GEAR_MID,useSkills: true,  isGeared: true  },
  { classId: 'warrior',  label: 'Warrior  min-maxed  (lvl 15, F5)', level: 15, floor: 5, gear: WARRIOR_GEAR_MAX,useSkills: true,  isGeared: true  },
  // ── Rogue ─────────────────────────────────────────────────────────────────
  { classId: 'rogue',    label: 'Rogue    naked      (lvl 0,  F1)', level:  0, floor: 1, gear: {},              useSkills: false, isGeared: false },
  { classId: 'rogue',    label: 'Rogue    skilled    (lvl 5,  F1)', level:  5, floor: 1, gear: {},              useSkills: true,  isGeared: false },
  { classId: 'rogue',    label: 'Rogue    geared     (lvl 5,  F1)', level:  5, floor: 1, gear: ROGUE_GEAR,      useSkills: true,  isGeared: true  },
  { classId: 'rogue',    label: 'Rogue    mid-game   (lvl 10, F3)', level: 10, floor: 3, gear: ROGUE_GEAR_MID,  useSkills: true,  isGeared: true  },
  { classId: 'rogue',    label: 'Rogue    min-maxed  (lvl 15, F5)', level: 15, floor: 5, gear: ROGUE_GEAR_MAX,  useSkills: true,  isGeared: true  },
  // ── Sorcerer ──────────────────────────────────────────────────────────────
  { classId: 'sorcerer', label: 'Sorcerer naked      (lvl 0,  F1)', level:  0, floor: 1, gear: {},              useSkills: false, isGeared: false },
  { classId: 'sorcerer', label: 'Sorcerer skilled    (lvl 5,  F1)', level:  5, floor: 1, gear: {},              useSkills: true,  isGeared: false },
  { classId: 'sorcerer', label: 'Sorcerer geared     (lvl 5,  F1)', level:  5, floor: 1, gear: SORCERER_GEAR,   useSkills: true,  isGeared: true  },
  { classId: 'sorcerer', label: 'Sorcerer mid-game   (lvl 10, F3)', level: 10, floor: 3, gear: SORCERER_GEAR_MID,useSkills: true, isGeared: true  },
  { classId: 'sorcerer', label: 'Sorcerer min-maxed  (lvl 15, F5)', level: 15, floor: 5, gear: SORCERER_GEAR_MAX,useSkills: true, isGeared: true  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Run and report
// ─────────────────────────────────────────────────────────────────────────────

const N    = 2000
const BASE = 0xc0de_f001

function col(s: string | number, w: number, right = false): string {
  const str = String(s)
  return right ? str.padStart(w) : str.padEnd(w)
}

console.log('\n' + '═'.repeat(96))
console.log('  CLASS BALANCE — FLOOR 1 COMPLETION')
console.log('  T1 · 35 explored tiles · 3 HP potions · +8% HP post-combat recovery · smart flee · N=2000')
console.log('═'.repeat(96))
console.log(
  col('Scenario', 34) +
  col('Done%',  7, true) +
  col('Runs/1st',9, true) +
  col('Combats',9, true) +
  col('HP exit', 9, true) +
  col('Potions', 9, true) +
  col('Shrines', 9, true) +
  '  Notes'
)
console.log('─'.repeat(96))

let prevClass = ''
for (const sc of SCENARIOS) {
  if (prevClass && prevClass !== sc.classId) console.log()
  prevClass = sc.classId

  const stats = buildStats(sc.classId, sc.level, sc.floor, sc.gear)

  let completed = 0
  let totalCombats = 0, totalHp = 0, totalPots = 0, totalShrines = 0

  for (let i = 0; i < N; i++) {
    const result = runFloor1(BASE + i * 6271 + sc.level * 1000, sc.classId, sc.level, stats, sc.useSkills, sc.isGeared, sc.floor, 3)
    if (result.completed) {
      completed++
      totalHp += result.hpAtExit
    }
    totalCombats += result.combatsFought
    totalPots    += result.potionsUsed
    totalShrines += result.shrinesUsed
  }

  const donePct    = (completed / N * 100).toFixed(1)
  const runsNeeded = completed > 0 ? (N / completed).toFixed(1) : '>99'
  const avgCombats = (totalCombats / N).toFixed(1)
  const avgHp      = completed > 0 ? (totalHp / completed).toFixed(0) : '—'
  const avgPots    = (totalPots / N).toFixed(2)
  const avgShrines = (totalShrines / N).toFixed(2)

  // Notes
  const notes: string[] = []
  const pct = completed / N
  if (pct < 0.30)       notes.push('❌ very hard')
  else if (pct < 0.50)  notes.push('⚠ hard')
  else if (pct < 0.70)  notes.push('challenging')
  else if (pct < 0.85)  notes.push('✓ fair')
  else if (pct < 0.95)  notes.push('✓✓ comfortable')
  else                  notes.push('😴 trivial')

  const hpPct = completed > 0 ? (totalHp / completed) / stats.maxHp : 0
  if (hpPct < 0.25 && completed > 0) notes.push('exits on fumes')

  console.log(
    col(sc.label, 34) +
    col(donePct + '%', 7, true) +
    col(runsNeeded,    9, true) +
    col(avgCombats,    9, true) +
    col(avgHp,         9, true) +
    col(avgPots,       9, true) +
    col(avgShrines,    9, true) +
    '  ' + notes.join(', ')
  )
}

console.log('\n' + '─'.repeat(96))
console.log('  Runs/1st = expected runs to complete floor 1 once (1 / completion_rate)')
console.log('  Combats  = avg fights per run attempt (across wins+losses)')
console.log('  HP exit  = avg HP% at floor exit (wins only)')
console.log('─'.repeat(96))

// ─────────────────────────────────────────────────────────────────────────────
// Per-combat breakdown — what encounter types kill naked players most?
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(60))
console.log('  KILL BREAKDOWN — where do naked players die on F1?')
console.log('═'.repeat(60))

for (const classId of ['warrior', 'rogue', 'sorcerer'] as ClassId[]) {
  const stats = buildStats(classId, 0, 1, {})
  let deaths = 0
  const killsByTier: Record<string, number> = { normal: 0, elite: 0, rare: 0, ancient: 0 }
  const deathAtCombat: number[] = []

  for (let i = 0; i < N; i++) {
    const rng = makeRng(BASE + i * 6271)
    let hp = stats.hp, mana = stats.maxMana, potions = 3
    const sr = { battleCry: 0, ironSkin: 0, smoke: 0, manaShield: 0 }
    let combatN = 0

    for (let tile = 0; tile < ENCOUNTER_TILES; tile++) {
      const enc = rollEncounter(rng, 1)
      if (enc === EncounterType.Shrine) { hp = Math.min(stats.maxHp, hp + 25); continue }
      if (enc === EncounterType.Empty || enc === EncounterType.Chest) continue

      const tierMap: Record<string, EncounterTier> = {
        [EncounterType.Normal]: 'normal', [EncounterType.Elite]: 'elite',
        [EncounterType.Rare]: 'rare',     [EncounterType.Ancient]: 'ancient',
      }
      const tier = tierMap[enc]; if (!tier) continue
      // naked flees everything except normal
      if (!willingToFight(tier, 0, false, hp / stats.maxHp)) continue

      combatN++
      const monster = spawnMonster(rng, 1, tier)
      const state: CombatState = { hp, mana, potions, statusRounds: { ...sr } }
      const outcome = simulateFight(rng, classId, 0, stats, state, monster, false)

      potions -= outcome.potionsUsed
      if (!outcome.survived) {
        deaths++
        killsByTier[tier] = (killsByTier[tier] ?? 0) + 1
        deathAtCombat.push(combatN)
        break
      }
      hp = outcome.hpAfter; mana = outcome.manaAfter
    }
  }

  const survivedN = N - deaths
  console.log(`\n  ${classId.toUpperCase()} naked — died in ${deaths}/${N} runs (${(deaths/N*100).toFixed(1)}%)`)
  if (deaths > 0) {
    for (const [tier, cnt] of Object.entries(killsByTier)) {
      if (cnt === 0) continue
      console.log(`    killed by ${tier.padEnd(8)} ${cnt.toString().padStart(4)}x  (${(cnt/deaths*100).toFixed(0)}% of deaths)`)
    }
    const avgDeathCombat = deathAtCombat.length > 0 ? (deathAtCombat.reduce((a,b)=>a+b,0)/deathAtCombat.length).toFixed(1) : '—'
    console.log(`    avg death at combat #${avgDeathCombat} of the run`)
  }
}

console.log('\n' + '─'.repeat(60))

// ─────────────────────────────────────────────────────────────────────────────
// Tuning lab — what recovery + potion combo hits target balance?
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(80))
console.log('  TUNING LAB — "naked warrior" floor 1 completion vs recovery + potions')
console.log('  Target: naked ~40-50% (≤2.5 runs), skilled ~60% (≤1.7 runs)')
console.log('═'.repeat(80))
console.log(col('Recovery%', 12) + col('Potions', 10) + col('Warrior naked', 17) + col('Warrior skill', 17) + col('Rogue naked', 15) + col('Sorc naked', 15))
console.log('─'.repeat(80))

const BASE2 = 0xabcd_ef01
for (const recovery of [0.00, 0.08, 0.12, 0.15, 0.20]) {
  for (const pots of [3, 4, 5]) {
    const row: string[] = [
      col(`+${(recovery*100).toFixed(0)}%`, 12),
      col(`${pots} pots`, 10),
    ]
    for (const [cls, lvl, skills] of [
      ['warrior', 0, false], ['warrior', 5, true], ['rogue', 0, false], ['sorcerer', 0, false]
    ] as [ClassId, number, boolean][]) {
      const stats = buildStats(cls, lvl, 1, {})
      let ok = 0
      for (let i = 0; i < 1000; i++) {
        const rng2 = makeRng(BASE2 + i * 4999)
        let hp2 = stats.hp, mana2 = stats.maxMana, pots2 = pots
        const sr2 = { battleCry: 0, ironSkin: 0, smoke: 0, manaShield: 0 }
        let survived = true

        for (let tile = 0; tile < ENCOUNTER_TILES; tile++) {
          const enc = rollEncounter(rng2, 1)
          if (enc === EncounterType.Shrine) { hp2 = Math.min(stats.maxHp, hp2 + 25); continue }
          if (enc === EncounterType.Empty || enc === EncounterType.Chest) continue
          const tm2: Record<string, EncounterTier> = {
            [EncounterType.Normal]: 'normal', [EncounterType.Elite]: 'elite',
            [EncounterType.Rare]: 'rare',     [EncounterType.Ancient]: 'ancient',
          }
          const t2 = tm2[enc]; if (!t2) continue
          if (!willingToFight(t2, lvl, skills, hp2 / stats.maxHp, false)) continue

          const mon = spawnMonster(rng2, 1, t2)
          const st2: CombatState = { hp: hp2, mana: mana2, potions: pots2, statusRounds: { ...sr2 } }
          const out = simulateFight(rng2, cls, lvl, stats, st2, mon, skills)
          pots2 -= out.potionsUsed
          if (!out.survived) { survived = false; break }
          hp2  = Math.min(stats.maxHp, out.hpAfter + Math.round(stats.maxHp * recovery))
          mana2 = out.manaAfter
        }
        if (survived) ok++
      }
      const pct = (ok / 10).toFixed(0)
      const flag = ok < 300 ? '❌' : ok < 450 ? '⚠' : ok < 650 ? '✓' : '✓✓'
      row.push(col(`${pct}% ${flag}`, cls === 'sorcerer' ? 15 : 17))
    }
    console.log(row.join(''))
  }
  console.log()
}

console.log('─'.repeat(80))
console.log('  ❌ <30%  ⚠ 30-45%  ✓ 45-65%  ✓✓ 65%+')
console.log()

// ─────────────────────────────────────────────────────────────────────────────
// Proposed fix — test specific config: 4 pots, 15% recovery, reduced mana costs
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(80))
console.log('  PROPOSED FIXES — 4 pots · +15% post-combat HP · cheaper physical skills')
console.log('  Power Strike: 20→12  Battle Cry: stays 15 (skipAttack cost)  Backstab: 15→10  Rapid Strike: 20→14')
console.log('  +5 mana after each combat win')
console.log('═'.repeat(80))

const PROPOSED_MANA: Partial<Record<SkillId, number>> = {
  power_strike: 12, battle_cry: 15, whirlwind: 20,   // Battle Cry stays 15 — costs a turn
  backstab: 12, shadow_step: 14, rapid_strike: 14,
  fireball: 28, ice_blast: 20, chain_lightning: 25,
}
const PROPOSED_RECOVERY = 0.15
const PROPOSED_POTS     = 4
const PROPOSED_MANA_WIN = 5  // mana restored on kill

console.log(col('Scenario', 34) + col('Done%', 7, true) + col('Runs/1st', 9, true) + col('Combats', 9, true) + col('HP exit', 9, true) + '  Notes')
console.log('─'.repeat(80))

let prevCls2 = ''
for (const sc of SCENARIOS) {
  if (prevCls2 && prevCls2 !== sc.classId) console.log()
  prevCls2 = sc.classId

  const stats = buildStats(sc.classId, sc.level, sc.floor, sc.gear)
  let completed = 0, totHp = 0, totCombats = 0

  for (let i = 0; i < N; i++) {
    const rng3 = makeRng(BASE + i * 6271 + sc.level * 1000)
    let hp3 = stats.hp, mana3 = stats.maxMana, pots3 = PROPOSED_POTS
    const sr3 = { battleCry: 0, ironSkin: 0, smoke: 0, manaShield: 0 }
    let survived3 = true, fights3 = 0

    for (let tile = 0; tile < ENCOUNTER_TILES; tile++) {
      const enc = rollEncounter(rng3, sc.floor)
      if (enc === EncounterType.Shrine) { hp3 = Math.min(stats.maxHp, hp3 + 25); mana3 = Math.min(stats.maxMana, mana3+15); continue }
      if (enc === EncounterType.Empty || enc === EncounterType.Chest) continue
      const tm3: Record<string, EncounterTier> = {
        [EncounterType.Normal]:'normal',[EncounterType.Elite]:'elite',
        [EncounterType.Rare]:'rare',[EncounterType.Ancient]:'ancient',
      }
      const t3 = tm3[enc]; if (!t3) continue
      if (!willingToFight(t3, sc.level, sc.useSkills, hp3 / stats.maxHp, sc.isGeared)) continue

      fights3++
      const mon3 = spawnMonster(rng3, sc.floor, t3)

      // Simulate fight with proposed mana costs
      let fhp = hp3, fmana = mana3, fpots = pots3
      const fsr = { ...sr3 }
      let fSurvived = false

      for (let r = 1; r <= 50; r++) {
        if (fhp / stats.maxHp < 0.50 && fpots > 0) { fhp = Math.min(stats.maxHp, fhp+30); fpots--; }

        const action = sc.useSkills
          ? chooseAction(sc.classId, sc.level, fmana, fhp, stats.maxHp, mon3.currentHp ?? mon3.maxHp, mon3.maxHp, r, fsr)
          : { type: 'attack' as const,
              incomingDamageReduction: fsr.battleCry>0 ? 0.35:undefined,
              ironSkinBonus: fsr.ironSkin>0 ? 30:undefined,
              smokeScreenActive: fsr.smoke>0,
              manaShieldActive: fsr.manaShield>0 }

        if (action.type==='skill' && action.skillId && PROPOSED_MANA[action.skillId]) {
          fmana = Math.max(0, fmana - PROPOSED_MANA[action.skillId])
        }
        if (action.skillId === 'meditate') fmana = Math.min(stats.maxMana, fmana+12)

        const monInst3: MonsterInstance = { ...mon3, currentHp: mon3.currentHp ?? mon3.maxHp }
        // track monster HP manually
        const { result, newPlayerHp, newMonsterHp } = applyCombatAction(rng3, action, r, fhp, stats, monInst3)
        if (result.manaAbsorbed > 0) fmana = Math.max(0, fmana - result.manaAbsorbed)
        fhp = newPlayerHp
        mon3.currentHp = newMonsterHp

        if (action.skillId==='battle_cry')  fsr.battleCry=2;  else fsr.battleCry=Math.max(0,fsr.battleCry-1)
        if (action.skillId==='iron_skin')   fsr.ironSkin=2;   else fsr.ironSkin=Math.max(0,fsr.ironSkin-1)
        if (action.skillId==='smoke_bomb')  fsr.smoke=2;      else fsr.smoke=Math.max(0,fsr.smoke-1)
        if (action.skillId==='mana_shield') fsr.manaShield=2; else fsr.manaShield=Math.max(0,fsr.manaShield-1)

        if (result.playerDied) break
        if (result.monsterDied) { fSurvived = true; break }
      }

      pots3 -= (fpots < pots3 ? pots3 - fpots : 0)
      pots3  = fpots
      if (!fSurvived) { survived3 = false; break }
      hp3  = Math.min(stats.maxHp, fhp + Math.round(stats.maxHp * PROPOSED_RECOVERY))
      mana3 = Math.min(stats.maxMana, fmana + PROPOSED_MANA_WIN)
    }

    if (survived3) { completed++; totHp += hp3 }
    totCombats += fights3
  }

  const pct2 = (completed/N*100).toFixed(1)
  const runs2 = completed > 0 ? (N/completed).toFixed(1) : '>99'
  const hp2  = completed > 0 ? (totHp/completed).toFixed(0) : '—'
  const comb2 = (totCombats/N).toFixed(1)
  const p = completed/N
  const flag2 = p<0.30?'❌':p<0.45?'⚠':p<0.65?'✓':'✓✓'

  console.log(col(sc.label, 34) + col(pct2+'%',7,true) + col(runs2,9,true) + col(comb2,9,true) + col(hp2,9,true) + `  ${flag2}`)
}
console.log('\n' + '─'.repeat(80))
console.log()
