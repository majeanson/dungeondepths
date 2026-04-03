/**
 * Combat engine — fast gate model.
 * Supports: elemental damage, hit/miss, blocking, all class skills.
 * All stat fields optional for backward-compat with existing tests.
 */

import { type Rng, roll } from './rng'
import { RESIST_CAP_PCT } from './stats'
import { type LogEntry, type LogEntryType } from '../theme'
import type { MonsterInstance } from './monsters'
import type { SkillId } from '../data/skills'

export interface PlayerCombatStats {
  hp: number
  maxHp: number
  damage: [number, number]
  defense: number
  critChance: number    // 0-100
  attackSpeed: number   // 0-100
  stamina: number
  dexterity?: number
  blockChance?: number
  fireDamage?: number
  coldDamage?: number
  lightningDamage?: number
  fireResist?: number   // 0-75
  coldResist?: number   // 0-75
  lightResist?: number  // 0-75
  /** Sorcerer spell scaling: floor * 12 + level * 8 + gear.spellPower */
  spellPower?: number
  /** +N to Power Strike damage multiplier (warrior skill-boost affix) */
  skillBoostWarrior?:  number
  /** +N to Backstab crit multiplier (rogue skill-boost affix) */
  skillBoostRogue?:    number
  /** +N to Fireball spell multiplier (sorcerer skill-boost affix) */
  skillBoostSorcerer?: number
  /** 0–1 fraction of max stamina remaining. <0.25 = exhausted: block chance halved. */
  staminaPct?: number
}

export type CombatActionType = 'attack' | 'potion' | 'flee' | 'skill'

export interface CombatAction {
  type: CombatActionType
  healAmount?: number
  skillId?: SkillId

  // ── Warrior skills ──────────────────────────────────────────────────────
  damageMultiplier?: number          // power_strike: 2.0
  attackTwice?: boolean              // whirlwind: attack twice
  incomingDamageReduction?: number   // battle_cry: 0.35 = 35% less damage taken
  ironSkinBonus?: number             // iron_skin: flat defense added this round

  // ── Rogue skills ────────────────────────────────────────────────────────
  guaranteedCrit?: boolean           // backstab: force a crit
  critMultiplier?: number            // backstab: 2.0 (overrides default 1.75)
  skipMonsterAttack?: boolean        // reserved (unused after shadow_step rework)
  attackCount?: number               // rapid_strike: 3 hits
  perHitMultiplier?: number          // rapid_strike: 0.6× per hit
  bonusHitChance?: number            // rapid_strike: 0-100, % chance for an extra hit after count
  smokeScreenActive?: boolean        // smoke_bomb effect active: -55% monster hit

  // ── Sorcerer skills ─────────────────────────────────────────────────────
  healSelf?: number                  // meditate: restore HP
  skipPlayerAttack?: boolean         // meditate / smoke_bomb: skip attack phase
  fireSpellMult?: number             // fireball: spellPower × mult as fire dmg
  coldSpellMult?: number             // ice_blast: spellPower × mult as cold dmg
  hardChill?: boolean                // ice_blast: 50% hit penalty (vs default 20%)
  lightningSpellMult?: number        // spark / chain_lightning: spellPower × mult
  spellVarianceFlat?: number         // spark: roll(0, N) bonus added to lightning spell damage
  manaShieldActive?: boolean         // mana_shield: 72% incoming damage absorbed as mana for 3 rounds
}

export interface RoundResult {
  round: number
  action: CombatActionType
  skillId?: SkillId
  playerDamageDealt: number
  monsterDamageDealt: number
  elementalDealt: number
  elementalReceived: number
  playerHpAfter: number
  monsterHpAfter: number
  isCrit: boolean
  isMiss: boolean
  isBlocked: boolean
  monsterMissed: boolean
  statusEffect: 'chilled' | 'burning' | 'frozen' | null
  fled: boolean
  monsterDied: boolean
  playerDied: boolean
  /** Damage absorbed by Mana Shield — caller should call useMana(manaAbsorbed) */
  manaAbsorbed: number
  /** Boss mechanics flags for log display */
  isImmuneRound: boolean
  isEnragedRound: boolean
  bossRegenHp: number
  /** Fire damage dealt by Inferno Witch / Abyssal One ignition on immune rounds */
  bossIgnitionDmg: number
  /** True when double_strike mechanic triggered a second monster attack this round */
  isDoubleStrikeRound: boolean
  /** True when an elite/ancient blocked the player's physical attack this round. */
  monsterBlocked: boolean
}

