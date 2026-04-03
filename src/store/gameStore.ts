import { create } from 'zustand'
import type { Item } from '../engine/loot'
import { rollLoot, generateStartingItems } from '../engine/loot'
import { type ClassId } from '../data/classes'
import { scheduleSave, clearMidRun } from '../services/persistence'
import { makeRng } from '../engine/rng'
import {
  maxHpForFloor,
  maxManaForLevel,
  xpForLevel,
  levelFromXp,
} from '../engine/stats'

// inventoryStore does not import gameStore, so a direct import is safe here.
import { useInventoryStore, type InventoryState } from './inventoryStore'
import { calcMF, createInventory, type InventoryGrid } from '../engine/inventory'

export const MAX_STASH_SIZE = 30

export type StakeId = 'slayer' | 'scavenger' | 'deepdiver'

export interface StakeDef {
  id: StakeId
  label: string
  desc: string
  icon: string
  target: number
}

export const STAKE_DEFS: StakeDef[] = [
  { id: 'slayer',    label: 'SLAYER',    desc: 'Kill 75 monsters',       icon: '⚔',  target: 75 },
  { id: 'scavenger', label: 'SCAVENGER', desc: 'Find 10 rare items',     icon: '📦', target: 10 },
  { id: 'deepdiver', label: 'DEEPDIVER', desc: 'Survive to floor 7',     icon: '↓',  target: 7  },
]

// ── Pact System ─────────────────────────────────────────────────────────────
export type PactId = 'blood' | 'suffering' | 'frailty' | 'exhaustion'

export interface PactDef {
  id:     PactId
  label:  string
  curse:  string   // what you lose
  reward: string   // what you gain
  icon:   string
}

export const PACT_DEFS: PactDef[] = [
  {
    id: 'blood', label: 'BLOOD',
    curse:  '+35% damage taken',
    reward: '+50% magic find',
    icon: '⚔',
  },
  {
    id: 'suffering', label: 'SUFFERING',
    curse:  'All monsters gain Cursed',
    reward: '+30% XP per kill',
    icon: '☠',
  },
  {
    id: 'frailty', label: 'FRAILTY',
    curse:  'No potions drop from enemies',
    reward: 'All item drops auto-identified',
    icon: '◈',
  },
  {
    id: 'exhaustion', label: 'EXHAUSTION',
    curse:  'Start each floor at 50% stamina',
    reward: '+25% magic find',
    icon: '⚡',
  },
]

export type GameScreen =
  | 'grid' | 'combat' | 'loot' | 'inventory'
  | 'codex' | 'graveyard' | 'gameover' | 'victory'
  | 'classSelect' | 'stash' | 'town' | 'settings'

export interface GraveyardEntry {
  item:      Item
  floor:     number
  tier:      number
  level:     number
  lostAt:    string
  classId?:  ClassId | null
  killedBy?: string
  studied?:  boolean
}

export type ItemQuality = 'normal' | 'magic' | 'rare' | 'unique' | 'runeword'

export interface CareerStats {
  totalRuns:    number
  deepestTier:  number
  deepestFloor: number
  totalKills:   number
  bestQuality:  ItemQuality | null
  tiersCleared: number[]
  ascensions:   number
  dailyStreak:  number
  lastRunDate:  string
  /** Per-absolute-floor death count (index = absFloor - 1). */
  floorDeaths:  number[]
  /** Study bonus IDs permanently unlocked via Graveyard Study. */
  studiedBonuses: string[]
  /** How many times each stake type was successfully completed. */
  stakesCompleted: Record<string, number>
  /** Deepest absolute floor descended FROM, per class. Used to unlock waypoints. */
  deepestFloorByClass: Partial<Record<import('../data/classes').ClassId, number>>
}

export interface GameState {
  // ── Run state (resets each run) ──────────────────────────────────────────
  floor:        number
  seed:         number
  screen:       GameScreen
  runStarted:   boolean
  playerHp:     number
  playerMaxHp:  number

