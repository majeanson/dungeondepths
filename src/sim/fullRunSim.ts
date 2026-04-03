/**
 * fullRunSim — Comprehensive balance harness.
 *
 * Simulates N complete floor runs per class with:
 *   - Realistic gear accumulation (equip best found per slot)
 *   - Gem socketing: gems found are inserted into equipped gear open sockets
 *   - Optimal skill AI per class (level-gated skills, cooldowns, active effects)
 *   - Real-player imperfection: per-run sloppyRate 2–8% (occasional basic attacks)
 *   - Panic potions: HP < 20% → use potion immediately regardless of threshold
 *   - Boss mechanic enforcement: every boss gets enrage + regen
 *   - HP/mana potion usage, between-fight state carry-over
 *   - Full loot pipeline + XP → level progression
 *
 * Reports: survival, fight duration, HP budget, loot, skill usage,
 *          mana pressure, boss kill rate, level progression, gem sockets.
 *
 * bun run src/sim/fullRunSim.ts [runs=2000] [floors=10]
 */

import { makeRng, roll, type Rng } from '../engine/rng'
import { rollEncounter, EncounterType, floorPacingWeights, isBossFloor, isFullRejuvFloor } from '../engine/encounter'
import { spawnMonster, applyTierScaling, type EncounterTier, type MonsterInstance, type BossMechanic } from '../engine/monsters'
import { applyCombatAction, type PlayerCombatStats, type CombatAction, type ActiveEffects } from '../engine/combat'
import { rollLoot, type Item } from '../engine/loot'
import { buildPlayerStats, maxManaForLevel, levelFromXp } from '../engine/stats'
import { getGemBonus } from '../data/runewords'
import type { ClassId } from '../data/classes'
import { SKILLS } from '../data/skills'
import type { EquipSlot } from '../engine/inventory'

// ─── Config ──────────────────────────────────────────────────────────────────
const RUNS_PER_CLASS   = parseInt(process.argv[2] ?? '2000')
/** When imported as a module (journey sim), always use 10 floors. */
const FLOOR_COUNT      = import.meta.main ? parseInt(process.argv[3] ?? '10') : 10
/**
 * Difficulty tier for the sim run.
 *   1 = Normal    (default)
 *   2 = Nightmare (+40% HP/+28% dmg, tier-2 monster pool)
 *   3 = Hell      (+80% HP/+56% dmg, tier-2+3 monster pool)
 * bun run fullRunSim.ts [runs] [floors] [diffTier]
 */
const SIM_DIFF_TIER    = import.meta.main ? Math.min(3, Math.max(1, parseInt(process.argv[4] ?? '1'))) as 1|2|3 : 1
const DIFF_LABEL       = ['', 'Normal', 'Nightmare', 'Hell'][SIM_DIFF_TIER]
const TILES_PER_FLOOR  = 28    // realistic path exploration per floor (~7-9 fights)
const STARTING_POTIONS = 5
const POTION_USE_HP_PCT  = 0.45  // normal potion threshold
const PANIC_POT_HP_PCT   = 0.20  // panic: use immediately, bypass threshold
const MANA_WIN_RESTORE   = 10    // mana restored after each combat win (passive)
const MANA_POT_THRESHOLD = 0.35  // use mana potion between fights when mana% < this

// ─── Types ────────────────────────────────────────────────────────────────────
type QualKey = 'normal' | 'magic' | 'rare' | 'unique' | 'rune' | 'gem'

interface RunResult {
  survived:          boolean
  floorReached:      number
  level:             number
  itemsFound:        Record<QualKey, number>
  totalRounds:       number
  totalCombats:      number
  floorHpPct:        number[]   // HP% entering each floor
  floorAvgRounds:    number[]   // avg rounds per combat per floor
  skillCount:        Record<string, number>
  manaStarved:       number     // fights where preferred skill was unaffordable
  potionsUsed:       number
  potionsFound:      number     // HP potions found during run (excludes starting 5)
  bossKills:         number     // bosses killed
  bossAttempts:      number     // boss fights entered
  gemsSocketed:      number     // gems inserted into gear
  levelAtFloor:      number[]   // level entering each floor
  floorDmgDealt:     number[]   // avg player dmg per round per floor
  floorDmgReceived:  number[]   // avg monster dmg per round per floor
  floorMonsterHp:    number[]   // avg monster starting HP per floor
  earnedXp:          number     // total XP accumulated this run
  endEquipped:       Partial<Record<EquipSlot, Item>>  // gear state at end of run
  gearScoreAtFloor:  number[]   // total equipped gear score entering each floor
  slotsFilled:       number[]   // count of filled equip slots entering each floor
  /** Only present when survived===false. Tier/floor/isBoss of the fatal encounter. */
  deathCause?:       { tier: EncounterTier; floor: number; isBoss: boolean }
  /** HP% entering the fatal fight (only present when survived===false). */
  hpPctAtDeath?:     number
  /** Gems/runes remaining in stash at run end (unsocketed). Carry to next run via RunOptions.startingGemStash. */
  endGemStash:       Map<string, number>
}

// ─── Gem stash + socketing ────────────────────────────────────────────────────
type GemStash = Map<string, number>  // gemBaseId → count

/** Best gem to socket per class per item slot group. Returns gemBaseId prefix (e.g. 'gem_emerald_chipped'). */
function bestGemForClass(gemStash: GemStash, slotGroup: string, cls: ClassId): string | null {
  // Priority order per class and slot
  const candidates: string[][] = {
    warrior: {
      weapon:  [['gem_emerald'], ['gem_diamond']],
      armor:   [['gem_emerald'], ['gem_ruby']],
      offhand: [['gem_emerald'], ['gem_sapphire']],
      boots:   [['gem_ruby'],   ['gem_diamond']],
      ring:    [], amulet: [], gloves: [], belt: [], circlet: [], helmet: [],
    }[slotGroup] ?? [],
    rogue: {
      weapon:  [['gem_emerald'], ['gem_topaz'], ['gem_diamond']],
      armor:   [['gem_emerald'], ['gem_topaz']],
      offhand: [['gem_emerald'], ['gem_sapphire']],
      boots:   [['gem_emerald'], ['gem_diamond']],
      ring:    [], amulet: [], gloves: [], belt: [], circlet: [], helmet: [],
    }[slotGroup] ?? [],
    sorcerer: {
      weapon:  [['gem_diamond'], ['gem_topaz']],
      armor:   [['gem_sapphire'], ['gem_emerald']],
      offhand: [['gem_sapphire'], ['gem_diamond']],
      boots:   [['gem_diamond'], ['gem_sapphire']],
      ring:    [], amulet: [], gloves: [], belt: [], circlet: [], helmet: [],
    }[slotGroup] ?? [],
  }[cls] ?? []

  // For each candidate gem type, try best tier first (radiant → perfect → flawed → chipped)
  const tiers = ['radiant', 'perfect', 'flawed', 'chipped']
  for (const [gemPrefix] of candidates) {
    for (const tier of tiers) {
      const id = `${gemPrefix}_${tier}`
      if ((gemStash.get(id) ?? 0) > 0) return id
    }
  }
  return null
}

function slotToGroup(slot: string): string {
  if (slot === 'weapon')  return 'weapon'
  if (slot === 'offhand') return 'offhand'
  if (['helmet', 'chest', 'gloves', 'legs', 'circlet'].includes(slot)) return 'armor'
  if (slot === 'boots')   return 'boots'
  return ''
}

/** Try to socket best available gems into equipped gear. Mutates equipped + stash. */
function trySocketGems(
  equipped: Partial<Record<EquipSlot, Item>>,
  gemStash: GemStash,
  cls: ClassId,
): number {
  let socketed = 0
  for (const [eqSlot, item] of Object.entries(equipped) as [EquipSlot, Item][]) {
    if (!item) continue
    // Count gems already in this item
    const gemsInserted = item.insertedRunes.filter(r => r.startsWith('gem_')).length
    const openGemSlots = item.sockets - gemsInserted
    if (openGemSlots <= 0) continue

    const group = slotToGroup(item.slot)
    if (!group) continue
    const gemId = bestGemForClass(gemStash, group, cls)
    if (!gemId) continue

    // Apply gem bonus to item effectiveStats directly
    const bonus = getGemBonus(gemId, item.slot)
    if (Object.keys(bonus).length === 0) continue

    const newStats = { ...item.effectiveStats }
    for (const [k, v] of Object.entries(bonus)) {
      newStats[k] = (newStats[k] ?? 0) + v
    }
    equipped[eqSlot] = { ...item, insertedRunes: [...item.insertedRunes, gemId], effectiveStats: newStats }
    gemStash.set(gemId, (gemStash.get(gemId) ?? 1) - 1)
    socketed++
  }
  return socketed
}

// ─── Gear scoring ─────────────────────────────────────────────────────────────
export function scoreItem(item: Item, classId: ClassId): number {
  const s = item.effectiveStats
  switch (classId) {
    case 'warrior':
      return (s.damage      ?? 0) * 2.5 + (s.defense  ?? 0) * 1.5
           + (s.armor       ?? 0) * 1.5 + (s.life     ?? 0) * 1.0
           + (s.blockChance ?? 0) * 0.8 + (s.critChance ?? 0) * 0.5
    case 'rogue':
      return (s.damage      ?? 0) * 3.0 + (s.critChance  ?? 0) * 2.5
           + (s.dexterity   ?? 0) * 1.5 + (s.life        ?? 0) * 0.5
           + (s.attackSpeed ?? 0) * 0.3
    case 'sorcerer':
      return (s.spellPower  ?? 0) * 4.0 + (s.mana   ?? 0) * 0.4
           + (s.life        ?? 0) * 0.5 + (s.defense ?? 0) * 0.3
  }
}

const SLOT_MAP: Partial<Record<string, EquipSlot>> = {
  weapon: 'weapon', offhand: 'offhand', helmet: 'helmet',
  chest: 'chest',   gloves: 'gloves',   legs: 'legs',
  boots: 'boots',   ring: 'ring1',      amulet: 'amulet',
  belt: 'belt',     circlet: 'circlet',
}

// ─── Active effect tracking ────────────────────────────────────────────────────
interface FightFx extends ActiveEffects {
  battleCryLeft: number
  ironSkinLeft:  number
  smokeLeft:     number
  shieldLeft:    number
  meditateLeft:  number
  ironSkinCd:    number
  smokeBombCd:   number
}

function freshFx(): FightFx {
  return {
    dmgReduction: undefined, ironBonus: undefined,
    smokeActive: false, shieldActive: false,
    battleCryLeft: 0, ironSkinLeft: 0, smokeLeft: 0, shieldLeft: 0,
    meditateLeft: 0, ironSkinCd: 0, smokeBombCd: 0,
  }
}

function tickFx(fx: FightFx): void {
  if (fx.battleCryLeft > 0 && --fx.battleCryLeft === 0) fx.dmgReduction = undefined
  if (fx.ironSkinLeft  > 0 && --fx.ironSkinLeft  === 0) fx.ironBonus    = undefined
  if (fx.smokeLeft     > 0 && --fx.smokeLeft     === 0) fx.smokeActive  = false
  if (fx.shieldLeft    > 0 && --fx.shieldLeft    === 0) fx.shieldActive = false
  if (fx.ironSkinCd  > 0) fx.ironSkinCd--
  if (fx.smokeBombCd > 0) fx.smokeBombCd--
}

function hasSkill(id: string, cls: ClassId, level: number): boolean {
  const def = SKILLS.find(s => s.id === id && s.classId === cls)
  return !!def && level >= def.levelRequired
}

function encToTier(enc: EncounterType): EncounterTier | null {
  if (enc === EncounterType.Normal)  return 'normal'
  if (enc === EncounterType.Elite)   return 'elite'
  if (enc === EncounterType.Rare)    return 'rare'
  if (enc === EncounterType.Ancient) return 'ancient'
  return null
}

// ─── Class skill AIs ──────────────────────────────────────────────────────────
interface ActionChoice { action: CombatAction; manaCost: number; wantedButAfford: boolean }

/**
 * sloppyRate: probability 0–1 that the player uses a basic attack this round
 * instead of their optimal skill. Simulates learning curve / hesitation.
 */
