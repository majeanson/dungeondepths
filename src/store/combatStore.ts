import { create } from 'zustand'
import { makeRng } from '../engine/rng'
import { applyCombatAction, roundToEntry, type PlayerCombatStats, type CombatAction } from '../engine/combat'
import { type LogEntry } from '../theme'
import { buildWarriorAction } from '../engine/skills/warrior'
import { buildRogueAction } from '../engine/skills/rogue'
import { buildSorcererAction } from '../engine/skills/sorcerer'
import {
  tickCounters, applySkillCounters, buildActiveEffects, ZERO_COUNTERS,
  type StatusCounters,
} from '../engine/statusEffects'
import type { MonsterInstance } from '../engine/monsters'
import type { Item } from '../engine/loot'
import type { EquipSlot } from '../engine/inventory'
import { rollLoot, generateTownPortalScroll, generateHpPotion, generateManaPotion, generateStaminaPotion } from '../engine/loot'
import { EncounterType } from '../engine/encounter'
import { SKILLS, type SkillId } from '../data/skills'
import { MONSTER_AFFIXES } from '../data/monsters'
import { type ClassId } from '../data/classes'
import { buildPlayerStats, } from '../engine/stats'
import { applyTierScaling } from '../engine/monsters'
import { useGameStore } from './gameStore'
import { useInventoryStore } from './inventoryStore'
import { useGridStore, STAMINA_MAX } from './gridStore'

export interface CombatState {
  monster:              MonsterInstance | null
  encounterType:        EncounterType | null
  playerHp:             number
  playerMaxHp:          number
  monsterHp:            number
  roundNumber:          number
  log:                  LogEntry[]
  townPortalScrolls:    number
  outcome:              'ongoing' | 'victory' | 'defeat' | 'fled' | null
  pendingLoot:          Item[]

  // ── Status round counters ────────────────────────────────────────────────
  statusCounters: StatusCounters

  /** Last skill used this combat — tracks Shadow Step → Backstab combo. */
  lastSkillUsed: SkillId | null

  startCombat:      (monster: MonsterInstance, type: EncounterType, floor: number, playerStats: PlayerCombatStats) => void
  attackAction:     (playerStats: PlayerCombatStats, floor: number, magicFind: number) => void
  skillAction:      (skillId: SkillId, playerStats: PlayerCombatStats, floor: number, magicFind: number) => void
  potionAction:     (playerStats: PlayerCombatStats, floor: number, magicFind: number) => void
  manaPotionAction:     (playerStats: PlayerCombatStats, floor: number, magicFind: number) => void
  staminaPotionAction:  () => void
  fleeAction:           () => void
  clearCombat:      () => void
  /** Call when starting a new run to refill HP potions and reset scrolls */
  refillPotions:    () => void
  /** Add 1 Town Portal Scroll (capped at 3) */
  gainScroll:       () => void
  /** Set chest loot for display on LootScreen without starting combat. */
  openChest:        (items: Item[]) => void
}

/** Append entries to log, keeping a rolling window of the last 4 prior lines. */
function appendLog(log: LogEntry[], ...entries: LogEntry[]): LogEntry[] {
  return [...log.slice(-4), ...entries]
}

/** Create a LogEntry with type 'default' from a plain string. */
function le(text: string, type: LogEntry['type'] = 'default'): LogEntry {
  return { text, type }
}

/** Find the first item of a given baseId in the bag. */
function findPotion(bagItems: Record<string, import('../engine/loot').Item>, baseId: string) {
  return Object.values(bagItems).find(it => it.baseId === baseId)
}

/** 10% of max HP restored after each combat win — "catch your breath" */
const POST_COMBAT_RECOVERY = 0.10

// Skill routing — kept at module level to avoid re-allocation on every action
const WARRIOR_SKILL_IDS = new Set(['power_strike', 'battle_cry', 'iron_skin', 'whirlwind'])
const ROGUE_SKILL_IDS   = new Set(['backstab', 'shadow_step', 'rapid_strike', 'smoke_bomb'])

// O(1) skill definition lookup
const SKILLS_MAP = new Map(SKILLS.map(s => [s.id, s]))