/** Active status effects from previously cast skills — threaded into every action. */
export interface ActiveEffects {
  dmgReduction?: number
  ironBonus?: number
  smokeActive: boolean
  shieldActive: boolean
}

/** Map ActiveEffects to the four base CombatAction fields every skill carries. */
export function fxToBase(fx: ActiveEffects) {
  return {
    incomingDamageReduction: fx.dmgReduction,
    ironSkinBonus:           fx.ironBonus,
    smokeScreenActive:       fx.smokeActive,
    manaShieldActive:        fx.shieldActive,
  } as const
}

export interface CombatResult {
  outcome: 'victory' | 'defeat' | 'fled'
  rounds: RoundResult[]
  hpRemaining: number
  staminaCost: number
  xpGained: number
}

const MAX_ROUNDS = 50

// ── Hit-chance formula constants ──────────────────────────────────────────────
const RESIST_CAP              = RESIST_CAP_PCT / 100  // max resistance fraction (0.75)
const PLAYER_BASE_HIT         = 0.85   // base hit chance before dex/evasion
const PLAYER_HIT_MIN          = 0.50   // floor hit chance
const PLAYER_HIT_MAX          = 0.95   // cap hit chance
const PLAYER_DEX_HIT_BONUS    = 0.006  // hit% gained per dex point
const MONSTER_EVASION_PER_SPD = 0.07   // evasion penalty per monster speed unit
const MONSTER_BASE_HIT        = 0.65   // base monster hit chance
const MONSTER_HIT_MIN         = 0.50   // floor monster hit chance — even max evasion still lands half attacks
const MONSTER_HIT_MAX         = 0.90   // cap monster hit chance
const MONSTER_SPD_HIT_BONUS   = 0.06   // monster hit% per speed unit
const PLAYER_DEX_EVADE_BONUS  = 0.003  // monster hit% reduced per player dex point (was 0.004 — too strong)
// ─────────────────────────────────────────────────────────────────────────────

function applyResist(damage: number, resist: number): number {
  return Math.round(damage * (1 - Math.min(RESIST_CAP, resist / 100)))
}

function calcPlayerHitChance(dex: number, monsterSpeed: number): number {
  const evasion = monsterSpeed * MONSTER_EVASION_PER_SPD
  return Math.min(PLAYER_HIT_MAX, Math.max(PLAYER_HIT_MIN, PLAYER_BASE_HIT + dex * PLAYER_DEX_HIT_BONUS - evasion))
}

function calcMonsterHitChance(monsterSpeed: number, dex: number): number {
  return Math.min(MONSTER_HIT_MAX, Math.max(MONSTER_HIT_MIN, MONSTER_BASE_HIT + monsterSpeed * MONSTER_SPD_HIT_BONUS - dex * PLAYER_DEX_EVADE_BONUS))
}