function maybeSloppy(rng: Rng, sloppyRate: number, base: Partial<CombatAction>): ActionChoice | null {
  if (rng() < sloppyRate) {
    return { action: { type: 'attack', incomingDamageReduction: base.incomingDamageReduction, ironSkinBonus: undefined, smokeScreenActive: false, manaShieldActive: false }, manaCost: 0, wantedButAfford: false }
  }
  return null
}

function pickWarriorAction(
  rng: Rng, sloppyRate: number,
  round: number, hpPct: number, mana: number,
  level: number, fx: FightFx, monHpPct: number,
  defSkipRate = 0,
): ActionChoice {
  const base = { incomingDamageReduction: fx.dmgReduction, ironSkinBonus: fx.ironBonus, smokeScreenActive: false, manaShieldActive: false }

  // Defensive skills: beginner may not know to use them (defSkipRate)
  if (hpPct < 0.55 && fx.ironSkinCd === 0 && hasSkill('iron_skin', 'warrior', level) && rng() > defSkipRate) {
    fx.ironSkinCd = 3; fx.ironSkinLeft = 2; fx.ironBonus = 30
    return { action: { type: 'skill', skillId: 'iron_skin', skipPlayerAttack: true, ...base, ironSkinBonus: 30 }, manaCost: 0, wantedButAfford: false }
  }
  if (hpPct < 0.70 && fx.battleCryLeft === 0 && hasSkill('battle_cry', 'warrior', level) && rng() > defSkipRate) {
    if (mana >= 12) {
      fx.battleCryLeft = 2; fx.dmgReduction = 0.35
      return { action: { type: 'skill', skillId: 'battle_cry', ...base, incomingDamageReduction: 0.35 }, manaCost: 12, wantedButAfford: false }
    }
    return { action: { type: 'attack', ...base }, manaCost: 0, wantedButAfford: true }
  }

  // Sloppy play: occasionally just attack
  const sloppy = maybeSloppy(rng, sloppyRate, base)
  if (sloppy) return sloppy

  if (hasSkill('whirlwind', 'warrior', level) && monHpPct > 0.30) {
    if (mana >= 14) return { action: { type: 'skill', skillId: 'whirlwind', attackTwice: true, ...base }, manaCost: 14, wantedButAfford: false }
    return { action: { type: 'attack', ...base }, manaCost: 0, wantedButAfford: true }
  }
  if (hasSkill('power_strike', 'warrior', level)) {
    if (mana >= 8) return { action: { type: 'skill', skillId: 'power_strike', damageMultiplier: 2.0, ...base }, manaCost: 8, wantedButAfford: false }
    return { action: { type: 'attack', ...base }, manaCost: 0, wantedButAfford: true }
  }
  return { action: { type: 'attack', ...base }, manaCost: 0, wantedButAfford: false }
}

function pickRogueAction(
  rng: Rng, sloppyRate: number,
  round: number, hpPct: number, mana: number,
  level: number, fx: FightFx, monHpPct: number, ps: PlayerCombatStats,
  defSkipRate = 0,
): ActionChoice {
  const base = { incomingDamageReduction: fx.dmgReduction, ironSkinBonus: undefined as undefined, smokeScreenActive: fx.smokeActive, manaShieldActive: false }
  const boost = ps.skillBoostRogue ?? 0

  // Smoke bomb: use proactively below 65% HP — pure defensive CD, still attacks this round.
  // Cooldown is 2 rounds (was 3). No longer skips attack — falls through to offensive pick.
  if (hpPct < 0.65 && fx.smokeBombCd === 0 && !fx.smokeActive && hasSkill('smoke_bomb', 'rogue', level) && rng() > defSkipRate) {
    fx.smokeBombCd = 2; fx.smokeLeft = 2; fx.smokeActive = true
    // no early return — smoke activates and rogue still attacks this round
  }

  // Sloppy play
  const sloppy = maybeSloppy(rng, sloppyRate, base)
  if (sloppy) return sloppy

  if (round === 1 && hasSkill('backstab', 'rogue', level)) {
    if (mana >= 8) return { action: { type: 'skill', skillId: 'backstab', guaranteedCrit: true, critMultiplier: 2.0 + boost * 0.2, ...base }, manaCost: 8, wantedButAfford: false }
    return { action: { type: 'attack', ...base }, manaCost: 0, wantedButAfford: true }
  }
  if (hpPct < 0.65 && hasSkill('shadow_step', 'rogue', level)) {
    if (mana >= 14) {
      const dr = Math.min(0.80, (fx.dmgReduction ?? 0) + 0.55)
      return { action: { type: 'skill', skillId: 'shadow_step', damageMultiplier: 1.5, incomingDamageReduction: dr, smokeScreenActive: fx.smokeActive, manaShieldActive: false }, manaCost: 14, wantedButAfford: false }
    }
    return { action: { type: 'attack', ...base }, manaCost: 0, wantedButAfford: true }
  }
  if (hasSkill('rapid_strike', 'rogue', level)) {
    if (mana >= 14) return { action: { type: 'skill', skillId: 'rapid_strike', attackCount: 3, perHitMultiplier: 0.6, bonusHitChance: 25, ...base }, manaCost: 14, wantedButAfford: false }
    return { action: { type: 'attack', ...base }, manaCost: 0, wantedButAfford: true }
  }
  if (hasSkill('backstab', 'rogue', level)) {
    if (mana >= 8) return { action: { type: 'skill', skillId: 'backstab', guaranteedCrit: true, critMultiplier: 2.0 + boost * 0.2, ...base }, manaCost: 8, wantedButAfford: false }
    return { action: { type: 'attack', ...base }, manaCost: 0, wantedButAfford: true }
  }
  return { action: { type: 'attack', ...base }, manaCost: 0, wantedButAfford: false }
}

function pickSorcererAction(
  rng: Rng, sloppyRate: number,
  round: number, hpPct: number, mana: number, maxMana: number,
  level: number, fx: FightFx, ps: PlayerCombatStats,
  defSkipRate = 0,
): ActionChoice {
  const base = { incomingDamageReduction: fx.dmgReduction, ironSkinBonus: undefined as undefined, smokeScreenActive: false, manaShieldActive: fx.shieldActive }
  const boost = ps.skillBoostSorcerer ?? 0
  const mPct  = mana / maxMana

  // Meditate and mana_shield: beginner may not know to use them
  if (mPct < 0.15 && hasSkill('meditate', 'sorcerer', level) && rng() > defSkipRate) {
    fx.meditateLeft = 3
    return { action: { type: 'skill', skillId: 'meditate', skipPlayerAttack: true, ...base }, manaCost: 0, wantedButAfford: false }
  }
  // Mana shield: use when below 55% HP and mana is available (>20%). Unlocks at level 10 now.
  // Absorbs 65% of incoming damage as mana — still skips attack (the conversion is the payoff).
  if (hpPct < 0.55 && !fx.shieldActive && mPct > 0.20 && hasSkill('mana_shield', 'sorcerer', level) && rng() > defSkipRate) {
    fx.shieldLeft = 3; fx.shieldActive = true
    return { action: { type: 'skill', skillId: 'mana_shield', skipPlayerAttack: true, ...base, manaShieldActive: true }, manaCost: 0, wantedButAfford: false }
  }

  // Sloppy play
  const sloppy = maybeSloppy(rng, sloppyRate, base)
  if (sloppy) return sloppy

  if (hasSkill('chain_lightning', 'sorcerer', level) && mana >= 25)
    return { action: { type: 'skill', skillId: 'chain_lightning', lightningSpellMult: 2.0, ...base }, manaCost: 25, wantedButAfford: false }
  if (hasSkill('ice_blast', 'sorcerer', level) && mana >= 20)
    return { action: { type: 'skill', skillId: 'ice_blast', coldSpellMult: 2.5, hardChill: true, ...base }, manaCost: 20, wantedButAfford: false }
  if (hasSkill('fireball', 'sorcerer', level) && mana >= 28)
    return { action: { type: 'skill', skillId: 'fireball', fireSpellMult: 3.0 + boost * 0.5, ...base }, manaCost: 28, wantedButAfford: false }
  if (hasSkill('spark', 'sorcerer', level) && mana >= 10)
    return { action: { type: 'skill', skillId: 'spark', lightningSpellMult: 1.5, spellVarianceFlat: 6, ...base }, manaCost: 10, wantedButAfford: false }
  // Out of mana
  if (hasSkill('spark', 'sorcerer', level) || hasSkill('fireball', 'sorcerer', level))
    return { action: { type: 'attack', ...base }, manaCost: 0, wantedButAfford: true }
  return { action: { type: 'attack', ...base }, manaCost: 0, wantedButAfford: false }
}

// ─── Boss spawn with floor-appropriate mechanics ──────────────────────────────
// Early bosses (F1-5): regen only — manageable, needs sustained DPS.
// Late bosses (F6+):   enrage + regen — punishing, needs burst or mitigation.
function spawnBoss(rng: Rng, floor: number, diffTier = 1): MonsterInstance {
  const m = spawnMonster(rng, floor, 'boss', diffTier)
  if (!m.bossMechanics || m.bossMechanics.length === 0) {
    const mechs: BossMechanic[] = floor <= 5 ? ['regen'] : ['enrage', 'regen']
    return { ...m, bossMechanics: mechs, regenRate: 0.015 }
  }
  return m
}

// ─── Core combat loop (one monster fight) ────────────────────────────────────
interface FightResult {
  survived: boolean; hpAfter: number; manaAfter: number
  rounds: number; potUsed: number; starved: boolean
  skillCount: Record<string, number>
  dmgDealt:    number   // total damage player dealt to monster
  dmgReceived: number   // total damage monster dealt to player (before potions)
}

function runFight(
  rng: Rng, cls: ClassId, level: number,
  ps: PlayerCombatStats, maxMana: number,
  hpIn: number, manaIn: number, potions: number,
  monster: MonsterInstance, floor: number,
  sloppyRate: number,
  potionThreshold = POTION_USE_HP_PCT,
  defSkipRate = 0,
): FightResult {
  let pHp   = Math.min(ps.maxHp, Math.max(1, hpIn))
  let mana  = manaIn
  let monHp = monster.currentHp
  let potUsed   = 0
  let starved   = false
  let dmgDealt  = 0
  let dmgReceived = 0
  const sk: Record<string, number> = {}
  const fx = freshFx()

  for (let round = 1; round <= 40; round++) {
    tickFx(fx)
    if (fx.meditateLeft > 0) { mana = Math.min(maxMana, mana + 20); fx.meditateLeft-- }

    let choice: ActionChoice
    const hpPct  = pHp / ps.maxHp
    const mHpPct = monHp / monster.maxHp

    if (cls === 'warrior')        choice = pickWarriorAction(rng, sloppyRate, round, hpPct, mana, level, fx, mHpPct, defSkipRate)
    else if (cls === 'rogue')     choice = pickRogueAction(rng, sloppyRate, round, hpPct, mana, level, fx, mHpPct, ps, defSkipRate)
    else                          choice = pickSorcererAction(rng, sloppyRate, round, hpPct, mana, maxMana, level, fx, ps, defSkipRate)

    if (choice.wantedButAfford) starved = true
    mana = Math.max(0, mana - choice.manaCost)
    sk[choice.action.skillId ?? 'attack'] = (sk[choice.action.skillId ?? 'attack'] ?? 0) + 1

    const monHpBefore = monHp
    const pHpBefore   = pHp
    const { result, newPlayerHp, newMonsterHp } = applyCombatAction(rng, choice.action, round, pHp, ps, { ...monster, currentHp: monHp })
    if (result.manaAbsorbed > 0) mana = Math.max(0, mana - result.manaAbsorbed)

    dmgDealt    += Math.max(0, monHpBefore - newMonsterHp)
    dmgReceived += Math.max(0, pHpBefore - newPlayerHp)

    pHp   = newPlayerHp
    monHp = newMonsterHp

    if (result.monsterDied) {
      mana = Math.min(maxMana, mana + MANA_WIN_RESTORE)
      return { survived: true, hpAfter: pHp, manaAfter: mana, rounds: round, potUsed, starved, skillCount: sk, dmgDealt, dmgReceived }
    }
    if (pHp <= 0) return { survived: false, hpAfter: 0, manaAfter: mana, rounds: round, potUsed, starved, skillCount: sk, dmgDealt, dmgReceived }

    // Potion use: threshold varies by player experience
    // Panic threshold always applies (survival instinct even for beginners)
    const effectivePanicPct = Math.min(PANIC_POT_HP_PCT, potionThreshold)
    if (pHp / ps.maxHp < effectivePanicPct && potions > 0) {
      potions--; potUsed++
      pHp = Math.min(ps.maxHp, pHp + 60 + floor * 8)
    } else if (pHp / ps.maxHp < potionThreshold && potions > 0) {
      potions--; potUsed++
      pHp = Math.min(ps.maxHp, pHp + 60 + floor * 8)
    }
  }

  // Timeout = defeat (monster too tanky — balance flag)
  return { survived: false, hpAfter: 0, manaAfter: mana, rounds: 40, potUsed, starved, skillCount: sk, dmgDealt, dmgReceived }
}