  // ── Persistent state (survives death) ────────────────────────────────────
  classId:      ClassId | null
  tier:         number
  xp:           number
  level:        number
  mana:         number
  maxMana:      number
  graveyard:    GraveyardEntry[]
  lastSacrifice: GraveyardEntry | null
  /** Per-class XP/level — so switching classes doesn't share progression */
  classXp:      Partial<Record<ClassId, { xp: number; level: number }>>
  /** Per-class equipped gear — switching classes restores that class's loadout */
  equippedByClass: Partial<Record<ClassId, Partial<Record<import('./inventoryStore').EquipSlot, Item>>>>
  /** Per-class bag — switching classes restores that class's bag (not persisted) */
  bagByClass: Partial<Record<ClassId, InventoryGrid>>
  /** Shared stash — persists across runs, deposited/withdrawn from StashScreen */
  sharedStash:  Item[]
  /** Which classes have ever been used to start a run */
  classesPlayed: ClassId[]
  /** Accumulates across all runs forever */
  careerStats:  CareerStats
  /** Set to true when returning from town portal — cleared by GridScreen after flash */
  returnedFromTown: boolean
  /** Ghost Echo — 25% of a graveyard item's stats for 1 floor. Cleared by nextFloor(). */
  ghostCharm: Item | null
  /**
   * Set to the tier number when a tier is cleared for the first time (in-memory only).
   * GridScreen reads this to enhance the TierClearOverlay, then clears it.
   */
  firstTimeTierClear: number | null

  /** Kills accumulated in the current run (resets each run). */
  runKills:          number
  /** Items picked up in the current run (resets each run). */
  runItemsFound:     number
  /** Rare+ items picked up in the current run (resets each run). Used for scavenger stake. */
  runRareItemsFound: number
  /** True once Last Stand has fired this run — only one use per run. */
  lastStandUsed: boolean

  // ── Run Stakes ────────────────────────────────────────────────────────────
  activeStake:     StakeId | null
  stakeClaimed:    boolean
  /** Non-null for one tick after a stake bonus drop is rolled — GridScreen consumes + clears it. */
  stakeBonusItem:  Item | null

  // ── Pact ──────────────────────────────────────────────────────────────────
  /** Voluntary run curse chosen on ClassSelectScreen. Reset each new run. */
  activePact: PactId | null

  // ── Echo Whisper ──────────────────────────────────────────────────────────
  echoWhisperShown: boolean

  // ── Actions ───────────────────────────────────────────────────────────────
  hydrate:            (data: import('../services/persistence').SaveData) => void
  selectClass:        (id: ClassId) => void
  startRun:           (seed?: number, startFloor?: number) => void
  resumeRun:          () => void
  setScreen:          (screen: GameScreen) => void
  nextFloor:          () => void
  endRun:             (won: boolean, killedBy?: string) => void
  setPlayerHp:        (hp: number) => void
  healPlayer:         (amount: number) => void
  gainXp:             (amount: number) => void
  useMana:            (amount: number) => void
  restoreMana:        (amount: number) => void
  depositToStash:     (item: Item) => boolean   // false = stash full
  withdrawFromStash:  (uid: string) => void
  /** Equip a stash item directly — displaced equipped item goes back to stash */
  equipFromStash:     (uid: string) => void
  /** Unequip an item directly to stash */
  unequipToStash:     (slot: import('./inventoryStore').EquipSlot) => void
  setReturnedFromTown:    (val: boolean) => void
  recordKill:             () => void
  recordItemFound:        (quality: ItemQuality) => void
  invokeGhostEcho:        (entryIndex: number) => void
  clearGhostCharm:        () => void
  clearFirstTimeTierClear: () => void
  /** Start a new run as an ascension: pre-loads Ghost Echo from last graveyard entry, increments ascensions */
  ascendRun:              (seed?: number) => void
  /** Mark Last Stand as used for this run. */
  useLastStand:           () => void
  setStake:               (id: StakeId | null) => void
  claimStake:             () => void
  setPact:                (id: PactId | null) => void
  /** Called by GridScreen after consuming stakeBonusItem. */
  clearStakeBonusItem:    () => void
  markEchoWhisperShown:   () => void
  studyGraveyardEntry:    (uid: string) => void
}