function resolveRound(
  rng: Rng,
  round: number,
  action: CombatAction,
  playerHp: number,
  playerStats: PlayerCombatStats,
  monster: MonsterInstance,
): { result: RoundResult; newPlayerHp: number; newMonsterHp: number } {
  const dex = playerStats.dexterity ?? 0
  const baseDefense = playerStats.defense + (action.ironSkinBonus ?? 0)
  // Cursed: halves player's effective defense while in combat with this monster
  const effectiveDefense = monster.affixes.includes('cursed') ? Math.round(baseDefense * 0.5) : baseDefense
  const exhausted   = (playerStats.staminaPct ?? 1) < 0.25
  const blockChance = exhausted ? Math.round((playerStats.blockChance ?? 0) * 0.5) : (playerStats.blockChance ?? 0)

  let newPlayerHp        = playerHp
  let newMonsterHp       = monster.currentHp
  let playerDamageDealt  = 0
  let monsterDamageDealt = 0
  let elementalDealt     = 0
  let elementalReceived  = 0
  let isCrit          = false
  let isMiss          = false
  let isBlocked       = false
  let monsterMissed   = false
  let monsterBlocked  = false
  let manaAbsorbed    = 0
  let statusEffect: RoundResult['statusEffect'] = null

  // ── Flee ──────────────────────────────────────────────────────────────────
  if (action.type === 'flee') {
    return {
      result: {
        round, action: 'flee', skillId: undefined,
        playerDamageDealt: 0, monsterDamageDealt: 0,
        elementalDealt: 0, elementalReceived: 0,
        playerHpAfter: newPlayerHp, monsterHpAfter: newMonsterHp,
        isCrit: false, isMiss: false, isBlocked: false, monsterMissed: false, monsterBlocked: false,
        statusEffect: null, fled: true, monsterDied: false, playerDied: false,
        manaAbsorbed: 0, isImmuneRound: false, isEnragedRound: false, bossRegenHp: 0, bossIgnitionDmg: 0, isDoubleStrikeRound: false,
      },
      newPlayerHp,
      newMonsterHp,
    }
  }

  // ── Heal effects (potion / meditate) ─────────────────────────────────────
  if (action.type === 'potion') {
    const heal = action.healAmount ?? 30
    newPlayerHp = Math.min(playerStats.maxHp, newPlayerHp + heal)
  }
  if (action.type === 'skill' && action.healSelf) {
    newPlayerHp = Math.min(playerStats.maxHp, newPlayerHp + action.healSelf)
  }

  const skipAttack = action.skipPlayerAttack || action.type === 'potion'

  let coldLandedOnMonster = 0
  let fireLandedOnMonster = 0

  // ── Player attack ─────────────────────────────────────────────────────────
  function executePlayerAttack(hitIndex = 0) {
    if (skipAttack || newMonsterHp <= 0) return

    const hitChance = calcPlayerHitChance(dex, monster.speed)
    if (rng() >= hitChance) {
      if (hitIndex === 0) isMiss = true
      return
    }

    // Monster block check — elites/ancients can deflect physical hits
    // Crits and spells bypass monster block (crit = perfect timing; spells = magical)
    const forcedCrit = action.guaranteedCrit && hitIndex === 0
    if (!forcedCrit && monster.blockChance > 0 && rng() * 100 < monster.blockChance) {
      if (hitIndex === 0) monsterBlocked = true
      return
    }

    // Crit
    const thisCrit   = forcedCrit || roll(rng, 1, 100) <= playerStats.critChance
    if (hitIndex === 0) isCrit = thisCrit

    // Multipliers: skill mult × per-hit mult × crit mult
    const critMult    = thisCrit ? (action.critMultiplier ?? 1.75) : 1
    const skillMult   = action.damageMultiplier ?? 1
    const perHitMult  = action.perHitMultiplier ?? 1
    const base        = roll(rng, playerStats.damage[0], playerStats.damage[1])
    const phys        = Math.round(base * skillMult * perHitMult * critMult)
    playerDamageDealt += phys

    // Elemental (gear-based) — only on first hit
    if (hitIndex === 0) {
      const spellPow = playerStats.spellPower ?? 0

      // Monster enchanted affix resistances (50% reduction to matching element)
      const monFireRes  = monster.affixes.includes('fireEnchanted')      ? 50 : 0
      const monColdRes  = monster.affixes.includes('coldEnchanted')      ? 50 : 0
      const monLightRes = monster.affixes.includes('lightningEnchanted') ? 50 : 0

      // Spell-based elemental (Sorcerer skills override gear elemental)
      if (action.fireSpellMult) {
        const fd = applyResist(Math.round(spellPow * action.fireSpellMult), monFireRes)
        elementalDealt     += fd
        fireLandedOnMonster = fd
        statusEffect = 'burning'
      } else if (action.coldSpellMult) {
        const cd = applyResist(Math.round(spellPow * action.coldSpellMult), monColdRes)
        elementalDealt     += cd
        coldLandedOnMonster = cd
        statusEffect = action.hardChill ? 'frozen' : 'chilled'
      } else if (action.lightningSpellMult) {
        // Chain lightning normally ignores player resistance — monster enchanted still applies
        const ld = applyResist(Math.round(spellPow * action.lightningSpellMult), monLightRes)
        elementalDealt += ld
      } else {
        // Gear-based elemental
        const fd = applyResist(applyResist(playerStats.fireDamage      ?? 0, 0), monFireRes)
        const cd = applyResist(applyResist(playerStats.coldDamage      ?? 0, 0), monColdRes)
        const ld = applyResist(Math.round((playerStats.lightningDamage ?? 0) * 1.25), monLightRes)
        elementalDealt     += fd + cd + ld
        coldLandedOnMonster = cd
        fireLandedOnMonster = fd
        if (cd > 0)      statusEffect = 'chilled'
        else if (fd > 0) statusEffect = 'burning'
      }
    }

    newMonsterHp = Math.max(0, newMonsterHp - phys)
    if (hitIndex === 0) newMonsterHp = Math.max(0, newMonsterHp - elementalDealt)
  }

  // ── Monster attack ────────────────────────────────────────────────────────
  function executeMonsterAttack() {
    if (newMonsterHp <= 0) return
    if (action.skipMonsterAttack) { monsterMissed = true; return }

    // Chill/freeze penalty — teleporting monsters slip out of frozen/chilled
    let chilledPenalty = 0
    if (coldLandedOnMonster > 0 && !monster.affixes.includes('teleporting')) {
      chilledPenalty = statusEffect === 'frozen' ? 0.50 : 0.20
    }
    // Smoke bomb penalty — teleporting monsters reposition around the smoke (-55% hit, was -50%)
    const smokePenalty = action.smokeScreenActive && !monster.affixes.includes('teleporting') ? 0.55 : 0

    const mHitChance = Math.max(0.10, calcMonsterHitChance(monster.speed, dex) - chilledPenalty - smokePenalty)
    if (rng() >= mHitChance) {
      monsterMissed = true
      return
    }

    let rawDmg = roll(rng, monster.damage[0], monster.damage[1])
    if (isEnraged) rawDmg = Math.round(rawDmg * 1.5)
    let reduced  = Math.max(1, rawDmg - Math.round(effectiveDefense * 0.35))

    if (fireLandedOnMonster > 0) reduced = Math.round(reduced * 0.85)
    if (action.incomingDamageReduction) reduced = Math.round(reduced * (1 - action.incomingDamageReduction))

    if (blockChance > 0 && rng() * 100 < blockChance) {
      isBlocked = true
      reduced   = 0
    }

    monsterDamageDealt = reduced

    if (monster.affixes.includes('fireEnchanted')) {
      const fd = applyResist(Math.round(rawDmg * 0.40), playerStats.fireResist ?? 0)
      elementalReceived += fd
    }
    if (monster.affixes.includes('coldEnchanted')) {
      const cd = applyResist(Math.round(rawDmg * 0.40), playerStats.coldResist ?? 0)
      elementalReceived += cd
    }
    if (monster.affixes.includes('lightningEnchanted')) {
      const ld = applyResist(Math.round(rawDmg * 0.35), playerStats.lightResist ?? 0)
      elementalReceived += ld
    }

    const totalReceived = monsterDamageDealt + elementalReceived

    // Mana Shield: absorb 72% of incoming damage as mana for 3 rounds.
    // Buffed from 65%/2rnd: Hell's long fights (×3.4 HP monsters) reward tactical shield use.
    if (action.manaShieldActive && totalReceived > 0) {
      manaAbsorbed        = Math.round(totalReceived * 0.72)
      const hpDamage      = totalReceived - manaAbsorbed
      newPlayerHp         = Math.max(0, newPlayerHp - hpDamage)
      monsterDamageDealt  = Math.round(reduced * 0.28)
      elementalReceived   = Math.round(elementalReceived * 0.28)
    } else {
      newPlayerHp = Math.max(0, newPlayerHp - totalReceived)
    }
  }

  // ── Boss: immune_round (every 7th round — player deals 0) ─────────────────
  const isImmuneRound = round % 7 === 0 && monster.bossMechanics?.includes('immune_round')
  if (isImmuneRound) {
    playerDamageDealt = 0
    elementalDealt    = 0
    newMonsterHp      = monster.currentHp
  }

  // ── Boss: enrage (after round 5 → monster deals 1.5× damage) ─────────────
  const isEnraged = round > 5 && monster.bossMechanics?.includes('enrage')

  // ── Turn order + attack dispatch ──────────────────────────────────────────
  // extraFast: monster always acts before player regardless of speed stat
  const playerGoesFirst = !monster.affixes.includes('extraFast') && playerStats.attackSpeed >= monster.speed * 50

  // Sorcerer spells: skipPlayerAttack is true, but spell damage is in elementalDealt
  // We need a special case: if it's a spell skill, skip physical but apply elemental
  const isSpellSkill = !!(action.fireSpellMult || action.coldSpellMult || action.lightningSpellMult)

  function doPlayerTurn() {
    if (isSpellSkill && !skipAttack) {
      // Spell: no physical hit check, just apply elemental directly
      const spellPow = playerStats.spellPower ?? 0
      const monFireRes  = monster.affixes.includes('fireEnchanted')      ? 50 : 0
      const monColdRes  = monster.affixes.includes('coldEnchanted')      ? 50 : 0
      const monLightRes = monster.affixes.includes('lightningEnchanted') ? 50 : 0
      if (action.fireSpellMult) {
        const fd = applyResist(Math.round(spellPow * action.fireSpellMult), monFireRes)
        elementalDealt     += fd
        fireLandedOnMonster = fd
        statusEffect = 'burning'
      } else if (action.coldSpellMult) {
        const cd = applyResist(Math.round(spellPow * action.coldSpellMult), monColdRes)
        elementalDealt     += cd
        coldLandedOnMonster = cd
        statusEffect = action.hardChill ? 'frozen' : 'chilled'
      } else if (action.lightningSpellMult) {
        const base  = Math.round(spellPow * action.lightningSpellMult)
        const bonus = action.spellVarianceFlat ? roll(rng, 0, action.spellVarianceFlat) : 0
        const ld    = applyResist(base + bonus, monLightRes)
        elementalDealt += ld
      }
      newMonsterHp = Math.max(0, newMonsterHp - elementalDealt)
    } else if (action.attackCount && action.attackCount > 1) {
      for (let i = 0; i < action.attackCount; i++) executePlayerAttack(i)
      // Bonus hit proc (rapid_strike: 30% chance for a 4th hit)
      if (action.bonusHitChance && roll(rng, 1, 100) <= action.bonusHitChance) {
        executePlayerAttack(action.attackCount)
      }
    } else {
      executePlayerAttack(0)
      if (action.attackTwice && newMonsterHp > 0) executePlayerAttack(1)
    }
  }

  const isPotion = action.type === 'potion'

  if (playerGoesFirst) {
    if (!isImmuneRound) doPlayerTurn()
    if (!isPotion) executeMonsterAttack()
  } else {
    if (!isPotion) executeMonsterAttack()
    if (newPlayerHp > 0 && !isImmuneRound) doPlayerTurn()
  }

  // ── Boss: regen (per-boss regenRate % of maxHp per round, only if alive) ─
  let bossRegenHp = 0
  if (newMonsterHp > 0 && monster.bossMechanics?.includes('regen')) {
    const rate   = monster.regenRate ?? 0.03
    bossRegenHp  = Math.round(monster.maxHp * rate)
    newMonsterHp = Math.min(monster.maxHp, newMonsterHp + bossRegenHp)
  }

  // ── Boss: double_strike (second attack when enraged, if player still alive) ─
  let isDoubleStrikeRound = false
  if (isEnraged && monster.bossMechanics?.includes('double_strike') && newPlayerHp > 0 && newMonsterHp > 0) {
    executeMonsterAttack()
    isDoubleStrikeRound = true
  }

  // ── Boss: ignition (fire aura on immune rounds — player still takes damage) ─
  let bossIgnitionDmg = 0
  if (isImmuneRound && monster.bossMechanics?.includes('ignition') && newPlayerHp > 0) {
    bossIgnitionDmg = Math.max(10, Math.round(monster.maxHp * 0.025))
    const reduced   = Math.max(1, bossIgnitionDmg - Math.round((playerStats.fireResist ?? 0) * 0.4))
    newPlayerHp     = Math.max(0, newPlayerHp - reduced)
    bossIgnitionDmg = reduced
  }

  return {
    result: {
      round,
      action: action.type,
      skillId: action.skillId,
      playerDamageDealt,
      monsterDamageDealt,
      elementalDealt,
      elementalReceived,
      playerHpAfter:  newPlayerHp,
      monsterHpAfter: newMonsterHp,
      isCrit,
      isMiss,
      isBlocked,
      monsterMissed,
      statusEffect,
      fled:          false,
      monsterDied:   newMonsterHp <= 0,
      playerDied:    newPlayerHp <= 0,
      manaAbsorbed,
      isImmuneRound: isImmuneRound ?? false,
      isEnragedRound: isEnraged ?? false,
      bossRegenHp,
      bossIgnitionDmg,
      isDoubleStrikeRound,
      monsterBlocked,
    },
    newPlayerHp,
    newMonsterHp,
  }
}