// ─── Single run ───────────────────────────────────────────────────────────────
export interface RunOptions {
  /** 0–1 chance per round to use basic attack instead of optimal skill */
  sloppyRate?:      number
  /** HP% threshold to use a potion (beginner: 0.20, expert: 0.45) */
  potionThreshold?: number
  /** 0–1 chance to skip defensive skills (iron_skin, smoke_bomb) even when optimal */
  defSkipRate?:     number
  /** XP to start the run with (meta-progression carry-in). Default 0. */
  startingXp?:      number
  /** Items already equipped at run start (meta-progression carry-in). Default none. */
  startingEquipped?: Partial<Record<EquipSlot, Item>>
  /**
   * Monster difficulty tier — mirrors in-game difficulty modes.
   *   1 = Normal    (default)
   *   2 = Nightmare (+40% HP, +28% dmg, tier-2 monster pool)
   *   3 = Hell      (+80% HP, +56% dmg, tier-2+3 monster pool, deep runes / radiant gems)
   */
  diffTier?: 1 | 2 | 3
  /**
   * First floor to simulate (waypoint start). Default 1.
   * Simulates jumping to a previously unlocked checkpoint rather than starting from F1.
   */
  startFloor?: number
  /**
   * Gem/rune stash carried in from previous runs (cross-run accumulation via town stash).
   * Gems here are tried for socketing at run start before any loot is found.
   */
  startingGemStash?: Map<string, number>
  /**
   * Number of floors to simulate (overrides module-level FLOOR_COUNT).
   * Use when calling simulateRun as an imported module with a non-default floor depth.
   */
  floorCount?: number
}

export function simulateRun(rng: Rng, classId: ClassId, opts: RunOptions = {}): RunResult {
  const sloppyRate      = opts.sloppyRate      ?? (0.02 + rng() * 0.06)
  const potionThreshold = opts.potionThreshold ?? POTION_USE_HP_PCT
  const defSkipRate     = opts.defSkipRate     ?? 0
  const diffTier        = opts.diffTier        ?? 1
  const startFloor      = Math.max(1, opts.startFloor ?? 1)
  const simFloorCount   = opts.floorCount ?? FLOOR_COUNT

  let xp       = opts.startingXp ?? 0
  let level    = levelFromXp(xp)
  let hp       = 0
  let mana     = 0
  let potions  = STARTING_POTIONS
  let manaPots = 2
  // Deep-copy starting equipped so meta-progression items don't mutate between runs
  const equipped: Partial<Record<EquipSlot, Item>> = opts.startingEquipped
    ? Object.fromEntries(Object.entries(opts.startingEquipped).map(([k, v]) => [k, { ...v }])) as Partial<Record<EquipSlot, Item>>
    : {}
  const gemStash: GemStash = opts.startingGemStash ? new Map(opts.startingGemStash) : new Map()

  const itemsFound: Record<QualKey, number> = { normal: 0, magic: 0, rare: 0, unique: 0, rune: 0, gem: 0 }
  let totalRounds = 0, totalCombats = 0, manaStarved = 0, potionsUsed = 0, potionsFound = 0
  let bossKills = 0, bossAttempts = 0, gemsSocketed = 0
  const startXp = xp   // remember run start XP to compute earnedXp at the end
  const floorHpPct:      number[] = []
  const floorAvgRounds:  number[] = []
  const levelAtFloor:    number[] = []
  const floorDmgDealt:   number[] = []
  const floorDmgReceived: number[] = []
  const floorMonsterHp:  number[] = []
  const gearScoreAtFloor: number[] = []
  const slotsFilled:     number[] = []
  const skillCount:    Record<string, number> = {}

  for (let floor = startFloor; floor <= simFloorCount; floor++) {
    const ps      = buildPlayerStats(floor, level, equipped, classId)
    const maxMana = maxManaForLevel(level, classId)

    if (floor === 1) {
      hp   = ps.maxHp
      mana = maxMana
    } else {
      hp = Math.min(ps.maxHp, Math.round(hp * (ps.maxHp / buildPlayerStats(floor - 1, level, equipped, classId).maxHp)))
    }

    floorHpPct.push(hp / ps.maxHp)
    levelAtFloor.push(level)
    // Gear score = sum of all effectiveStats values across all equipped slots
    const gs = Object.values(equipped).reduce((sum, item) =>
      sum + Object.values(item?.effectiveStats ?? {}).reduce((s, v) => s + Math.max(0, v as number), 0), 0)
    gearScoreAtFloor.push(gs)
    slotsFilled.push(Object.values(equipped).filter(Boolean).length)

    // Full Rejuvenation shrine: guaranteed on F3, F6, F8 entrance — fully restores HP+mana
    if (isFullRejuvFloor(floor)) {
      hp   = ps.maxHp
      mana = maxManaForLevel(level, classId)
    }

    const isBoss  = isBossFloor(floor)
    const weights = floorPacingWeights(floor)
    let floorRounds = 0, floorFights = 0
    let floorTotalDmgDealt = 0, floorTotalDmgReceived = 0, floorTotalMonHp = 0, floorMonCount = 0

    for (let tile = 0; tile < TILES_PER_FLOOR; tile++) {
      const enc = rollEncounter(rng, floor, weights)

      if (enc === EncounterType.Shrine) {
        const scaleFactor = 1 + (floor - 1) * 0.1
        const ps2 = buildPlayerStats(floor, level, equipped, classId)
        hp   = Math.min(ps2.maxHp, hp + Math.round(25 * scaleFactor))
        mana = Math.min(maxManaForLevel(level, classId), mana + Math.round(15 * scaleFactor))
        continue
      }
      if (enc === EncounterType.Chest) {
        const drops = rollLoot(rng, 'chest', floor, 0)
        for (const d of drops) {
          const r = absorbItem(d, classId, equipped, itemsFound, gemStash)
          if (r.manaPotion) manaPots = Math.min(4, manaPots + 1)
          else if (d.slot === 'potion') { potions = Math.min(6, potions + 1); potionsFound++ }
        }
        gemsSocketed += trySocketGems(equipped, gemStash, classId)
        continue
      }

      const tier = encToTier(enc)
      if (!tier) continue

      const maxM = maxManaForLevel(level, classId)
      if (mana / maxM < MANA_POT_THRESHOLD && manaPots > 0) {
        manaPots--
        mana = Math.min(maxM, mana + (floor >= 10 ? 120 : floor >= 7 ? 80 : floor >= 4 ? 55 : 40))
      }

      const freshPs = buildPlayerStats(floor, level, equipped, classId)
      const hpPctEntry = hp / freshPs.maxHp   // capture before fight for death analysis
      const monster = applyTierScaling(spawnMonster(rng, floor, tier, diffTier), diffTier)
      floorTotalMonHp  += monster.maxHp
      floorMonCount++
      const fight   = runFight(rng, classId, level, freshPs, maxManaForLevel(level, classId), hp, mana, potions, monster, floor, sloppyRate, potionThreshold, defSkipRate)

      hp          = fight.hpAfter
      mana        = fight.manaAfter
      potions    -= fight.potUsed
      potionsUsed += fight.potUsed
      floorRounds += fight.rounds
      floorFights++
      totalRounds += fight.rounds
      totalCombats++
      floorTotalDmgDealt    += fight.dmgDealt
      floorTotalDmgReceived += fight.dmgReceived
      if (fight.starved) manaStarved++
      for (const [k, v] of Object.entries(fight.skillCount)) skillCount[k] = (skillCount[k] ?? 0) + v

      if (!fight.survived) {
        floorDmgDealt.push(floorRounds > 0 ? floorTotalDmgDealt / floorRounds : 0)
        floorDmgReceived.push(floorRounds > 0 ? floorTotalDmgReceived / floorRounds : 0)
        floorMonsterHp.push(floorMonCount > 0 ? floorTotalMonHp / floorMonCount : 0)
        floorAvgRounds.push(floorFights > 0 ? floorRounds / floorFights : 0)
        return { survived: false, floorReached: floor, level, itemsFound, totalRounds, totalCombats, floorHpPct, floorAvgRounds, skillCount, manaStarved, potionsUsed, potionsFound, bossKills, bossAttempts, gemsSocketed, levelAtFloor, floorDmgDealt, floorDmgReceived, floorMonsterHp, earnedXp: xp - startXp, endEquipped: { ...equipped }, gearScoreAtFloor, slotsFilled, deathCause: { tier, floor, isBoss: false }, hpPctAtDeath: hpPctEntry, endGemStash: new Map(gemStash) }
      }

      // Loot + XP
      const drops = rollLoot(rng, tier, floor, 0)
      for (const d of drops) {
        const r = absorbItem(d, classId, equipped, itemsFound, gemStash)
        if (r.manaPotion) manaPots = Math.min(4, manaPots + 1)
        else if (d.slot === 'potion') { potions = Math.min(6, potions + 1); potionsFound++ }
      }
      gemsSocketed += trySocketGems(equipped, gemStash, classId)

      const xpByTier: Record<EncounterTier, number> = { normal: 30, elite: 60, rare: 120, ancient: 240, boss: 500 }
      xp += Math.round(xpByTier[tier] * (1 + (floor - 1) * 0.1))
      const newLevel = levelFromXp(xp)
      if (newLevel > level) {
        level = newLevel
        const newMaxMana = maxManaForLevel(level, classId)
        mana  = Math.min(newMaxMana, mana + 20)
      }
    }

    // Boss fight — always enrage + regen
    if (isBoss) {
      const maxM = maxManaForLevel(level, classId)
      if (mana / maxM < MANA_POT_THRESHOLD && manaPots > 0) {
        manaPots--
        mana = Math.min(maxM, mana + (floor >= 10 ? 120 : floor >= 7 ? 80 : floor >= 4 ? 55 : 40))
      }

      const freshPs = buildPlayerStats(floor, level, equipped, classId)
      const bossHpPctEntry = hp / freshPs.maxHp   // capture before boss fight
      const boss    = applyTierScaling(spawnBoss(rng, floor, diffTier), diffTier)
      bossAttempts++

      const fight = runFight(rng, classId, level, freshPs, maxManaForLevel(level, classId), hp, mana, potions, boss, floor, sloppyRate, potionThreshold, defSkipRate)

      hp          = fight.hpAfter
      mana        = fight.manaAfter
      potions    -= fight.potUsed
      potionsUsed += fight.potUsed
      floorRounds += fight.rounds
      floorFights++
      totalRounds += fight.rounds
      totalCombats++
      if (fight.starved) manaStarved++
      for (const [k, v] of Object.entries(fight.skillCount)) skillCount[k] = (skillCount[k] ?? 0) + v

      floorTotalDmgDealt    += fight.dmgDealt
      floorTotalDmgReceived += fight.dmgReceived
      floorTotalMonHp  += boss.maxHp
      floorMonCount++

      if (fight.survived) {
        bossKills++
        const drops = rollLoot(rng, 'boss', floor, 0)
        for (const d of drops) {
          const r = absorbItem(d, classId, equipped, itemsFound, gemStash)
          if (r.manaPotion) manaPots = Math.min(4, manaPots + 1)
          else if (d.slot === 'potion') { potions = Math.min(6, potions + 1); potionsFound++ }
        }
        gemsSocketed += trySocketGems(equipped, gemStash, classId)
        xp += 500 + floor * 50
        const newLevel = levelFromXp(xp)
        if (newLevel > level) { level = newLevel; mana = Math.min(maxManaForLevel(level, classId), mana + 20) }
      } else {
        floorDmgDealt.push(floorRounds > 0 ? floorTotalDmgDealt / floorRounds : 0)
        floorDmgReceived.push(floorRounds > 0 ? floorTotalDmgReceived / floorRounds : 0)
        floorMonsterHp.push(floorMonCount > 0 ? floorTotalMonHp / floorMonCount : 0)
        floorAvgRounds.push(floorFights > 0 ? floorRounds / floorFights : 0)
        return { survived: false, floorReached: floor, level, itemsFound, totalRounds, totalCombats, floorHpPct, floorAvgRounds, skillCount, manaStarved, potionsUsed, potionsFound, bossKills, bossAttempts, gemsSocketed, levelAtFloor, floorDmgDealt, floorDmgReceived, floorMonsterHp, earnedXp: xp - startXp, endEquipped: { ...equipped }, gearScoreAtFloor, slotsFilled, deathCause: { tier: 'boss' as EncounterTier, floor, isBoss: true }, hpPctAtDeath: bossHpPctEntry, endGemStash: new Map(gemStash) }
      }
    }

    floorDmgDealt.push(floorRounds > 0 ? floorTotalDmgDealt / floorRounds : 0)
    floorDmgReceived.push(floorRounds > 0 ? floorTotalDmgReceived / floorRounds : 0)
    floorMonsterHp.push(floorMonCount > 0 ? floorTotalMonHp / floorMonCount : 0)
    floorAvgRounds.push(floorFights > 0 ? floorRounds / floorFights : 0)
  }

  return { survived: true, floorReached: simFloorCount, level, itemsFound, totalRounds, totalCombats, floorHpPct, floorAvgRounds, skillCount, manaStarved, potionsUsed, potionsFound, bossKills, bossAttempts, gemsSocketed, levelAtFloor, floorDmgDealt, floorDmgReceived, floorMonsterHp, earnedXp: xp - startXp, endEquipped: { ...equipped }, gearScoreAtFloor, slotsFilled, endGemStash: new Map(gemStash) }
}