function handleVictory(
  monster: MonsterInstance,
  floor: number,
  magicFind: number,
  encounterType: EncounterType,
  playerHp: number,
  playerMaxHp: number,
  roundNumber: number,
): { pendingLoot: Item[]; victoryLog: LogEntry[]; recoveredHp: number } {
  const seed    = useGameStore.getState().seed
  const pact    = useGameStore.getState().activePact
  const mfBonus = (pact === 'blood' ? 50 : 0) + (pact === 'exhaustion' ? 25 : 0)
  // Include monster type + tile position so every encounter produces unique loot
  const monsterHash = monster.defId.split('').reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0) >>> 0
  const { playerPos } = useGridStore.getState()
  const posHash = ((playerPos.x * 73856093) ^ (playerPos.y * 19349663)) >>> 0
  const lootRng = makeRng(seed ^ (floor * 0x9e3779b9) ^ (roundNumber * 0x6b429177) ^ monsterHash ^ posHash ^ 0x31337)
  const noPotions = pact === 'frailty'
  const loot = rollLoot(lootRng, encounterType, floor, magicFind + mfBonus, noPotions)
  // Pact of Frailty: auto-identify all drops
  if (pact === 'frailty') loot.forEach(item => { item.identified = true })
  // Study bonus: unique items always identified
  const studiedBonuses = useGameStore.getState().careerStats.studiedBonuses
  if (studiedBonuses.includes('unique')) {
    loot.forEach(item => { if (item.quality === 'unique') item.identified = true })
  }
  const pendingLoot = loot
  const victoryLog: LogEntry[] = []
  victoryLog.push(le(`Victory! ${monster.name} defeated.`, 'victory'))
  for (const item of pendingLoot) {
    const type: LogEntry['type'] =
      item.quality === 'unique' ? 'crit' :
      item.quality === 'rare'   ? 'xp'   :
      item.quality === 'magic'  ? 'scroll' : 'victory'
    const prefix = item.quality === 'unique' ? '★ ' : item.quality === 'rare' ? '◆ ' : item.quality === 'magic' ? '◈ ' : '· '
    victoryLog.push(le(`${prefix}${item.displayName}`, type))
  }
  const prevLevel = useGameStore.getState().level
  const xpMult    = pact === 'suffering' ? 1.3 : 1
  const xpGained  = Math.round(monster.xp * xpMult)
  useGameStore.getState().gainXp(xpGained)
  useGameStore.getState().recordKill()
  const afterLevel = useGameStore.getState().level
  const xpLabel    = xpMult > 1 ? `+${xpGained} XP  ☠ ×${xpMult}` : `+${xpGained} XP`
  victoryLog.push(le(xpLabel, 'xp'))
  if (afterLevel > prevLevel) victoryLog.push(le(`★ LEVEL UP! Now level ${afterLevel} — +HP +Mana`, 'levelUp'))
  // Town Portal Scroll drop: chest=always, boss=50%, ancient=20%, elite/rare=10%
  const scrollChance: Partial<Record<EncounterType, number>> = {
    [EncounterType.Boss]:    0.50,
    [EncounterType.Ancient]: 0.20,
    [EncounterType.Elite]:   0.10,
    [EncounterType.Rare]:    0.10,
    [EncounterType.Chest]:   1.00,
  }
  const chance = scrollChance[encounterType] ?? 0
  if (chance > 0 && lootRng() < chance) {
    const ok = useInventoryStore.getState().addItem(generateTownPortalScroll())
    if (ok) victoryLog.push(le('📜 Town Portal Scroll added to bag!', 'scroll'))
  }
  // Post-combat recovery: restore mana + a portion of HP
  useGameStore.getState().restoreMana(5)
  const recoveryAmt = Math.round(playerMaxHp * POST_COMBAT_RECOVERY)
  const recoveredHp = Math.min(playerMaxHp, playerHp + recoveryAmt)
  if (recoveryAmt > 0) victoryLog.push(le(`✦ You catch your breath — +${recoveryAmt} HP`, 'heal'))
  return { pendingLoot, victoryLog, recoveredHp }
}