export function simulateCombat(
  rng: Rng,
  playerStats: PlayerCombatStats,
  monster: MonsterInstance,
): CombatResult {
  let playerHp       = playerStats.hp
  let currentMonster = { ...monster }
  const rounds: RoundResult[] = []

  for (let i = 1; i <= MAX_ROUNDS; i++) {
    const { result, newPlayerHp, newMonsterHp } = resolveRound(
      rng, i, { type: 'attack' }, playerHp, playerStats, currentMonster,
    )
    rounds.push(result)
    playerHp       = newPlayerHp
    currentMonster = { ...currentMonster, currentHp: newMonsterHp }
    if (result.monsterDied || result.playerDied) break
  }

  const outcome: CombatResult['outcome'] = currentMonster.currentHp <= 0 ? 'victory' : 'defeat'
  return {
    outcome,
    rounds,
    hpRemaining: playerHp,
    staminaCost: rounds.length * 2,
    xpGained:    outcome === 'victory' ? monster.xp : 0,
  }
}

export function applyCombatAction(
  rng: Rng,
  action: CombatAction,
  roundNumber: number,
  playerHp: number,
  playerStats: PlayerCombatStats,
  monster: MonsterInstance,
): { result: RoundResult; newPlayerHp: number; newMonsterHp: number } {
  return resolveRound(rng, roundNumber, action, playerHp, playerStats, monster)
}