// ─── Item helpers ─────────────────────────────────────────────────────────────
function absorbItem(
  item: Item, cls: ClassId,
  equipped: Partial<Record<EquipSlot, Item>>,
  counts: Record<QualKey, number>,
  gemStash: GemStash,
): { manaPotion: boolean } {
  if (item.slot === 'rune')   { counts.rune++;   return { manaPotion: false } }
  if (item.slot === 'gem')    {
    counts.gem++
    gemStash.set(item.baseId, (gemStash.get(item.baseId) ?? 0) + 1)
    return { manaPotion: false }
  }
  if (item.slot === 'potion') { return { manaPotion: item.baseId === 'mana_potion' } }
  // Ring: smart route ring1→ring2 like itemToEquipSlot
  if (item.slot === 'ring') {
    const score = scoreItem(item, cls)
    const s1 = equipped.ring1 ? scoreItem(equipped.ring1, cls) : -1
    const s2 = equipped.ring2 ? scoreItem(equipped.ring2, cls) : -1
    if (!equipped.ring1) {
      equipped.ring1 = item
    } else if (!equipped.ring2) {
      // Fill ring2 — put weaker ring there
      if (score > s1) { equipped.ring2 = equipped.ring1; equipped.ring1 = item }
      else equipped.ring2 = item
    } else {
      // Both full — replace weakest
      if (score > s1 && score > s2) {
        if (s1 <= s2) { equipped.ring1 = item } else { equipped.ring2 = item }
      } else if (score > s1) { equipped.ring1 = item }
      else if (score > s2) { equipped.ring2 = item }
    }
    const key = item.quality as QualKey
    counts[key] = (counts[key] ?? 0) + 1
    return { manaPotion: false }
  }
  const eq = SLOT_MAP[item.slot]
  if (eq) {
    const cur = equipped[eq]
    if (!cur || scoreItem(item, cls) > scoreItem(cur, cls)) equipped[eq] = item
  }
  const key = item.quality as QualKey
  counts[key] = (counts[key] ?? 0) + 1
  return { manaPotion: false }
}

// ─── Run all classes ──────────────────────────────────────────────────────────
export function runClass(classId: ClassId): RunResult[] {
  const masterRng = makeRng(0xc0ffee ^ classId.charCodeAt(0))
  return Array.from({ length: RUNS_PER_CLASS }, () => simulateRun(makeRng(masterRng() * 2 ** 32), classId, { diffTier: SIM_DIFF_TIER }))
}

// ─── Shared helpers (exported for journey sim) ────────────────────────────────
export function pct(n: number, d: number): string { return d === 0 ? '  n/a' : `${((n / d) * 100).toFixed(0)}%`.padStart(5) }
export function avg(arr: number[]): number { return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length }
export { type RunResult, FLOOR_COUNT }
export const CLASS_IDS: ClassId[] = ['warrior', 'rogue', 'sorcerer']