const QUALITY_RANK: Record<ItemQuality, number> = {
  normal: 0, magic: 1, rare: 2, unique: 3, runeword: 4,
}

export const useGameStore = create<GameState>((set, get) => ({
  floor:         1,
  seed:          Date.now(),
  screen:        'grid',
  runStarted:    false,
  playerHp:      maxHpForFloor(1),
  playerMaxHp:   maxHpForFloor(1),
  classId:       null,
  tier:          1,
  xp:            0,
  level:         0,
  mana:          40,
  maxMana:       40,
  graveyard:     [],
  lastSacrifice: null,
  classXp:          {},
  equippedByClass:  {},
  bagByClass:       {},
  sharedStash:      [],
  classesPlayed:    [],
  careerStats:      { totalRuns: 0, deepestTier: 1, deepestFloor: 0, totalKills: 0, bestQuality: null, tiersCleared: [], ascensions: 0, dailyStreak: 0, lastRunDate: '', floorDeaths: [], studiedBonuses: [], stakesCompleted: {}, deepestFloorByClass: {} },
  returnedFromTown: false,
  ghostCharm:       null,
  firstTimeTierClear: null,
  runKills:          0,
  runItemsFound:     0,
  runRareItemsFound: 0,
  lastStandUsed: false,
  activeStake:      null,
  stakeClaimed:     false,
  stakeBonusItem:   null,
  activePact:       null,
  echoWhisperShown: false,

  hydrate: (data) => {
    set({
      xp:          data.xp,
      level:       data.level,
      classId:     data.classId,
      playerHp:    data.playerHp,
      playerMaxHp: data.playerMaxHp,
      mana:        data.mana,
      maxMana:     data.maxMana,
      floor:       data.floor,
      tier:        data.tier,
      graveyard:   data.graveyard,
      classXp:         data.classXp ?? {},
      equippedByClass: data.equippedByClass ?? {},
      sharedStash:     data.sharedStash,
      classesPlayed:   data.classesPlayed   ?? [],
      careerStats:     {
        totalRuns:      data.careerStats?.totalRuns      ?? 0,
        deepestTier:    data.careerStats?.deepestTier    ?? 1,
        deepestFloor:   data.careerStats?.deepestFloor   ?? 0,
        totalKills:     data.careerStats?.totalKills     ?? 0,
        bestQuality:    data.careerStats?.bestQuality    ?? null,
        tiersCleared:   data.careerStats?.tiersCleared   ?? [],
        ascensions:     data.careerStats?.ascensions     ?? 0,
        dailyStreak:    data.careerStats?.dailyStreak    ?? 0,
        lastRunDate:    data.careerStats?.lastRunDate    ?? '',
        floorDeaths:    data.careerStats?.floorDeaths    ?? [],
        studiedBonuses:  data.careerStats?.studiedBonuses  ?? [],
        stakesCompleted:     data.careerStats?.stakesCompleted     ?? {},
        deepestFloorByClass: data.careerStats?.deepestFloorByClass ?? {},
      },
    })
    // townPortalScrolls hydration is handled at the call site (App.tsx)
  },

  selectClass: (id) => {
    const { classId: currentId, classXp, equippedByClass, bagByClass } = get()
    const invStore = useInventoryStore

    // Snapshot current class's equipped + bag before switching
    const updatedEquippedByClass = { ...equippedByClass }
    const updatedBagByClass      = { ...bagByClass }
    if (currentId) {
      updatedEquippedByClass[currentId] = invStore.getState().equipped
      updatedBagByClass[currentId]      = invStore.getState().bag
    }

    // Restore the new class's equipped + bag (empty if never played)
    const inv = invStore.getState()
    inv.hydrateEquipped(updatedEquippedByClass[id] ?? {})
    inv.hydrateBag(updatedBagByClass[id] ?? createInventory())

    const saved      = classXp[id] ?? { xp: 0, level: 0 }
    const newMaxMana = maxManaForLevel(saved.level, id)
    set({ classId: id, xp: saved.xp, level: saved.level, maxMana: newMaxMana, equippedByClass: updatedEquippedByClass, bagByClass: updatedBagByClass })
  },

  startRun: (seed?, startFloor = 1) => {
    const { level, classId, classesPlayed } = get()
    // Decompose absolute starting floor into tier + local floor
    const startTier  = Math.floor((startFloor - 1) / 10) + 1
    const localFloor = ((startFloor - 1) % 10) + 1
    const maxHp   = maxHpForFloor(localFloor, level, classId)
    const maxMana = maxManaForLevel(level, classId)
    const isFirstClassRun = classId && !classesPlayed.includes(classId)
    const updatedClassesPlayed = isFirstClassRun
      ? [...classesPlayed, classId]
      : classesPlayed
    set({
      floor:         localFloor,
      tier:          startTier,
      seed:          seed ?? Date.now(),
      screen:        'grid',
      runStarted:    true,
      playerHp:      maxHp,
      playerMaxHp:   maxHp,
      mana:          maxMana,
      maxMana,
      lastSacrifice: null,
      classesPlayed: updatedClassesPlayed,
      runKills:          0,
      runItemsFound:     0,
      runRareItemsFound: 0,
      lastStandUsed:    false,
      stakeClaimed:     false,
      stakeBonusItem:   null,
      echoWhisperShown: false,
      // tier, xp, level, graveyard, classId, sharedStash, activeStake, activePact intentionally NOT reset
    })
    // First run of this class: grant class-appropriate starting items
    if (isFirstClassRun && classId) {
      const items = generateStartingItems(classId)
      const inv   = useInventoryStore.getState()
      for (const item of items) inv.addItem(item)
    }
    clearMidRun()
    scheduleSave()
  },

  resumeRun: () => {
    set({ runStarted: true, screen: 'grid' })
  },

  setScreen: (screen) => set({ screen }),

  nextFloor: () => {
    scheduleSave()
    const s = get()
    // Deepdiver stake: claimed when player descends to floor 7 within any tier
    if (!s.stakeClaimed && s.activeStake === 'deepdiver') {
      const nextFloorNum = s.floor >= 10 ? 1 : s.floor + 1
      if (nextFloorNum >= 7) get().claimStake()
    }
    // Track deepest absolute floor cleared per class (descended FROM = cleared)
    if (s.classId) {
      const absFloor = (s.tier - 1) * 10 + s.floor
      const prev = s.careerStats.deepestFloorByClass?.[s.classId] ?? 0
      if (absFloor > prev) {
        set({ careerStats: {
          ...s.careerStats,
          deepestFloorByClass: { ...s.careerStats.deepestFloorByClass, [s.classId]: absFloor },
        }})
      }
    }
    if (s.floor >= 10) {
      const newTier    = s.tier + 1
      const newMaxHp   = maxHpForFloor(1, s.level, s.classId)
      const newMaxMana = maxManaForLevel(s.level, s.classId)
      // Track first-time tier clears (tier we just completed = s.tier)
      const completedTier = s.tier
      const isFirstClear  = !s.careerStats.tiersCleared.includes(completedTier)
      const tiersCleared  = isFirstClear
        ? [...s.careerStats.tiersCleared, completedTier]
        : s.careerStats.tiersCleared
      set({
        tier:        newTier,
        floor:       1,
        screen:      'grid',
        playerMaxHp: newMaxHp,
        playerHp:    Math.min(s.playerHp, newMaxHp),
        maxMana:     newMaxMana,
        mana:        Math.min(s.mana + 15, newMaxMana),
        ghostCharm:  null,   // echo fades between floors
        firstTimeTierClear: isFirstClear ? completedTier : null,
        careerStats: { ...s.careerStats, tiersCleared },
      })
    } else {
      const newFloor   = s.floor + 1
      const newMaxHp   = maxHpForFloor(newFloor, s.level, s.classId)
      const newMaxMana = maxManaForLevel(s.level, s.classId)
      set({
        floor:       newFloor,
        screen:      'grid',
        playerMaxHp: newMaxHp,
        playerHp:    Math.min(s.playerHp, newMaxHp),
        maxMana:     newMaxMana,
        mana:        Math.min(s.mana + 10, newMaxMana),
        ghostCharm:  null,   // echo fades between floors
      })
    }
  },

  endRun: (won, killedBy?) => {
    const { floor, tier, level, classId, seed, careerStats } = get()
    const today     = new Date().toISOString().slice(0, 10)
    const lastDate  = careerStats.lastRunDate ?? ''
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const newStreak = today === lastDate
      ? careerStats.dailyStreak                      // already ran today
      : lastDate === yesterday
        ? (careerStats.dailyStreak ?? 0) + 1         // consecutive day
        : 1                                          // streak broken
    const absFloor = (tier - 1) * 10 + floor
    const newFloorDeaths = [...(careerStats.floorDeaths ?? [])]
    if (!won) {
      const idx = absFloor - 1
      newFloorDeaths[idx] = (newFloorDeaths[idx] ?? 0) + 1
    }
    const updatedCareerStats: CareerStats = {
      totalRuns:      careerStats.totalRuns + 1,
      deepestTier:    Math.max(careerStats.deepestTier, tier),
      deepestFloor:   Math.max(careerStats.deepestFloor ?? 0, absFloor),
      totalKills:     careerStats.totalKills,
      bestQuality:    careerStats.bestQuality,
      tiersCleared:   careerStats.tiersCleared,
      ascensions:     careerStats.ascensions,
      dailyStreak:    newStreak,
      lastRunDate:    today,
      floorDeaths:         newFloorDeaths,
      studiedBonuses:      careerStats.studiedBonuses      ?? [],
      stakesCompleted:     careerStats.stakesCompleted     ?? {},
      deepestFloorByClass: careerStats.deepestFloorByClass ?? {},
    }

    if (!won) {
      const inventoryStore = useInventoryStore
      const { equipped } = inventoryStore.getState()
      const equippedItems = Object.values(equipped).filter(Boolean) as Item[]

      if (equippedItems.length > 0) {
        // Sacrifice one equipped item (quality-weighted) — bag items are not in the pool
        const QUALITY_WEIGHT: Record<string, number> = { unique: 40, rare: 20, magic: 5, normal: 1 }
        const pool: Item[] = []
        for (const item of equippedItems) {
          const w = QUALITY_WEIGHT[item.quality] ?? 1
          for (let i = 0; i < w; i++) pool.push(item)
        }
        const rng = makeRng(seed ^ (floor * 0x9e3779b9))
        const sacrificed = pool[Math.floor(rng() * pool.length)]

        // Find exact equip slot by uid — avoids ring1/ring2 ambiguity
        type EquipSlot = import('./inventoryStore').EquipSlot
        const equipSlot = (Object.entries(equipped) as [EquipSlot, Item | undefined][])
          .find(([, it]) => it?.uid === sacrificed.uid)?.[0]

        // Remove sacrificed item from equipped + clear bag entirely in one atomic update
        inventoryStore.setState((s: InventoryState) => {
          const newEquipped = { ...s.equipped }
          if (equipSlot) delete newEquipped[equipSlot]
          const emptyBag = createInventory()
          return { equipped: newEquipped, bag: emptyBag, magicFind: calcMF(newEquipped, emptyBag) }
        })

        const entry: GraveyardEntry = {
          item:    { ...sacrificed, identified: true },
          floor,
          tier,
          level,
          lostAt:  new Date().toISOString(),
          classId,
          killedBy,
        }
        const MAX_GRAVEYARD = 15
        set(s => {
          const newGraveyard = [...s.graveyard, entry]
          const trimmed = newGraveyard.length > MAX_GRAVEYARD
            ? newGraveyard.slice(newGraveyard.length - MAX_GRAVEYARD)
            : newGraveyard
          return {
            graveyard:     trimmed,
            lastSacrifice: entry,
            screen:        'gameover',
            runStarted:    false,
            careerStats:   updatedCareerStats,
          }
        })
        clearMidRun()
        scheduleSave()
        return
      }

      // No equipped items — still clear the bag entirely
      inventoryStore.setState((s: InventoryState) => {
        const emptyBag = createInventory()
        return { bag: emptyBag, magicFind: calcMF(s.equipped, emptyBag) }
      })
    }
    set({ screen: won ? 'victory' : 'gameover', runStarted: false, lastSacrifice: null, careerStats: updatedCareerStats })
    clearMidRun()
    scheduleSave()
  },

  setPlayerHp: (hp) => set(s => ({ playerHp: Math.max(0, Math.min(s.playerMaxHp, hp)) })),

  healPlayer: (amount) => set(s => ({ playerHp: Math.min(s.playerMaxHp, s.playerHp + amount) })),

  gainXp: (amount) => {
    const s        = get()
    const newXp    = s.xp + amount
    const newLevel = levelFromXp(newXp)
    const classXpUpdate = s.classId
      ? { classXp: { ...s.classXp, [s.classId]: { xp: newXp, level: newLevel } } }
      : {}
    if (newLevel > s.level) {
      const gained     = newLevel - s.level
      const newMaxMana = maxManaForLevel(newLevel, s.classId)
      const newMaxHp   = s.playerMaxHp + gained * 5
      set({
        xp:          newXp,
        level:       newLevel,
        maxMana:     newMaxMana,
        playerMaxHp: newMaxHp,
        playerHp:    Math.min(s.playerHp + gained * 5, newMaxHp),
        ...classXpUpdate,
      })
    } else {
      set({ xp: newXp, ...classXpUpdate })
    }
    scheduleSave()
  },

  useMana:     (amount) => set(s => ({ mana: Math.max(0, s.mana - amount) })),
  restoreMana: (amount) => set(s => ({ mana: Math.min(s.maxMana, s.mana + amount) })),

  depositToStash: (item) => {
    if (get().sharedStash.length >= MAX_STASH_SIZE) return false
    set(s => ({ sharedStash: [...s.sharedStash, item] }))
    scheduleSave()
    return true
  },

  withdrawFromStash: (uid) => {
    set(s => ({ sharedStash: s.sharedStash.filter(i => i.uid !== uid) }))
    scheduleSave()
  },

  equipFromStash: (uid) => {
    const { sharedStash } = get()
    const item = sharedStash.find(i => i.uid === uid)
    if (!item) return

    const invStore = useInventoryStore
    const { equipped } = invStore.getState()

    // Determine equip slot
    type EquipSlot = import('./inventoryStore').EquipSlot
    const slotMap: Partial<Record<string, EquipSlot>> = {
      weapon: 'weapon', offhand: 'offhand', helmet: 'helmet', chest: 'chest',
      gloves: 'gloves', legs: 'legs', boots: 'boots', amulet: 'amulet',
      belt: 'belt', circlet: 'circlet',
    }
    const slot: EquipSlot | null = item.slot === 'ring'
      ? (!equipped.ring1 ? 'ring1' : 'ring2')
      : (slotMap[item.slot] ?? null)
    if (!slot) return

    // Move displaced item to stash
    const displaced = equipped[slot]
    const newStash = sharedStash.filter(i => i.uid !== uid)
    if (displaced) newStash.push(displaced)

    // Equip the item and recalculate magicFind
    invStore.setState((s: InventoryState) => {
      const newEquipped = { ...s.equipped, [slot]: item }
      return { equipped: newEquipped, magicFind: calcMF(newEquipped, s.bag) }
    })
    set({ sharedStash: newStash })
  },

  unequipToStash: (slot) => {
    const invStore = useInventoryStore
    const { equipped } = invStore.getState()
    const item = equipped[slot]
    if (!item) return

    invStore.setState((s: InventoryState) => {
      const newEquipped = { ...s.equipped }
      delete newEquipped[slot]
      return { equipped: newEquipped, magicFind: calcMF(newEquipped, s.bag) }
    })
    set(s => ({ sharedStash: [...s.sharedStash, item] }))
  },

  setReturnedFromTown: (val) => set({ returnedFromTown: val }),

  invokeGhostEcho: (entryIndex) => {
    const { graveyard, ghostCharm } = get()
    if (ghostCharm) return   // already active — one echo at a time
    const entry = graveyard[graveyard.length - 1 - entryIndex]  // sorted reversed
    if (!entry) return
    set({ ghostCharm: entry.item })
  },

  clearGhostCharm: () => set({ ghostCharm: null }),

  clearFirstTimeTierClear: () => set({ firstTimeTierClear: null }),

  ascendRun: (seed?) => {
    const s = get()
    const maxHp   = maxHpForFloor(1, s.level, s.classId)
    const maxMana = maxManaForLevel(s.level, s.classId)
    const updatedClassesPlayed = s.classId && !s.classesPlayed.includes(s.classId)
      ? [...s.classesPlayed, s.classId]
      : s.classesPlayed
    // Pre-load Ghost Echo from the most recent graveyard entry
    const lastEntry = s.graveyard.length > 0 ? s.graveyard[s.graveyard.length - 1] : null
    set({
      floor:         1,
      seed:          seed ?? Date.now(),
      screen:        'grid',
      runStarted:    true,
      playerHp:      maxHp,
      playerMaxHp:   maxHp,
      mana:          maxMana,
      maxMana,
      lastSacrifice: null,
      classesPlayed: updatedClassesPlayed,
      ghostCharm:    lastEntry?.item ?? null,
      careerStats:   { ...s.careerStats, ascensions: s.careerStats.ascensions + 1 },
    })
    scheduleSave()
  },

  recordKill: () => {
    const s = get()
    const newKills = s.runKills + 1
    const shouldClaim = !s.stakeClaimed && s.activeStake === 'slayer' && newKills >= 75
    set({
      runKills:    newKills,
      careerStats: { ...s.careerStats, totalKills: s.careerStats.totalKills + 1 },
    })
    if (shouldClaim) get().claimStake()
  },

  recordItemFound: (quality) => {
    const isRarePlus = quality === 'rare' || quality === 'unique' || quality === 'runeword'
    const s = get()
    const newRare = s.runRareItemsFound + (isRarePlus ? 1 : 0)
    const current = s.careerStats.bestQuality
    const currentRank = current ? QUALITY_RANK[current] : -1
    set({
      runItemsFound:     s.runItemsFound + 1,
      runRareItemsFound: newRare,
      careerStats: {
        ...s.careerStats,
        bestQuality: QUALITY_RANK[quality] > currentRank ? quality : current,
      },
    })
    if (!s.stakeClaimed && s.activeStake === 'scavenger' && newRare >= 10) {
      get().claimStake()
    }
  },

  useLastStand: () => set({ lastStandUsed: true }),

  setStake: (id) => set({ activeStake: id }),
  setPact:  (id) => set({ activePact: id }),

  claimStake: () => {
    const { stakeClaimed, seed, floor, activeStake, careerStats } = get()
    if (stakeClaimed) return
    const rng = makeRng(seed ^ 0xd4e5f612 ^ (floor * 0x9e3779b9))
    let stakeBonusItem: Item | null = null
    if (rng() < 0.35) {
      const drops = rollLoot(rng, 'chest', floor, 50)
      stakeBonusItem = drops[0] ?? null
    }
    const stakeKey = activeStake ?? 'none'
    const updatedStakesCompleted = {
      ...careerStats.stakesCompleted,
      [stakeKey]: (careerStats.stakesCompleted[stakeKey] ?? 0) + 1,
    }
    set({
      stakeClaimed: true,
      stakeBonusItem,
      careerStats: { ...careerStats, stakesCompleted: updatedStakesCompleted },
    })
    scheduleSave()
  },

  clearStakeBonusItem: () => set({ stakeBonusItem: null }),

  markEchoWhisperShown: () => set({ echoWhisperShown: true }),

  studyGraveyardEntry: (uid) => {
    const { graveyard, careerStats } = get()
    const entry = graveyard.find(e => e.item.uid === uid)
    if (!entry || entry.studied) return
    const quality = entry.item.runewordId ? 'runeword' : entry.item.quality
    set(s => ({
      graveyard: s.graveyard.map(e => e.item.uid === uid ? { ...e, studied: true } : e),
      careerStats: {
        ...s.careerStats,
        studiedBonuses: [...s.careerStats.studiedBonuses, quality],
      },
    }))
    scheduleSave()
  },
}))