export function roundToText(r: RoundResult): string {
  if (r.fled) return `Round ${r.round}: Fled from combat!`

  const parts: string[] = []

  if (r.isMiss) {
    parts.push('Miss!')
  } else if (r.action === 'skill' && (r.skillId === 'meditate' || r.skillId === 'smoke_bomb' || r.skillId === 'iron_skin')) {
    // No attack
  } else if (r.action !== 'potion') {
    const critTag = r.isCrit ? ' CRIT!' : ''
    let dmgStr: string
    if (r.playerDamageDealt === 0 && r.elementalDealt > 0) {
      // Pure spell: show elemental total directly
      dmgStr = `${r.elementalDealt}${critTag}`
    } else {
      dmgStr = `${r.playerDamageDealt}${critTag}`
      if (r.elementalDealt > 0) dmgStr += ` +${r.elementalDealt} elemental`
    }

    // Skill-specific labels
    if (r.action === 'skill') {
      const labels: Partial<Record<SkillId, string>> = {
        power_strike:    'Power Strike',
        whirlwind:       'Whirlwind',
        backstab:        'Backstab',
        shadow_step:     'Shadow Strike',
        rapid_strike:    'Rapid Strike',
        fireball:        'Fireball',
        ice_blast:       'Ice Blast',
        chain_lightning: 'Chain Lightning',
      }
      if (r.skillId === 'rapid_strike') {
        dmgStr = `Rapid Strike: 3-4 hits — ${r.playerDamageDealt}${critTag} total`
      } else if (r.skillId && labels[r.skillId]) {
        dmgStr = `${labels[r.skillId]}: ${dmgStr}`
      }
    }

    const mStatus = r.monsterDied ? ' [DEAD]' : ` (enemy HP:${r.monsterHpAfter})`
    parts.push(`Dealt ${dmgStr}${mStatus}`)
  }

  // Status effects
  if (r.statusEffect === 'frozen')  parts.push('Frozen! (enemy -50% hit chance)')
  else if (r.statusEffect === 'chilled') parts.push('Chilled! (enemy -20% hit chance)')
  else if (r.statusEffect === 'burning') parts.push('Burning! (-15% enemy phys)')

  // Skill announcements
  if (r.action === 'skill') {
    if (r.skillId === 'battle_cry')   parts.push('Battle Cry! -35% damage taken for 2 rounds')
    if (r.skillId === 'iron_skin')    parts.push('Iron Skin! +30 defense for 2 rounds')
    if (r.skillId === 'meditate')     parts.push('Meditate — +30 mana/turn for 3 turns (monster still attacks)')
    if (r.skillId === 'smoke_bomb')   parts.push('Smoke Bomb! Enemy -55% hit for 2 rounds')
    if (r.skillId === 'mana_shield')  parts.push('Mana Shield! 72% damage absorbed by mana for 3 rounds')
  }

  if (r.monsterBlocked)   parts.push('◫ Blocked! (enemy deflected the blow)')
  if (r.manaAbsorbed > 0) parts.push(`Mana Shield absorbed ${r.manaAbsorbed}`)
  if (r.isImmuneRound)    parts.push('IMMUNE! (boss shrugs off all damage this round)')
  if (r.isEnragedRound)   parts.push('ENRAGED! (boss damage ×1.5)')
  if (r.bossRegenHp)      parts.push(`Boss regenerated ${r.bossRegenHp} HP`)
  if (r.bossIgnitionDmg)     parts.push(`🔥 IGNITION — fire aura burns for ${r.bossIgnitionDmg}`)
  if (r.isDoubleStrikeRound) parts.push('⚡ DOUBLE STRIKE!')

  if (r.action === 'potion') {
    // potions are free actions — monster doesn't attack this turn
  } else if (r.monsterMissed) {
    parts.push('Enemy missed!')
  } else if (r.isBlocked) {
    parts.push('Blocked!')
  } else if (!r.monsterDied) {
    let recvStr = `${r.monsterDamageDealt}`
    if (r.elementalReceived > 0) recvStr += ` +${r.elementalReceived} elemental`
    parts.push(`Received ${recvStr}${r.playerDied ? ' [DEAD]' : ` (HP:${r.playerHpAfter})`}`)
  }

  return parts.join(' | ') || `Round ${r.round}`
}

/** Classify a RoundResult into a LogEntryType for structured color dispatch. */
function classifyRound(r: RoundResult): LogEntryType {
  if (r.fled)           return 'default'
  if (r.isEnragedRound) return 'enraged'
  if (r.isImmuneRound)  return 'immune'
  if (r.isCrit)         return 'crit'
  if (r.playerDamageDealt > 0 || r.elementalDealt > 0) return 'dealt'
  if (r.monsterDamageDealt > 0 || r.elementalReceived > 0) return 'received'
  return 'default'
}

/** Convert a RoundResult to a structured LogEntry. */
export function roundToEntry(r: RoundResult): LogEntry {
  return { text: roundToText(r), type: classifyRound(r) }
}