// ─── Main ─────────────────────────────────────────────────────────────────────
if (import.meta.main) {

console.log(`\n${'═'.repeat(72)}`)
console.log(`  FULL RUN SIM  ${RUNS_PER_CLASS.toLocaleString()} runs/class × ${FLOOR_COUNT} floors  |  ${TILES_PER_FLOOR} tiles/floor  |  ${DIFF_LABEL} difficulty`)
console.log(`  player imperfection: 2–8% sloppy rate  |  panic potions at ${(PANIC_POT_HP_PCT*100).toFixed(0)}% HP`)
console.log(`${'═'.repeat(72)}\n`)

const all: Record<ClassId, RunResult[]> = {} as never
for (const cls of CLASS_IDS) {
  process.stdout.write(`  Simulating ${cls.padEnd(10)}`)
  const t0 = Date.now()
  all[cls] = runClass(cls)
  console.log(`  ${RUNS_PER_CLASS.toLocaleString()} runs  (${Date.now() - t0}ms)`)
}
console.log()

const floorHeader = '  Class      ' + Array.from({ length: FLOOR_COUNT }, (_, i) => `F${i+1}`.padStart(5)).join('')

// ─── Survival rate ────────────────────────────────────────────────────────────
console.log('SURVIVAL RATE  (% of runs reaching each floor)')
console.log(floorHeader)
console.log('  ' + '─'.repeat(floorHeader.length - 2))
for (const cls of CLASS_IDS) {
  const res = all[cls]
  const row = Array.from({ length: FLOOR_COUNT }, (_, f) =>
    pct(res.filter(r => r.floorReached > f || r.survived).length, res.length)
  )
  console.log(`  ${cls.padEnd(10)} ${row.join('')}`)
}

// ─── Fight duration ───────────────────────────────────────────────────────────
console.log('\nFIGHT DURATION  (avg rounds per combat per floor)')
console.log(floorHeader)
console.log('  ' + '─'.repeat(floorHeader.length - 2))
for (const cls of CLASS_IDS) {
  const res = all[cls]
  const row = Array.from({ length: FLOOR_COUNT }, (_, f) => {
    const vals = res.filter(r => r.floorAvgRounds[f] != null && r.floorAvgRounds[f] > 0).map(r => r.floorAvgRounds[f])
    return vals.length === 0 ? '  n/a' : avg(vals).toFixed(1).padStart(5)
  })
  console.log(`  ${cls.padEnd(10)} ${row.join('')}`)
}

// ─── HP budget ────────────────────────────────────────────────────────────────
console.log('\nHP BUDGET  (avg HP% entering each floor, all runs)')
console.log(floorHeader)
console.log('  ' + '─'.repeat(floorHeader.length - 2))
for (const cls of CLASS_IDS) {
  const res = all[cls]
  const row = Array.from({ length: FLOOR_COUNT }, (_, f) => {
    const vals = res.filter(r => r.floorHpPct[f] != null).map(r => r.floorHpPct[f])
    return vals.length === 0 ? '  n/a' : `${(avg(vals) * 100).toFixed(0)}%`.padStart(5)
  })
  console.log(`  ${cls.padEnd(10)} ${row.join('')}`)
}

// ─── Level progression ────────────────────────────────────────────────────────
console.log('\nLEVEL AT KEY FLOORS  (avg level entering floor, all runs that reached it)')
console.log(`  ${'Class'.padEnd(10)} ${'F1'.padStart(5)} ${'F3'.padStart(5)} ${'F5'.padStart(5)} ${'F7'.padStart(5)} ${'F10'.padStart(5)}`)
console.log('  ' + '─'.repeat(38))
for (const cls of CLASS_IDS) {
  const res = all[cls]
  const row = [0, 2, 4, 6, 9].map(f => {
    const vals = res.filter(r => r.levelAtFloor[f] != null).map(r => r.levelAtFloor[f])
    return vals.length === 0 ? '  n/a' : avg(vals).toFixed(1).padStart(5)
  })
  console.log(`  ${cls.padEnd(10)} ${row.join('')}`)
}

// ─── Loot ─────────────────────────────────────────────────────────────────────
console.log('\nLOOT  (avg per run over all runs)')
console.log(`  ${'Class'.padEnd(10)} ${'Normal'.padStart(7)} ${'Magic'.padStart(7)} ${'Rare'.padStart(7)} ${'Unique'.padStart(7)} ${'Rune'.padStart(7)} ${'Gem'.padStart(7)} ${'Socketed'.padStart(9)}  Total`)
console.log('  ' + '─'.repeat(74))
for (const cls of CLASS_IDS) {
  const res = all[cls]
  const keys: QualKey[] = ['normal', 'magic', 'rare', 'unique', 'rune', 'gem']
  const avgs = keys.map(k => avg(res.map(r => r.itemsFound[k])))
  const tot  = avgs.reduce((a, b) => a + b, 0)
  const sockAvg = avg(res.map(r => r.gemsSocketed)).toFixed(1).padStart(9)
  console.log(`  ${cls.padEnd(10)} ${avgs.map(v => v.toFixed(1).padStart(7)).join('')} ${sockAvg}  ${tot.toFixed(1)}`)
}

// ─── Boss kill rate ───────────────────────────────────────────────────────────
// Boss kill rate = among runs that reached the boss floor, % that survived it
console.log('\nBOSS KILL RATE  (among runs that reached that floor)')
console.log(floorHeader)
console.log('  ' + '─'.repeat(floorHeader.length - 2))
for (const cls of CLASS_IDS) {
  const res = all[cls]
  const row = Array.from({ length: FLOOR_COUNT }, (_, f) => {
    const floor = f + 1
    if (!isBossFloor(floor)) return '   - '
    // Runs that entered this floor
    const reached = res.filter(r => r.floorReached >= floor || r.survived).length
    // Runs that survived past this floor (floor was not their death floor)
    const survived = res.filter(r => r.floorReached > floor || r.survived).length
    return pct(survived, reached)
  })
  console.log(`  ${cls.padEnd(10)} ${row.join('')}`)
}

// ─── Fight economics ──────────────────────────────────────────────────────────
// Shows the damage exchange per round: how hard player hits vs how hard monsters hit
// Net margin = player dmg per round − monster dmg per round (positive = player winning tempo)
console.log('\nFIGHT ECONOMICS  (avg damage per round per floor — player dealt / received)')
console.log(`  ${'Class'.padEnd(10)}` + Array.from({ length: FLOOR_COUNT }, (_, i) => `  F${i+1}`).join(''))
console.log('  ' + '─'.repeat(floorHeader.length - 2))
for (const cls of CLASS_IDS) {
  const res = all[cls]
  const dealt = Array.from({ length: FLOOR_COUNT }, (_, f) => {
    const vals = res.filter(r => r.floorDmgDealt[f] != null && r.floorDmgDealt[f] > 0).map(r => r.floorDmgDealt[f])
    return vals.length === 0 ? null : avg(vals)
  })
  const rcvd = Array.from({ length: FLOOR_COUNT }, (_, f) => {
    const vals = res.filter(r => r.floorDmgReceived[f] != null && r.floorDmgReceived[f] > 0).map(r => r.floorDmgReceived[f])
    return vals.length === 0 ? null : avg(vals)
  })
  const monHp = Array.from({ length: FLOOR_COUNT }, (_, f) => {
    const vals = res.filter(r => r.floorMonsterHp[f] != null && r.floorMonsterHp[f] > 0).map(r => r.floorMonsterHp[f])
    return vals.length === 0 ? null : avg(vals)
  })
  const dealtRow = dealt.map(v => v == null ? ' n/a' : v.toFixed(0).padStart(4))
  const rcvdRow  = rcvd.map(v  => v == null ? ' n/a' : v.toFixed(0).padStart(4))
  const monRow   = monHp.map(v => v == null ? ' n/a' : v.toFixed(0).padStart(4))
  console.log(`  ${cls.padEnd(10)} dealt/rd:   ${dealtRow.join('  ')}`)
  console.log(`  ${''.padEnd(10)} rcv'd/rd:   ${rcvdRow.join('  ')}`)
  console.log(`  ${''.padEnd(10)} mon HP avg: ${monRow.join('  ')}`)
  const marginRow = Array.from({ length: FLOOR_COUNT }, (_, f) => {
    const d = dealt[f], r = rcvd[f]
    if (d == null || r == null) return ' n/a'
    const net = d - r
    return (net >= 0 ? '+' : '') + net.toFixed(0).padStart(3)
  })
  console.log(`  ${''.padEnd(10)} net/rd:     ${marginRow.join('  ')}`)
  console.log()
}

// ─── Skill usage ─────────────────────────────────────────────────────────────
console.log('\nSKILL USAGE  (% of all rounds per class)')
for (const cls of CLASS_IDS) {
  const res = all[cls]
  const tot: Record<string, number> = {}; let grand = 0
  for (const r of res) for (const [k, v] of Object.entries(r.skillCount)) { tot[k] = (tot[k] ?? 0) + v; grand += v }
  const sorted = Object.entries(tot).sort((a, b) => b[1] - a[1])
  const parts  = sorted.map(([k, v]) => `${k}:${((v / grand) * 100).toFixed(0)}%`)
  console.log(`  ${cls.padEnd(10)} ${parts.join('  ')}`)
}

// ─── Mana & potions ───────────────────────────────────────────────────────────
console.log('\nRESOURCE PRESSURE')
console.log(`  ${'Class'.padEnd(10)} ${'Mana Starve%'.padStart(13)} ${'Pots/Run'.padStart(10)} ${'Boss Kills'.padStart(11)} ${'Gems Socket'.padStart(12)}`)
console.log('  ' + '─'.repeat(60))
for (const cls of CLASS_IDS) {
  const res    = all[cls]
  const tFigh  = avg(res.map(r => r.totalCombats))
  const tStar  = avg(res.map(r => r.manaStarved))
  const sPct   = tFigh > 0 ? `${((tStar / tFigh) * 100).toFixed(1)}%`.padStart(13) : '          n/a'
  const pots   = avg(res.map(r => r.potionsUsed)).toFixed(1).padStart(10)
  const bKills = avg(res.map(r => r.bossKills)).toFixed(1).padStart(11)
  const gSock  = avg(res.map(r => r.gemsSocketed)).toFixed(1).padStart(12)
  console.log(`  ${cls.padEnd(10)} ${sPct} ${pots} ${bKills} ${gSock}`)
}

// ─── Floor death distribution ─────────────────────────────────────────────────
// Shows which floor causes the most deaths — spike floors indicate balance issues
console.log('\nFLOOR DEATH DISTRIBUTION  (% of all deaths that occurred on each floor)')
console.log(floorHeader)
console.log('  ' + '─'.repeat(floorHeader.length - 2))
for (const cls of CLASS_IDS) {
  const res   = all[cls]
  const dead  = res.filter(r => !r.survived)
  const total = dead.length
  const row = Array.from({ length: FLOOR_COUNT }, (_, f) => {
    const floor = f + 1
    const n = dead.filter(r => r.floorReached === floor).length
    return total === 0 ? '  n/a' : pct(n, total)
  })
  console.log(`  ${cls.padEnd(10)} ${row.join('')}  (n=${total})`)
}

// ─── Death cause breakdown ────────────────────────────────────────────────────
console.log('\nDEATH CAUSE  (% of deaths caused by each encounter tier)')
console.log(`  ${'Class'.padEnd(10)} ${'Normal'.padStart(8)} ${'Elite'.padStart(8)} ${'Rare'.padStart(8)} ${'Ancient'.padStart(8)} ${'Boss'.padStart(8)}  | avg HP% entering fatal fight`)
console.log('  ' + '─'.repeat(76))
for (const cls of CLASS_IDS) {
  const dead = all[cls].filter(r => !r.survived && r.deathCause)
  const n = dead.length
  if (n === 0) { console.log(`  ${cls.padEnd(10)} (no deaths)`); continue }
  const byTier = (t: string) => pct(dead.filter(r => r.deathCause!.tier === t).length, n)
  const avgHp = dead.filter(r => r.hpPctAtDeath != null).reduce((s, r) => s + r.hpPctAtDeath!, 0) / dead.filter(r => r.hpPctAtDeath != null).length
  console.log(`  ${cls.padEnd(10)} ${byTier('normal').padStart(8)} ${byTier('elite').padStart(8)} ${byTier('rare').padStart(8)} ${byTier('ancient').padStart(8)} ${byTier('boss').padStart(8)}  | ${(avgHp * 100).toFixed(0)}% HP entering`)
}

// ─── HP% at death histogram ───────────────────────────────────────────────────
// Buckets: ≤10% (dominated), 11-25% (on back foot), 26-50% (fighting chance), >50% (unlucky/spiked)
console.log('\nHP% ENTERING FATAL FIGHT  (how depleted was the player before dying?)')
console.log(`  ${'Class'.padEnd(10)} ${'≤10% HP'.padStart(10)} ${'11-25%'.padStart(10)} ${'26-50%'.padStart(10)} ${'51-75%'.padStart(10)} ${'76-100%'.padStart(10)}`)
console.log('  ' + '─'.repeat(62))
for (const cls of CLASS_IDS) {
  const dead = all[cls].filter(r => !r.survived && r.hpPctAtDeath != null)
  const n = dead.length
  if (n === 0) { console.log(`  ${cls.padEnd(10)} (no deaths)`); continue }
  const b = (lo: number, hi: number) => pct(dead.filter(r => r.hpPctAtDeath! > lo && r.hpPctAtDeath! <= hi).length, n)
  console.log(`  ${cls.padEnd(10)} ${b(0, 0.10).padStart(10)} ${b(0.10, 0.25).padStart(10)} ${b(0.25, 0.50).padStart(10)} ${b(0.50, 0.75).padStart(10)} ${b(0.75, 1.00).padStart(10)}`)
}
console.log('  Legend: ≤10% = dominated  11-25% = on back foot  26-50% = fighting chance  >50% = spike-killed')

// ─── Potion economy ───────────────────────────────────────────────────────────
console.log('\nPOTION ECONOMY  (avg per run: starting 5 + found vs used, and net leftover)')
console.log(`  ${'Class'.padEnd(10)} ${'Starting'.padStart(10)} ${'Found'.padStart(10)} ${'Total'.padStart(10)} ${'Used'.padStart(10)} ${'Net'.padStart(10)}  Floor-by-floor found rate`)
console.log('  ' + '─'.repeat(72))
for (const cls of CLASS_IDS) {
  const res  = all[cls]
  const fnd  = avg(res.map(r => r.potionsFound))
  const used = avg(res.map(r => r.potionsUsed))
  const net  = STARTING_POTIONS + fnd - used
  const netStr = (net >= 0 ? '+' : '') + net.toFixed(1)
  console.log(`  ${cls.padEnd(10)} ${STARTING_POTIONS.toString().padStart(10)} ${fnd.toFixed(1).padStart(10)} ${(STARTING_POTIONS + fnd).toFixed(1).padStart(10)} ${used.toFixed(1).padStart(10)} ${netStr.padStart(10)}`)
}

// ─── Equipment slot fill rate ─────────────────────────────────────────────────
const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'offhand', 'helmet', 'chest', 'gloves', 'legs', 'boots', 'belt', 'ring1', 'ring2', 'amulet', 'circlet']
console.log('\nEQUIPMENT SLOT FILL  (% of runs with slot filled at run end — shows gear gaps)')
console.log(`  ${'Class'.padEnd(10)} ` + EQUIP_SLOTS.map(s => s.substring(0, 6).padStart(7)).join(''))
console.log('  ' + '─'.repeat(EQUIP_SLOTS.length * 7 + 14))
for (const cls of CLASS_IDS) {
  const res = all[cls]
  const row = EQUIP_SLOTS.map(slot => {
    const filled = res.filter(r => r.endEquipped[slot] != null).length
    return pct(filled, res.length)
  })
  console.log(`  ${cls.padEnd(10)} ${row.join('')}`)
}

// ─── Avg slots filled by floor ────────────────────────────────────────────────
console.log('\nAVG SLOTS FILLED  (avg count of equipped slots entering each floor)')
console.log(floorHeader)
console.log('  ' + '─'.repeat(floorHeader.length - 2))
for (const cls of CLASS_IDS) {
  const res = all[cls]
  const row = Array.from({ length: FLOOR_COUNT }, (_, f) => {
    const vals = res.filter(r => r.slotsFilled[f] != null).map(r => r.slotsFilled[f])
    return vals.length === 0 ? '  n/a' : avg(vals).toFixed(1).padStart(5)
  })
  console.log(`  ${cls.padEnd(10)} ${row.join('')}  (max ${EQUIP_SLOTS.length})`)
}

// ─── Balance flags ────────────────────────────────────────────────────────────
console.log('\nBALANCE FLAGS')
const flags: Array<{ ok: boolean; msg: string }> = []

const survRates = CLASS_IDS.map(cls => ({ cls, r: all[cls].filter(r => r.survived).length / all[cls].length }))
const maxSurv = Math.max(...survRates.map(s => s.r))
const minSurv = Math.min(...survRates.map(s => s.r))
if (maxSurv - minSurv > 0.15)
  flags.push({ ok: false, msg: `Class balance gap: ${survRates.map(s => `${s.cls} ${(s.r*100).toFixed(0)}%`).join(' / ')}` })

for (const s of survRates) {
  if (FLOOR_COUNT >= 20) {
    // Deep runs (20+ floors): F30 is aspirational endgame — near-impossible by design.
    // Flag WARN only if too easy (should remain a white-whale run).
    if (s.r > 0.05)  flags.push({ ok: false, msg: `${s.cls} F${FLOOR_COUNT} survival ${(s.r*100).toFixed(1)}% — too easy for deep run (target <5% per single run)` })
    else if (s.r > 0.005) flags.push({ ok: true,  msg: `${s.cls} F${FLOOR_COUNT} survival ${(s.r*100).toFixed(2)}% — elite endgame (correct for multi-session meta)` })
    else flags.push({ ok: true, msg: `${s.cls} F${FLOOR_COUNT} survival <0.5% — aspirational endgame floor, requires meta-progression` })
  } else {
    if (s.r > 0.75)  flags.push({ ok: false, msg: `${s.cls} F${FLOOR_COUNT} survival ${(s.r*100).toFixed(0)}% — too easy (roguelite target: 2-20%)` })
    else if (s.r < 0.01) flags.push({ ok: false, msg: `${s.cls} F${FLOOR_COUNT} survival ${(s.r*100).toFixed(1)}% — nearly impossible, needs tuning` })
    else if (s.r < 0.04) flags.push({ ok: true,  msg: `${s.cls} survival ${(s.r*100).toFixed(1)}% — hardcore difficulty (intended D2-HC feel)` })
    else flags.push({ ok: true,  msg: `${s.cls} survival ${(s.r*100).toFixed(0)}% — roguelite range` })
  }
}