export const useCombatStore = create<CombatState>((set, get) => ({
  monster:               null,
  encounterType:         null,
  playerHp:              80,
  playerMaxHp:           80,
  monsterHp:             0,
  roundNumber:           0,
  log:                   [],
  townPortalScrolls:     0,
  outcome:               null,
  pendingLoot:           [],
  statusCounters: { ...ZERO_COUNTERS },
  lastSkillUsed:  null,

  startCombat: (monster, type, floor, playerStats) => {
    const gs        = useGameStore.getState()
    const currentHp = gs.playerHp
    const maxHp     = gs.playerMaxHp
    const scaled    = applyTierScaling(monster, gs.tier)

    const initLog: LogEntry[] = [le(`Encountered: ${scaled.displayName}  (HP ${currentHp}/${maxHp})`)]
    if (scaled.affixes.length > 0) {
      const affixNames = scaled.affixes
        .map(a => MONSTER_AFFIXES[a as keyof typeof MONSTER_AFFIXES]?.name ?? a)
        .join('  ·  ')
      initLog.push(le(`Affixes: ${affixNames}`, 'enraged'))
    }

    set({
      monster:               scaled,
      encounterType:         type,
      playerHp:              currentHp,
      playerMaxHp:           maxHp,
      monsterHp:             scaled.maxHp,
      roundNumber:    0,
      log:            initLog,
      outcome:        'ongoing',
      pendingLoot:    [],
      statusCounters: { ...ZERO_COUNTERS },
      lastSkillUsed:  null,
    })
  },

  attackAction: (playerStats, floor, magicFind) => {
    const { monster, playerHp, monsterHp, roundNumber, log, statusCounters } = get()
    if (!monster || get().outcome !== 'ongoing') return

    const seed           = useGameStore.getState().seed
    const rng            = makeRng(seed ^ (floor * 0x9e3779b9) ^ (roundNumber * 0x6b429177))
    const currentMonster = { ...monster, currentHp: monsterHp }
    const round          = roundNumber + 1
    const gridSt         = useGridStore.getState()
    const staminaPct     = gridSt.stamina / STAMINA_MAX
    const statsWithStam  = { ...playerStats, staminaPct }

    // ── Meditate regen tick (mana only) ───────────────────────────────────
    const MEDITATE_MANA_PER_TURN = 20
    let regenHp = playerHp
    let regenLog = log
    if (statusCounters.meditateRoundsLeft > 0) {
      useGameStore.getState().restoreMana(MEDITATE_MANA_PER_TURN)
      regenLog = appendLog(log, le(`✦ Meditate — +${MEDITATE_MANA_PER_TURN} mana (${statusCounters.meditateRoundsLeft} left)`, 'heal'))
    }

    // ── Poison tick (applied before attack resolution) ─────────────────────
    let poisonHp = regenHp
    if (statusCounters.poisonRoundsLeft > 0) {
      const pdmg = statusCounters.poisonDmgPerRound
      poisonHp = Math.max(0, regenHp - pdmg)
      regenLog = appendLog(regenLog, le(`☠ Poisoned! −${pdmg} HP (${statusCounters.poisonRoundsLeft} rounds left)`, 'poison'))
    }

    const fx = buildActiveEffects(statusCounters)
    const pactBloodPenalty = useGameStore.getState().activePact === 'blood' ? -0.35 : 0
    const { result, newPlayerHp: rawMonsterHp, newMonsterHp } = applyCombatAction(
      rng,
      { type: 'attack', incomingDamageReduction: (fx.dmgReduction ?? 0) + pactBloodPenalty, ironSkinBonus: fx.ironBonus,
        smokeScreenActive: fx.smokeActive, manaShieldActive: fx.shieldActive },
      round, poisonHp, statsWithStam, currentMonster,
    )
    // Reconcile player HP: poison damage already applied above
    let newPlayerHp = rawMonsterHp

    if (result.manaAbsorbed > 0) useGameStore.getState().useMana(result.manaAbsorbed)

    const newLog = appendLog(regenLog, roundToEntry(result))

    // ── Poison application — poisonous monster landed a hit ────────────────
    let newStatusCounters = tickCounters(statusCounters)
    if (monster.affixes.includes('poisonous') && result.monsterDamageDealt > 0 && rng() < 0.30) {
      const pdmg = Math.max(2, Math.round(monster.damage[0] * 0.15))
      newStatusCounters = { ...newStatusCounters, poisonRoundsLeft: 3, poisonDmgPerRound: pdmg }
      newLog.push(le(`☠ POISONED — ${pdmg} damage per round for 3 rounds!`, 'poison'))
    }

    const outcome: CombatState['outcome'] =
      result.monsterDied ? 'victory' :
      (result.playerDied || poisonHp <= 0) ? 'defeat' : 'ongoing'

    let pendingLoot: Item[] = []
    let finalHp = newPlayerHp
    if (outcome === 'victory') {
      const encType = get().encounterType ?? EncounterType.Normal
      const v = handleVictory(monster, floor, magicFind, encType, newPlayerHp, statsWithStam.maxHp, round)
      pendingLoot = v.pendingLoot
      newLog.push(...v.victoryLog)
      finalHp = v.recoveredHp
      // Drain stamina: 1 per round fought. Cursed monsters cost 50% more.
      const cursedMult = monster.affixes.includes('cursed') ? 1.5 : 1
      const staminaDrain = Math.ceil(round * cursedMult)
      gridSt.drainStamina(staminaDrain)
      if (useGridStore.getState().stamina <= 0)
        newLog.push(le('⚡ Exhausted! Block chance halved until you rest.', 'enraged'))
    } else if (outcome === 'defeat') {
      const gs = useGameStore.getState()
      if (!gs.lastStandUsed) {
        gs.useLastStand()
        gs.setPlayerHp(1)
        newLog.push(le('✦ LAST STAND — clinging to life at 1 HP!', 'levelUp'))
        set({ playerHp: 1, monsterHp: newMonsterHp, roundNumber: round,
              log: newLog, outcome: 'ongoing', pendingLoot: [],
              statusCounters: newStatusCounters })
        return
      }
      newLog.push(le('Defeated...', 'defeat'))
    }

    set({ playerHp: finalHp, monsterHp: newMonsterHp, roundNumber: round,
          log: newLog, outcome, pendingLoot,
          statusCounters: newStatusCounters })
  },

  skillAction: (skillId, playerStats, floor, magicFind) => {
    const { monster, playerHp, monsterHp, roundNumber, log, statusCounters, lastSkillUsed } = get()
    if (!monster || get().outcome !== 'ongoing') return

    const skillDef = SKILLS_MAP.get(skillId)
    if (!skillDef) return

    // Cooldown guard
    const cooldownLeft =
      skillId === 'iron_skin'  ? statusCounters.ironSkinCooldown :
      skillId === 'smoke_bomb' ? statusCounters.smokeBombCooldown : 0
    if (cooldownLeft > 0) {
      set(s => ({ log: appendLog(s.log, le(`${skillDef.name} on cooldown — ${cooldownLeft} round${cooldownLeft !== 1 ? 's' : ''} left`)) }))
      return
    }

    const gs = useGameStore.getState()
    if (skillDef.manaCost > 0 && gs.mana < skillDef.manaCost) return
    if (skillDef.manaCost > 0) gs.useMana(skillDef.manaCost)

    const seed           = useGameStore.getState().seed
    const rng            = makeRng(seed ^ (floor * 0x9e3779b9) ^ (roundNumber * 0x6b429177) ^ 0x77)
    const currentMonster = { ...monster, currentHp: monsterHp }
    const round          = roundNumber + 1

    const fx = buildActiveEffects(statusCounters)
    const skillPactBloodPenalty = useGameStore.getState().activePact === 'blood' ? -0.35 : 0
    const action: CombatAction = WARRIOR_SKILL_IDS.has(skillId)
      ? { ...buildWarriorAction(skillId, fx, playerStats), incomingDamageReduction: (fx.dmgReduction ?? 0) + skillPactBloodPenalty }
      : ROGUE_SKILL_IDS.has(skillId)
        ? { ...buildRogueAction(skillId, fx, playerStats), incomingDamageReduction: (fx.dmgReduction ?? 0) + skillPactBloodPenalty }
        : { ...buildSorcererAction(skillId, fx, playerStats), incomingDamageReduction: (fx.dmgReduction ?? 0) + skillPactBloodPenalty }

    // ── Poison tick before skill resolution ────────────────────────────────
    let skillStartHp = playerHp
    let skillPreLog = log
    if (statusCounters.poisonRoundsLeft > 0) {
      const pdmg = statusCounters.poisonDmgPerRound
      skillStartHp = Math.max(0, playerHp - pdmg)
      skillPreLog = appendLog(log, le(`☠ Poisoned! −${pdmg} HP (${statusCounters.poisonRoundsLeft} rounds left)`, 'poison'))
    }

    const { result, newPlayerHp: rawSkillHp, newMonsterHp } = applyCombatAction(
      rng, action, round, skillStartHp, playerStats, currentMonster,
    )
    let newPlayerHp = rawSkillHp

    // First tick mana for meditate (mana only, 20 per turn)
    if (skillId === 'meditate') gs.restoreMana(20)
    if (result.manaAbsorbed > 0) gs.useMana(result.manaAbsorbed)

    const newLog = appendLog(skillPreLog, roundToEntry(result))

    // Shadow Step → Backstab combo indicator
    if (skillId === 'backstab' && lastSkillUsed === 'shadow_step') {
      newLog.push(le('☠ SHADOW CRIT — shadow setup amplifies the strike!', 'crit'))
    }

    // ── Poison application — poisonous monster landed a hit ────────────────
    let newStatusCounters = applySkillCounters(skillId, statusCounters)
    if (monster.affixes.includes('poisonous') && result.monsterDamageDealt > 0 && rng() < 0.30) {
      const pdmg = Math.max(2, Math.round(monster.damage[0] * 0.15))
      newStatusCounters = { ...newStatusCounters, poisonRoundsLeft: 3, poisonDmgPerRound: pdmg }
      newLog.push(le(`☠ POISONED — ${pdmg} damage per round for 3 rounds!`, 'poison'))
    }

    const outcome: CombatState['outcome'] =
      result.monsterDied ? 'victory' :
      (result.playerDied || skillStartHp <= 0) ? 'defeat' : 'ongoing'

    let pendingLoot: Item[] = []
    let finalHp = newPlayerHp
    if (outcome === 'victory') {
      const encType = get().encounterType ?? EncounterType.Normal
      const v = handleVictory(monster, floor, magicFind, encType, newPlayerHp, playerStats.maxHp, round)
      pendingLoot = v.pendingLoot
      newLog.push(...v.victoryLog)
      finalHp = v.recoveredHp
      const cursedMult2 = monster.affixes.includes('cursed') ? 1.5 : 1
      useGridStore.getState().drainStamina(Math.ceil(round * cursedMult2))
      if (useGridStore.getState().stamina <= 0)
        newLog.push(le('⚡ Exhausted! Block chance halved until you rest.', 'enraged'))
    } else if (outcome === 'defeat') {
      const gs2 = useGameStore.getState()
      if (!gs2.lastStandUsed) {
        gs2.useLastStand()
        gs2.setPlayerHp(1)
        newLog.push(le('✦ LAST STAND — clinging to life at 1 HP!', 'levelUp'))
        set({ playerHp: 1, monsterHp: newMonsterHp, roundNumber: round,
              log: newLog, outcome: 'ongoing', pendingLoot: [],
              statusCounters: newStatusCounters,
              lastSkillUsed: skillId })
        return
      }
      newLog.push(le('Defeated...', 'defeat'))
    }

    set({ playerHp: finalHp, monsterHp: newMonsterHp, roundNumber: round,
          log: newLog, outcome, pendingLoot,
          statusCounters: newStatusCounters,
          lastSkillUsed: skillId })
  },

  potionAction: (_playerStats, _floor, _magicFind) => {
    const { outcome } = get()
    if (outcome !== 'ongoing') return
    const inv        = useInventoryStore.getState()
    const potionItem = findPotion(inv.bag.items, 'hp_potion')
    if (!potionItem) return
    inv.dropItem(potionItem.uid)
    const healAmount = (potionItem.effectiveStats as Record<string, number>).heal ?? 60
    // Potions are instant — no monster counter-attack
    set(s => ({
      playerHp: Math.min(s.playerMaxHp, s.playerHp + healAmount),
      log:      appendLog(s.log, le(`⚗ ${potionItem.displayName} — +${healAmount} HP`, 'heal')),
    }))
  },

  fleeAction: () => {
    const { monster } = get()
    if (monster?.bossMechanics?.includes('no_flee')) {
      set(s => ({ log: appendLog(s.log, le('Cannot flee from a boss!')) }))
      return
    }
    if (useGridStore.getState().stamina <= 0) {
      set(s => ({ log: appendLog(s.log, le('⚡ Too exhausted to flee — fight it out!', 'enraged')) }))
      return
    }
    set(s => ({
      outcome: 'fled',
      log:     appendLog(s.log, le('Fled from combat!')),
    }))
  },

  staminaPotionAction: () => {
    const { outcome } = get()
    if (outcome !== 'ongoing') return
    const inv        = useInventoryStore.getState()
    const potionItem = findPotion(inv.bag.items, 'stamina_potion')
    if (!potionItem) return
    inv.dropItem(potionItem.uid)
    const restoreAmt = (potionItem.effectiveStats as Record<string, number>).restore ?? 40
    useGridStore.getState().restoreStamina(restoreAmt)
    set(s => ({
      log: appendLog(s.log, le(`⚡ ${potionItem.displayName} — +${restoreAmt} Stamina`, 'heal')),
    }))
  },

  manaPotionAction: (_playerStats, _floor, _magicFind) => {
    const { outcome } = get()
    if (outcome !== 'ongoing') return

    const inv        = useInventoryStore.getState()
    const potionItem = findPotion(inv.bag.items, 'mana_potion')
    if (!potionItem) return
    inv.dropItem(potionItem.uid)

    const manaRestored = (potionItem.effectiveStats as Record<string, number>).restore ?? 40
    useGameStore.getState().restoreMana(manaRestored)
    // Potions are instant — no monster counter-attack
    set(s => ({
      log: appendLog(s.log, le(`💧 ${potionItem.displayName} — +${manaRestored} MP`, 'heal')),
    }))
  },

  clearCombat: () => {
    const { playerHp, outcome, encounterType } = get()
    if (outcome === 'victory' || outcome === 'fled') {
      useGameStore.getState().setPlayerHp(playerHp)
    }
    if (outcome === 'victory' && encounterType === EncounterType.Boss) {
      useGridStore.getState().markBossDefeated()
      // Victory condition: defeat a boss at absolute floor 30+ (The Abyssal One)
      const { floor, tier } = useGameStore.getState()
      const absoluteFloor = (tier - 1) * 10 + floor
      if (absoluteFloor >= 30) {
        useGameStore.getState().endRun(true)
      }
    }
    set({
      monster:               null,
      encounterType:         null,
      playerHp:              0,
      monsterHp:             0,
      roundNumber:           0,
      log:            [],
      outcome:        null,
      pendingLoot:    [],
      statusCounters: { ...ZERO_COUNTERS },
      lastSkillUsed:  null,
    })
  },

  refillPotions: () => {
    const inv = useInventoryStore.getState()
    const potionIds = new Set(['hp_potion', 'mana_potion', 'stamina_potion', 'town_portal_scroll'])
    for (const item of Object.values(inv.bag.items)) {
      if (potionIds.has(item.baseId)) inv.dropItem(item.uid)
    }
    // Re-stock starting loadout: 3 HP potions + 1 mana potion + 1 stamina potion
    inv.addItem(generateHpPotion())
    inv.addItem(generateHpPotion())
    inv.addItem(generateHpPotion())
    inv.addItem(generateManaPotion())
    inv.addItem(generateStaminaPotion())
  },

  gainScroll: () => {
    useInventoryStore.getState().addItem(generateTownPortalScroll())
  },

  openChest: (items) => {
    set({
      encounterType: EncounterType.Chest,
      pendingLoot:   items,
    })
  },
}))