// ── Mid-game survival checkpoints (only meaningful for 20+ floor sims) ───────
if (FLOOR_COUNT >= 20) {
  const checkFloors = [15, 20, 25].filter(f => f < FLOOR_COUNT)
  for (const cls of CLASS_IDS) {
    for (const cf of checkFloors) {
      const rate = all[cls].filter(r => r.floorReached >= cf || r.survived).length / all[cls].length
      const rateStr = (rate * 100).toFixed(rate < 0.01 ? 2 : 1)
      if (cf === 15) {
        if (rate < 0.01) flags.push({ ok: false, msg: `${cls} F15 survival ${rateStr}% — deep content unreachable; soften F11-15 monsters or boost passives` })
        else if (rate < 0.05) flags.push({ ok: true, msg: `${cls} F15 survival ${rateStr}% — elite-only (hardcore roguelite, acceptable)` })
        else flags.push({ ok: true, msg: `${cls} F15 survival ${rateStr}% — deep content reachable (target 5-10%)` })
      } else if (cf === 20) {
        if (rate < 0.001) flags.push({ ok: true, msg: `${cls} F20 survival <0.1% — aspirational (correct: multi-session endgame)` })
        else flags.push({ ok: true, msg: `${cls} F20 survival ${rateStr}% — deep endgame` })
      } else if (cf === 25) {
        if (rate < 0.001) flags.push({ ok: true, msg: `${cls} F25 survival <0.1% — prestige floor (correct)` })
        else flags.push({ ok: true, msg: `${cls} F25 survival ${rateStr}% — prestige endgame` })
      }
    }
  }
}

for (const cls of CLASS_IDS) {
  const res   = all[cls]
  const uPR   = avg(res.map(r => r.itemsFound.unique))
  const rPR   = avg(res.map(r => r.itemsFound.rune))
  const magPR = avg(res.map(r => r.itemsFound.magic))
  if (uPR < 0.10)  flags.push({ ok: false, msg: `${cls} unique ${uPR.toFixed(2)}/run — too rare` })
  else if (uPR > 1.5) flags.push({ ok: false, msg: `${cls} unique ${uPR.toFixed(2)}/run — too common` })
  else flags.push({ ok: true, msg: `${cls} unique ${uPR.toFixed(2)}/run` })
  if (magPR < 2.0) flags.push({ ok: false, msg: `${cls} magic items ${magPR.toFixed(1)}/run — low, loot feels sparse` })
  if (rPR > 4.0)   flags.push({ ok: false, msg: `${cls} runes ${rPR.toFixed(2)}/run — too plentiful` })
}

for (const cls of CLASS_IDS) {
  const res   = all[cls]
  const tFigh = avg(res.map(r => r.totalCombats))
  const tStar = avg(res.map(r => r.manaStarved))
  const p     = tFigh > 0 ? tStar / tFigh : 0
  if (p > 0.55) flags.push({ ok: false, msg: `${cls} mana starve ${(p*100).toFixed(0)}% — reduce costs or add regen` })
  else if (p === 0 && tFigh > 20 && cls !== 'sorcerer') flags.push({ ok: false, msg: `${cls} mana starve 0% — skills too cheap` })
  else if (p < 0.03 && tFigh > 20 && cls === 'sorcerer') flags.push({ ok: true, msg: `${cls} mana starve ${(p*100).toFixed(0)}% — meditate design (intentional)` })
  else flags.push({ ok: true, msg: `${cls} mana starve ${(p*100).toFixed(0)}% — healthy tension` })

  const avgR = avg(res.map(r => r.totalCombats > 0 ? r.totalRounds / r.totalCombats : 0))
  if (avgR > 14) flags.push({ ok: false, msg: `${cls} avg ${avgR.toFixed(1)} rounds/fight — monsters too tanky` })
  else if (avgR < 2.5) flags.push({ ok: false, msg: `${cls} avg ${avgR.toFixed(1)} rounds/fight — one-shot territory` })
  else flags.push({ ok: true, msg: `${cls} avg ${avgR.toFixed(1)} rounds/fight — healthy duration` })

  // Whirlwind / late skill availability check
  const surv = res.filter(r => r.survived)
  if (surv.length > 0) {
    const avgLevelF10 = avg(surv.map(r => r.level))
    const skillsUsed  = Object.keys(surv[0]?.skillCount ?? {})
    if (cls === 'warrior' && !Object.keys(res.reduce((tot, r) => { for (const k of Object.keys(r.skillCount)) tot[k] = 1; return tot }, {} as Record<string,number>)).includes('whirlwind')) {
      flags.push({ ok: false, msg: `warrior whirlwind: 0% usage — level gate too high or cost too much` })
    }
  }
}

// ── Floor F3 death spike check ─────────────────────────────────────────────────
for (const cls of CLASS_IDS) {
  const dead  = all[cls].filter(r => !r.survived)
  const total = dead.length
  if (total === 0) continue
  const f3Pct = dead.filter(r => r.floorReached === 3).length / total
  if (f3Pct > 0.25) flags.push({ ok: false, msg: `${cls} F3 death spike: ${(f3Pct*100).toFixed(0)}% of all deaths on F3 — biggest kill floor, may need tuning` })
  else flags.push({ ok: true, msg: `${cls} F3 death concentration ${(f3Pct*100).toFixed(0)}% — acceptable` })
}

// ── Spike kill check (>50% HP entering fatal fight) ────────────────────────────
for (const cls of CLASS_IDS) {
  const dead = all[cls].filter(r => !r.survived && r.hpPctAtDeath != null)
  if (dead.length === 0) continue
  const spikePct = dead.filter(r => r.hpPctAtDeath! > 0.50).length / dead.length
  // Note: Full Rejuv shrines on F3/F6/F8 naturally push spike% up — players enter encounters
  // at 100% HP after shrine floors, then get killed. Threshold adjusted to 72% to account for this.
  if (spikePct > 0.72) flags.push({ ok: false, msg: `${cls} spike death rate ${(spikePct*100).toFixed(0)}% — even with shrine heal, rare/ancient still one-shots too often` })
  else if (spikePct > 0.50) flags.push({ ok: true, msg: `${cls} spike death rate ${(spikePct*100).toFixed(0)}% — D2 feel, rare/ancient encounters dangerous (shrine floors inflate this)` })
  else flags.push({ ok: true, msg: `${cls} spike death rate ${(spikePct*100).toFixed(0)}% — attrition warfare, players worn down before dying` })
}

// ── Ring2 fill rate ─────────────────────────────────────────────────────────────
for (const cls of CLASS_IDS) {
  const ring2Fill = all[cls].filter(r => r.endEquipped.ring2 != null).length / all[cls].length
  if (ring2Fill < 0.02) flags.push({ ok: false, msg: `${cls} ring2 fill rate ${(ring2Fill*100).toFixed(0)}% — second ring slot never fills, loot table may be missing ring drops` })
  else if (ring2Fill < 0.15) flags.push({ ok: false, msg: `${cls} ring2 fill rate ${(ring2Fill*100).toFixed(0)}% — second ring slot very rarely fills` })
}

// ── Rare/ancient as primary killer ─────────────────────────────────────────────
for (const cls of CLASS_IDS) {
  const dead = all[cls].filter(r => !r.survived && r.deathCause)
  if (dead.length === 0) continue
  const rarePct    = dead.filter(r => r.deathCause!.tier === 'rare').length    / dead.length
  const ancientPct = dead.filter(r => r.deathCause!.tier === 'ancient').length / dead.length
  const bossPct    = dead.filter(r => r.deathCause!.isBoss).length             / dead.length
  if (rarePct + ancientPct > 0.70) flags.push({ ok: true, msg: `${cls} rare+ancient cause ${((rarePct+ancientPct)*100).toFixed(0)}% of deaths (boss only ${(bossPct*100).toFixed(0)}%) — D2 design: elites are the real danger` })
  if (bossPct < 0.05) flags.push({ ok: true, msg: `${cls} boss deaths ${(bossPct*100).toFixed(0)}% — bosses are skill-checks not attrition (intentional)` })
}

// ── Late game class balance ─────────────────────────────────────────────────────
const lateFloor = FLOOR_COUNT - 1  // index 8 = F9
const lateReach: Record<ClassId, number> = {} as never
for (const cls of CLASS_IDS) {
  lateReach[cls] = all[cls].filter(r => r.floorReached > lateFloor || r.survived).length / all[cls].length
}
const maxLate = Math.max(...CLASS_IDS.map(c => lateReach[c]))
const minLate = Math.min(...CLASS_IDS.map(c => lateReach[c]))
if (maxLate - minLate > 0.15) {
  const lateStr = CLASS_IDS.map(c => `${c} ${(lateReach[c]*100).toFixed(0)}%`).join(' / ')
  flags.push({ ok: false, msg: `Late game (F9+) class balance gap: ${lateStr} — consider buffing lower classes` })
}

// ── Warrior end-game survivability vs sorcerer ──────────────────────────────────
// Warrior is designed to be stronger EARLY (F1-F5) and sorcerer scales LATE (F6-F10).
// Warn only if warrior falls below 50% of sorcerer's F10 rate (design intent allows gap).
const earlyAdv = (all['warrior'].filter(r => r.floorReached >= 5 || r.survived).length / all['warrior'].length)
                / (all['sorcerer'].filter(r => r.floorReached >= 5 || r.survived).length / all['sorcerer'].length)
if (lateReach.warrior < lateReach.sorcerer * 0.50) {
  flags.push({ ok: false, msg: `Warrior F10 reach ${(lateReach.warrior*100).toFixed(0)}% vs sorcerer ${(lateReach.sorcerer*100).toFixed(0)}% — too large a gap even accounting for early-game warrior advantage` })
} else {
  flags.push({ ok: true, msg: `Warrior F10 ${(lateReach.warrior*100).toFixed(0)}% vs sorcerer ${(lateReach.sorcerer*100).toFixed(0)}% — sorcerer scales late (by design), warrior F5 reach is ${earlyAdv.toFixed(1)}× sorcerer's` })
}

// ── Potion scarcity ─────────────────────────────────────────────────────────────
for (const cls of CLASS_IDS) {
  const res = all[cls]
  const netPot = STARTING_POTIONS + avg(res.map(r => r.potionsFound)) - avg(res.map(r => r.potionsUsed))
  if (netPot < -1) flags.push({ ok: false, msg: `${cls} potion deficit ${netPot.toFixed(1)} — players running out of pots, add more drops or reduce consumption` })
  else if (netPot > 5) flags.push({ ok: false, msg: `${cls} potion surplus ${netPot.toFixed(1)} — too many pots, reduce drop rate` })
  else flags.push({ ok: true, msg: `${cls} potion economy net ${netPot >= 0 ? '+' : ''}${netPot.toFixed(1)} — healthy scarcity` })
}

for (const f of flags) console.log(`  [${f.ok ? 'OK  ' : 'WARN'}] ${f.msg}`)

console.log(`\n${'═'.repeat(72)}\n`)

// ─── HTML report (opt-in: bun run fullRunSim.ts [runs] [floors] --html) ──────
if (process.argv.includes('--html')) {
  const OUT_PATH = new URL('../sim/report.html', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')

  // ── helpers ─────────────────────────────────────────────────────────────────
  function survColor(pct: number): string {
    if (pct >= 0.50) return '#2d5a27'
    if (pct >= 0.30) return '#3a5020'
    if (pct >= 0.15) return '#5a4a10'
    if (pct >= 0.06) return '#5a2a10'
    if (pct >= 0.02) return '#4a1010'
    return '#2a0808'
  }
  function dmgColor(net: number): string {
    if (net >= 80) return '#1a4a2a'
    if (net >= 40) return '#2a4a1a'
    if (net >= 15) return '#3a3a10'
    return '#3a1a10'
  }
  function bossColor(rate: number): string {
    if (rate >= 0.75) return '#1a4a2a'
    if (rate >= 0.50) return '#3a4a10'
    if (rate >= 0.30) return '#5a3a10'
    return '#4a1010'
  }
  function round1(n: number): string { return n.toFixed(1) }
  function fmtPct(n: number, d: number): string { return d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(0)}%` }
  const CLS_COLOR: Record<ClassId, string> = { warrior: '#c87a3a', rogue: '#7ac85a', sorcerer: '#5a7ac8' }
  const CLS_LABEL: Record<ClassId, string> = { warrior: '⚔ Warrior', rogue: '† Rogue', sorcerer: '⊹ Sorcerer' }

  const floorCols = Array.from({ length: FLOOR_COUNT }, (_, i) => `<th>F${i + 1}</th>`).join('')

  // ── section builder ──────────────────────────────────────────────────────────
  function table(title: string, subtitle: string, body: string): string {
    return `
    <section>
      <h2>${title}</h2>
      ${subtitle ? `<p class="sub">${subtitle}</p>` : ''}
      <div class="tscroll"><table>${body}</table></div>
    </section>`
  }

  // ── survival ─────────────────────────────────────────────────────────────────
  let survBody = `<thead><tr><th>Class</th>${floorCols}</tr></thead><tbody>`
  for (const cls of CLASS_IDS) {
    const res = all[cls]
    survBody += `<tr><td class="cls" style="color:${CLS_COLOR[cls]}">${CLS_LABEL[cls]}</td>`
    for (let f = 0; f < FLOOR_COUNT; f++) {
      const reached = res.filter(r => r.floorReached > f || r.survived).length
      const p = reached / res.length
      survBody += `<td style="background:${survColor(p)};text-align:center">${fmtPct(reached, res.length)}</td>`
    }
    survBody += '</tr>'
  }
  survBody += '</tbody>'

  // ── fight duration ────────────────────────────────────────────────────────────
  let durBody = `<thead><tr><th>Class</th>${floorCols}</tr></thead><tbody>`
  for (const cls of CLASS_IDS) {
    const res = all[cls]
    durBody += `<tr><td class="cls" style="color:${CLS_COLOR[cls]}">${CLS_LABEL[cls]}</td>`
    for (let f = 0; f < FLOOR_COUNT; f++) {
      const vals = res.filter(r => r.floorAvgRounds[f] != null && r.floorAvgRounds[f] > 0).map(r => r.floorAvgRounds[f])
      const v = vals.length === 0 ? null : avg(vals)
      durBody += v == null ? '<td class="na">—</td>' : `<td style="text-align:center">${v.toFixed(1)}</td>`
    }
    durBody += '</tr>'
  }
  durBody += '</tbody>'

  // ── HP budget ─────────────────────────────────────────────────────────────────
  let hpBody = `<thead><tr><th>Class</th>${floorCols}</tr></thead><tbody>`
  for (const cls of CLASS_IDS) {
    const res = all[cls]
    hpBody += `<tr><td class="cls" style="color:${CLS_COLOR[cls]}">${CLS_LABEL[cls]}</td>`
    for (let f = 0; f < FLOOR_COUNT; f++) {
      const vals = res.filter(r => r.floorHpPct[f] != null).map(r => r.floorHpPct[f])
      const p = vals.length === 0 ? null : avg(vals)
      hpBody += p == null ? '<td class="na">—</td>'
        : `<td style="background:${survColor(p)};text-align:center">${(p * 100).toFixed(0)}%</td>`
    }
    hpBody += '</tr>'
  }
  hpBody += '</tbody>'

  // ── level progression ─────────────────────────────────────────────────────────
  const keyFloors = [0, 2, 4, 6, 9]
  const keyLabels = keyFloors.map(f => `<th>F${f + 1}</th>`).join('')
  let lvlBody = `<thead><tr><th>Class</th>${keyLabels}</tr></thead><tbody>`
  for (const cls of CLASS_IDS) {
    const res = all[cls]
    lvlBody += `<tr><td class="cls" style="color:${CLS_COLOR[cls]}">${CLS_LABEL[cls]}</td>`
    for (const f of keyFloors) {
      const vals = res.filter(r => r.levelAtFloor[f] != null).map(r => r.levelAtFloor[f])
      lvlBody += vals.length === 0 ? '<td class="na">—</td>' : `<td style="text-align:center">${avg(vals).toFixed(1)}</td>`
    }
    lvlBody += '</tr>'
  }
  lvlBody += '</tbody>'

  // ── loot ─────────────────────────────────────────────────────────────────────
  const lootKeys: QualKey[] = ['normal', 'magic', 'rare', 'unique', 'rune', 'gem']
  let lootBody = `<thead><tr><th>Class</th><th>Normal</th><th>Magic</th><th>Rare</th><th>Unique</th><th>Rune</th><th>Gem</th><th>Socketed</th><th>Total</th></tr></thead><tbody>`
  for (const cls of CLASS_IDS) {
    const res = all[cls]
    const avgs = lootKeys.map(k => avg(res.map(r => r.itemsFound[k])))
    const tot  = avgs.reduce((a, b) => a + b, 0)
    const sock = avg(res.map(r => r.gemsSocketed))
    lootBody += `<tr><td class="cls" style="color:${CLS_COLOR[cls]}">${CLS_LABEL[cls]}</td>`
    lootBody += avgs.map((v, i) => {
      const styles: Record<string, string> = { magic: 'color:#8888ff', rare: 'color:#ffaa22', unique: 'color:#c8a020' }
      const key = lootKeys[i]
      return `<td style="text-align:center;${styles[key] ?? ''}">${round1(v)}</td>`
    }).join('')
    lootBody += `<td style="text-align:center;color:#22cc88">${round1(sock)}</td>`
    lootBody += `<td style="text-align:center;font-weight:bold">${round1(tot)}</td>`
    lootBody += '</tr>'
  }
  lootBody += '</tbody>'

  // ── boss kill rate ────────────────────────────────────────────────────────────
  let bossBody = `<thead><tr><th>Class</th>${floorCols}</tr></thead><tbody>`
  for (const cls of CLASS_IDS) {
    const res = all[cls]
    bossBody += `<tr><td class="cls" style="color:${CLS_COLOR[cls]}">${CLS_LABEL[cls]}</td>`
    for (let f = 0; f < FLOOR_COUNT; f++) {
      const floor = f + 1
      if (!isBossFloor(floor)) { bossBody += '<td class="na" style="text-align:center">—</td>'; continue }
      const reached  = res.filter(r => r.floorReached >= floor || r.survived).length
      const survived = res.filter(r => r.floorReached > floor || r.survived).length
      const rate = reached === 0 ? 0 : survived / reached
      bossBody += `<td style="background:${bossColor(rate)};text-align:center">${fmtPct(survived, reached)}</td>`
    }
    bossBody += '</tr>'
  }
  bossBody += '</tbody>'

  // ── fight economics ───────────────────────────────────────────────────────────
  const econFloorCols = Array.from({ length: FLOOR_COUNT }, (_, i) => `<th>F${i + 1}</th>`).join('')
  let econBody = ''
  for (const cls of CLASS_IDS) {
    const res = all[cls]
    const dealt = Array.from({ length: FLOOR_COUNT }, (_, f) => {
      const v = res.filter(r => (r.floorDmgDealt[f] ?? 0) > 0).map(r => r.floorDmgDealt[f])
      return v.length === 0 ? null : avg(v)
    })
    const rcvd = Array.from({ length: FLOOR_COUNT }, (_, f) => {
      const v = res.filter(r => (r.floorDmgReceived[f] ?? 0) > 0).map(r => r.floorDmgReceived[f])
      return v.length === 0 ? null : avg(v)
    })
    const monHp = Array.from({ length: FLOOR_COUNT }, (_, f) => {
      const v = res.filter(r => (r.floorMonsterHp[f] ?? 0) > 0).map(r => r.floorMonsterHp[f])
      return v.length === 0 ? null : avg(v)
    })
    const net = Array.from({ length: FLOOR_COUNT }, (_, f) =>
      dealt[f] != null && rcvd[f] != null ? dealt[f]! - rcvd[f]! : null
    )

    econBody += `<thead><tr><th colspan="${FLOOR_COUNT + 1}" style="color:${CLS_COLOR[cls]};text-align:left;padding-left:8px">${CLS_LABEL[cls]}</th></tr>`
    econBody += `<tr><th>Metric</th>${econFloorCols}</tr></thead><tbody>`
    const row = (label: string, vals: (number | null)[], fmt: (v: number) => string, cellStyle?: (v: number) => string) => {
      let r = `<tr><td class="metric">${label}</td>`
      for (const v of vals) {
        if (v == null) { r += '<td class="na">—</td>'; continue }
        const bg = cellStyle ? `background:${cellStyle(v)};` : ''
        r += `<td style="${bg}text-align:center">${fmt(v)}</td>`
      }
      return r + '</tr>'
    }
    econBody += row('Player dmg/rd', dealt, v => v.toFixed(0), v => `hsl(${Math.min(120, v)}deg,50%,18%)`)
    econBody += row('Monster dmg/rd', rcvd, v => v.toFixed(0), v => `hsl(${Math.max(0, 30 - v)}deg,60%,18%)`)
    econBody += row('Monster avg HP', monHp, v => v.toFixed(0))
    econBody += row('Net dmg/rd', net, v => (v >= 0 ? '+' : '') + v.toFixed(0), v => dmgColor(v))
    econBody += '</tbody>'
  }

  // ── skill usage ───────────────────────────────────────────────────────────────
  let skillHtml = ''
  for (const cls of CLASS_IDS) {
    const res = all[cls]
    const tot: Record<string, number> = {}; let grand = 0
    for (const r of res) for (const [k, v] of Object.entries(r.skillCount)) { tot[k] = (tot[k] ?? 0) + v; grand += v }
    const sorted = Object.entries(tot).sort((a, b) => b[1] - a[1])
    skillHtml += `<div class="skill-group"><span class="skill-cls" style="color:${CLS_COLOR[cls]}">${CLS_LABEL[cls]}</span><div class="bars">`
    for (const [k, v] of sorted) {
      const p = grand > 0 ? (v / grand) * 100 : 0
      skillHtml += `<div class="bar-row"><span class="bar-label">${k}</span><div class="bar-wrap"><div class="bar-fill" style="width:${Math.round(p)}%;background:${CLS_COLOR[cls]}44;border-right:2px solid ${CLS_COLOR[cls]}"></div><span class="bar-pct">${p.toFixed(0)}%</span></div></div>`
    }
    skillHtml += '</div></div>'
  }

  // ── floor death distribution ──────────────────────────────────────────────────
  let deathDistBody = `<thead><tr><th>Class</th>${floorCols}<th>Deaths</th></tr></thead><tbody>`
  for (const cls of CLASS_IDS) {
    const dead  = all[cls].filter(r => !r.survived)
    const total = dead.length
    deathDistBody += `<tr><td class="cls" style="color:${CLS_COLOR[cls]}">${CLS_LABEL[cls]}</td>`
    for (let f = 0; f < FLOOR_COUNT; f++) {
      const floor = f + 1
      const n = dead.filter(r => r.floorReached === floor).length
      const p = total === 0 ? 0 : n / total
      const bg = p > 0.20 ? '#4a1010' : p > 0.12 ? '#3a1a08' : p > 0.06 ? '#1a1a08' : '#0f0e0c'
      deathDistBody += `<td style="background:${bg};text-align:center">${total === 0 ? '—' : fmtPct(n, total)}</td>`
    }
    deathDistBody += `<td style="text-align:center;color:#8a7050">${total.toLocaleString()}</td>`
    deathDistBody += '</tr>'
  }
  deathDistBody += '</tbody>'

  // ── death cause ───────────────────────────────────────────────────────────────
  let causeCols = ['Normal', 'Elite', 'Rare', 'Ancient', 'Boss'].map(t => `<th>${t}</th>`).join('')
  let causeBody = `<thead><tr><th>Class</th>${causeCols}<th>Avg HP% at Death</th></tr></thead><tbody>`
  for (const cls of CLASS_IDS) {
    const dead = all[cls].filter(r => !r.survived && r.deathCause)
    const n = dead.length
    causeBody += `<tr><td class="cls" style="color:${CLS_COLOR[cls]}">${CLS_LABEL[cls]}</td>`
    for (const t of ['normal', 'elite', 'rare', 'ancient', 'boss']) {
      const cnt = dead.filter(r => t === 'boss' ? r.deathCause!.isBoss : r.deathCause!.tier === t).length
      const p   = n === 0 ? 0 : cnt / n
      const color = t === 'rare' || t === 'ancient' ? `color:#cc8833` : t === 'boss' ? `color:#cc3333` : ''
      causeBody += `<td style="text-align:center;${color}">${n === 0 ? '—' : fmtPct(cnt, n)}</td>`
    }
    const hpDead = dead.filter(r => r.hpPctAtDeath != null)
    const avgHp  = hpDead.length === 0 ? 0 : hpDead.reduce((s, r) => s + r.hpPctAtDeath!, 0) / hpDead.length
    causeBody += `<td style="text-align:center">${(avgHp * 100).toFixed(0)}%</td>`
    causeBody += '</tr>'
  }
  causeBody += '</tbody>'

  // ── HP% at death histogram ────────────────────────────────────────────────────
  const hpBuckets = [[0, 0.10, '≤10%', 'dominated'], [0.10, 0.25, '11–25%', 'back foot'], [0.25, 0.50, '26–50%', 'fighting'], [0.50, 0.75, '51–75%', 'spike kill'], [0.75, 1.01, '76–100%', 'ambushed']] as [number, number, string, string][]
  let hpDeathBody = `<thead><tr><th>Class</th>${hpBuckets.map(b => `<th>${b[2]}<br><small>${b[3]}</small></th>`).join('')}</tr></thead><tbody>`
  for (const cls of CLASS_IDS) {
    const dead = all[cls].filter(r => !r.survived && r.hpPctAtDeath != null)
    const n = dead.length
    hpDeathBody += `<tr><td class="cls" style="color:${CLS_COLOR[cls]}">${CLS_LABEL[cls]}</td>`
    for (const [lo, hi] of hpBuckets) {
      const cnt = dead.filter(r => r.hpPctAtDeath! > lo && r.hpPctAtDeath! <= hi).length
      const p   = n === 0 ? 0 : cnt / n
      const bg  = p > 0.30 ? '#2a1a08' : '#0f0e0c'
      hpDeathBody += `<td style="background:${bg};text-align:center">${n === 0 ? '—' : fmtPct(cnt, n)}</td>`
    }
    hpDeathBody += '</tr>'
  }
  hpDeathBody += '</tbody>'

  // ── potion economy ─────────────────────────────────────────────────────────────
  let potBody = `<thead><tr><th>Class</th><th>Starting</th><th>Found</th><th>Total</th><th>Used</th><th>Net</th></tr></thead><tbody>`
  for (const cls of CLASS_IDS) {
    const res  = all[cls]
    const fnd  = avg(res.map(r => r.potionsFound))
    const used = avg(res.map(r => r.potionsUsed))
    const net  = STARTING_POTIONS + fnd - used
    const netColor = net < -0.5 ? '#cc3333' : net > 3 ? '#cc8833' : '#7acc7a'
    potBody += `<tr><td class="cls" style="color:${CLS_COLOR[cls]}">${CLS_LABEL[cls]}</td>`
    potBody += `<td style="text-align:center">${STARTING_POTIONS}</td>`
    potBody += `<td style="text-align:center">${fnd.toFixed(1)}</td>`
    potBody += `<td style="text-align:center">${(STARTING_POTIONS + fnd).toFixed(1)}</td>`
    potBody += `<td style="text-align:center">${used.toFixed(1)}</td>`
    potBody += `<td style="text-align:center;color:${netColor};font-weight:bold">${net >= 0 ? '+' : ''}${net.toFixed(1)}</td>`
    potBody += '</tr>'
  }
  potBody += '</tbody>'

  // ── equipment slot fill ────────────────────────────────────────────────────────
  const HTML_SLOTS: EquipSlot[] = ['weapon', 'offhand', 'helmet', 'chest', 'gloves', 'legs', 'boots', 'belt', 'ring1', 'ring2', 'amulet', 'circlet']
  const slotLabels = HTML_SLOTS.map(s => `<th>${s}</th>`).join('')
  let slotBody = `<thead><tr><th>Class</th>${slotLabels}</tr></thead><tbody>`
  for (const cls of CLASS_IDS) {
    const res = all[cls]
    slotBody += `<tr><td class="cls" style="color:${CLS_COLOR[cls]}">${CLS_LABEL[cls]}</td>`
    for (const slot of HTML_SLOTS) {
      const p = res.filter(r => r.endEquipped[slot] != null).length / res.length
      const bg = p < 0.10 ? '#3a1010' : p < 0.35 ? '#2a1a08' : p < 0.65 ? '#1a2a08' : '#0a2a0a'
      slotBody += `<td style="background:${bg};text-align:center">${fmtPct(res.filter(r => r.endEquipped[slot] != null).length, res.length)}</td>`
    }
    slotBody += '</tr>'
  }
  slotBody += '</tbody>'

  // ── avg slots filled per floor ─────────────────────────────────────────────────
  let slotsFloorBody = `<thead><tr><th>Class</th>${floorCols}</tr></thead><tbody>`
  for (const cls of CLASS_IDS) {
    const res = all[cls]
    slotsFloorBody += `<tr><td class="cls" style="color:${CLS_COLOR[cls]}">${CLS_LABEL[cls]}</td>`
    for (let f = 0; f < FLOOR_COUNT; f++) {
      const vals = res.filter(r => r.slotsFilled[f] != null).map(r => r.slotsFilled[f])
      const v = vals.length === 0 ? null : avg(vals)
      slotsFloorBody += v == null ? '<td class="na">—</td>' : `<td style="text-align:center">${v.toFixed(1)}</td>`
    }
    slotsFloorBody += '</tr>'
  }
  slotsFloorBody += '</tbody>'

  // ── resource pressure ─────────────────────────────────────────────────────────
  let resBody = `<thead><tr><th>Class</th><th>Mana Starve</th><th>Pots/Run</th><th>Boss Kills/Run</th><th>Gems Socketed/Run</th></tr></thead><tbody>`
  for (const cls of CLASS_IDS) {
    const res    = all[cls]
    const tFigh  = avg(res.map(r => r.totalCombats))
    const tStar  = avg(res.map(r => r.manaStarved))
    const mPct   = tFigh > 0 ? (tStar / tFigh) * 100 : 0
    const pots   = avg(res.map(r => r.potionsUsed))
    const bkills = avg(res.map(r => r.bossKills))
    const gems   = avg(res.map(r => r.gemsSocketed))
    const manaColor = mPct > 40 ? '#cc3333' : mPct > 15 ? '#cc8833' : mPct > 5 ? '#aaaa33' : '#336633'
    resBody += `<tr><td class="cls" style="color:${CLS_COLOR[cls]}">${CLS_LABEL[cls]}</td>`
    resBody += `<td style="text-align:center;color:${manaColor}">${mPct.toFixed(1)}%</td>`
    resBody += `<td style="text-align:center">${round1(pots)}</td>`
    resBody += `<td style="text-align:center">${round1(bkills)}</td>`
    resBody += `<td style="text-align:center;color:#22cc88">${round1(gems)}</td>`
    resBody += '</tr>'
  }
  resBody += '</tbody>'

  // ── flags ─────────────────────────────────────────────────────────────────────
  const flagsHtml = flags.map(f =>
    `<div class="flag ${f.ok ? 'flag-ok' : 'flag-warn'}"><span>${f.ok ? '✓' : '⚠'}</span> ${f.msg}</div>`
  ).join('')

  // ── full HTML ─────────────────────────────────────────────────────────────────
  const now = new Date().toLocaleString()
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>D2Game Balance Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0c0b09;
    color: #c8a96e;
    font-family: 'Courier New', Courier, monospace;
    font-size: 13px;
    padding: 24px;
    min-height: 100vh;
  }
  h1 {
    font-size: 22px;
    color: #e8c87e;
    border-bottom: 2px solid #5a3a10;
    padding-bottom: 8px;
    margin-bottom: 4px;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .meta { color: #8a7050; font-size: 11px; margin-bottom: 28px; }
  h2 {
    font-size: 13px;
    color: #e8c87e;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 4px;
    border-left: 3px solid #c87a3a;
    padding-left: 8px;
  }
  p.sub { color: #7a6040; font-size: 11px; margin-bottom: 8px; }
  section { margin-bottom: 32px; }
  .tscroll { overflow-x: auto; }
  table { border-collapse: collapse; min-width: 100%; }
  th, td {
    padding: 5px 10px;
    border: 1px solid #2a1e0e;
    font-size: 12px;
    white-space: nowrap;
  }
  th {
    background: #1a1205;
    color: #c8a060;
    font-weight: normal;
    text-align: center;
  }
  td.cls { font-weight: bold; min-width: 120px; }
  td.na { color: #4a3820; text-align: center; }
  td.metric { color: #9a8060; font-size: 11px; }
  tr:nth-child(even) td:not([style]) { background: #0f0e0c; }
  .flag { padding: 4px 10px; margin: 3px 0; border-radius: 2px; font-size: 12px; }
  .flag-ok   { background: #0a1a0a; border-left: 3px solid #4a8a4a; color: #7acc7a; }
  .flag-warn { background: #1a0a0a; border-left: 3px solid #8a3a3a; color: #cc6a6a; }
  .flag span { font-weight: bold; margin-right: 6px; }
  .skill-group { margin-bottom: 16px; }
  .skill-cls { font-weight: bold; font-size: 13px; display: block; margin-bottom: 6px; }
  .bars { display: flex; flex-direction: column; gap: 4px; }
  .bar-row { display: flex; align-items: center; gap: 8px; }
  .bar-label { min-width: 130px; color: #9a8060; font-size: 11px; }
  .bar-wrap { flex: 1; position: relative; background: #1a1205; height: 16px; border: 1px solid #2a1e0e; max-width: 500px; }
  .bar-fill { height: 100%; transition: width 0.3s; }
  .bar-pct { position: absolute; right: 6px; top: 0; line-height: 16px; font-size: 11px; color: #c8a060; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  @media (max-width: 900px) { .grid2 { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<h1>D2Game — Balance Report</h1>
<p class="meta">Generated ${now} &nbsp;|&nbsp; ${RUNS_PER_CLASS.toLocaleString()} runs/class &times; ${FLOOR_COUNT} floors &nbsp;|&nbsp; ${TILES_PER_FLOOR} tiles/floor &nbsp;|&nbsp; sloppy 2–8% &nbsp;|&nbsp; panic pot @ ${(PANIC_POT_HP_PCT * 100).toFixed(0)}% HP</p>

${table('Survival Rate', '% of all runs that REACHED each floor (F10 ≈ completion %)', survBody)}
${table('HP Budget', 'Avg HP% entering each floor (across all runs that reached it)', hpBody)}
${table('Fight Duration', 'Avg rounds per combat per floor', durBody)}
${table('Boss Kill Rate', 'Among runs that entered the boss floor — % that survived it', bossBody)}
${table('Level Progression', 'Avg character level entering key floors', lvlBody)}
${table('Fight Economics', 'Avg damage per round: player dealt vs received, and net tempo margin', econBody)}
${table('Floor Death Distribution', '% of all deaths that occurred on each floor — spike floors indicate bottlenecks', deathDistBody)}
${table('Death Cause by Tier', '% of deaths caused by each encounter type — reveals what kills players', causeBody)}
${table('HP% Entering Fatal Fight', 'How depleted was the player before dying? ≤10% = dominated, >50% = spike-killed', hpDeathBody)}
${table('Loot', 'Avg items found per run (all runs regardless of floor reached)', lootBody)}
${table('Equipment Slot Fill Rate', '% of runs with each slot filled at run end — red = gear gap in loot table', slotBody)}
${table('Avg Equipped Slots by Floor', 'How geared up players are as they progress (max 12 slots)', slotsFloorBody)}
${table('Potion Economy', 'Starting 5 + found vs used — positive net means safety margin, negative = deficit', potBody)}

<section>
  <h2>Skill Usage</h2>
  <p class="sub">% of all combat rounds using each action (attack = no skill used)</p>
  <div class="grid2">${skillHtml}</div>
</section>

${table('Resource Pressure', 'Mana starvation, potions, boss kills, gems socketed — all per run averages', resBody)}

<section>
  <h2>Balance Flags</h2>
  <p class="sub">Auto-detected balance issues and confirmations</p>
  ${flagsHtml}
</section>

</body>
</html>`

  require('fs').writeFileSync(OUT_PATH, html, 'utf8')
  console.log(`  HTML report written → ${OUT_PATH}\n`)
}
} // end if (import.meta.main)
