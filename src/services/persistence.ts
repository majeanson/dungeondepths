/**
 * Persistence service — save/load game state to AsyncStorage.
 * Only cross-run state is saved. Bag (run-scoped) is NOT persisted.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Item } from '../engine/loot'
import type { ClassId } from '../data/classes'
import type { GraveyardEntry, CareerStats } from '../store/gameStore'
import type { EquipSlot } from '../engine/inventory'

const SAVE_KEY     = '@d2game_save_v1'
const SETTINGS_KEY = '@d2game_settings_v1'
const MID_RUN_KEY  = '@d2game_midrun_v1'

export interface SaveData {
  version:           1
  xp:                number
  level:             number
  classId:           ClassId | null
  playerHp:          number
  playerMaxHp:       number
  mana:              number
  maxMana:           number
  floor:             number
  tier:              number
  graveyard:         GraveyardEntry[]
  classXp:           Partial<Record<ClassId, { xp: number; level: number }>>
  sharedStash:       Item[]
  equipped:          Partial<Record<EquipSlot, Item>>
  equippedByClass?:  Partial<Record<ClassId, Partial<Record<EquipSlot, Item>>>>
  townPortalScrolls: number
  classesPlayed?:    ClassId[]
  careerStats?:      CareerStats
  bossDefeated?:     boolean
}

export interface SettingsData {
  hapticsEnabled:       boolean
  audioEnabled:         boolean
  onboardingDone:       boolean
  hasSeenFirstBoss?:    boolean
  zoomLevel?:           0 | 1 | 2
  hasSeenGhostEchoHint?: boolean
  hasSeenCodexHint?:    boolean
}

// ── Save ──────────────────────────────────────────────────────────────────────

export async function saveGame(data: SaveData): Promise<void> {
  try {
    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(data))
  } catch (e) {
    console.warn('[persistence] saveGame failed:', e)
  }
}

// ── Migration ─────────────────────────────────────────────────────────────────

/**
 * Migrate a raw parsed save (unknown shape) to the current SaveData schema.
 * Returns null if the save is too old or corrupt to migrate.
 *
 * When the schema changes, bump CURRENT_VERSION and add a migration step here.
 * Each step receives the previous-version object and returns the next-version one.
 */
const CURRENT_VERSION = 1

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrate(raw: any): SaveData | null {
  if (typeof raw !== 'object' || raw === null) return null

  // Version-less saves (pre-versioning) — add version + missing fields with defaults
  if (!raw.version) {
    raw = {
      version:           1,
      xp:                raw.xp            ?? 0,
      level:             raw.level          ?? 0,
      classId:           raw.classId        ?? null,
      playerHp:          raw.playerHp       ?? 80,
      playerMaxHp:       raw.playerMaxHp    ?? 80,
      mana:              raw.mana           ?? 40,
      maxMana:           raw.maxMana        ?? 40,
      floor:             raw.floor          ?? 1,
      tier:              raw.tier           ?? 1,
      graveyard:         raw.graveyard      ?? [],
      classXp:           raw.classXp        ?? {},
      sharedStash:       raw.sharedStash    ?? [],
      equipped:          raw.equipped       ?? {},
      equippedByClass:   raw.equippedByClass ?? {},
      townPortalScrolls: raw.townPortalScrolls ?? 0,
      classesPlayed:     raw.classesPlayed  ?? [],
      careerStats:       {
        totalRuns:        raw.careerStats?.totalRuns        ?? 0,
        deepestTier:      raw.careerStats?.deepestTier      ?? 1,
        totalKills:       raw.careerStats?.totalKills       ?? 0,
        bestQuality:      raw.careerStats?.bestQuality      ?? null,
        tiersCleared:     raw.careerStats?.tiersCleared     ?? [],
        ascensions:       raw.careerStats?.ascensions       ?? 0,
        deepestFloor:     raw.careerStats?.deepestFloor     ?? 0,
        lastRunDate:      raw.careerStats?.lastRunDate      ?? null,
        dailyStreak:      raw.careerStats?.dailyStreak      ?? 0,
        floorDeaths:      raw.careerStats?.floorDeaths      ?? {},
        studiedBonuses:   raw.careerStats?.studiedBonuses   ?? {},
        stakesCompleted:     raw.careerStats?.stakesCompleted     ?? {},
        deepestFloorByClass: raw.careerStats?.deepestFloorByClass ?? {},
      },
      bossDefeated:      raw.bossDefeated   ?? false,
    }
  }

  // Future migrations go here, e.g.:
  // if (raw.version === 1) { raw = { ...raw, version: 2, newField: default }; }

  if (raw.version !== CURRENT_VERSION) return null
  return raw as SaveData
}

// ── Load ──────────────────────────────────────────────────────────────────────

export type LoadResult =
  | { save: SaveData; corrupted: false }
  | { save: null;    corrupted: false }   // first run or empty
  | { save: null;    corrupted: true  }   // data exists but is damaged / unmigrateable

export async function loadGame(): Promise<LoadResult> {
  try {
    const raw = await AsyncStorage.getItem(SAVE_KEY)
    if (!raw) return { save: null, corrupted: false }
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { return { save: null, corrupted: true } }
    const migrated = migrate(parsed)
    if (migrated === null) return { save: null, corrupted: true }
    return { save: migrated, corrupted: false }
  } catch (e) {
    console.warn('[persistence] loadGame failed:', e)
    return { save: null, corrupted: true }
  }
}

// ── Clear ─────────────────────────────────────────────────────────────────────

export async function clearSave(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SAVE_KEY)
  } catch (e) {
    console.warn('[persistence] clearSave failed:', e)
  }
}

// ── Mid-run save ──────────────────────────────────────────────────────────────

/**
 * Snapshot of the in-progress floor state needed to resume exactly where you left off.
 * Tile types are regenerated deterministically from seed; only fog + encountered are stored.
 */
export interface MidRunData {
  absFloor:    number               // gs.floor — absolute floor for display + gameStore
  localFloor:  number               // grid.floor (1-10) — used to regenerate the grid
  seed:        number               // grid.seed
  tier:        number               // gs.tier — for display in RESUME banner
  classId:     string | null
  playerPos:   { x: number; y: number }
  fog:         number[]             // flat GRID_W*GRID_H array of FogState values
  encountered: boolean[]            // flat GRID_W*GRID_H array
  stamina:     number
  hpPotions:   number              // potion counts at time of camp
  manaPotions: number
  stPotions:   number
}

// In-memory cache — populated during bootstrap so ClassSelectScreen can sync-read it
let _cachedMidRun: MidRunData | null = null

export function getCachedMidRun(): MidRunData | null {
  return _cachedMidRun
}

export async function saveMidRun(data: MidRunData): Promise<void> {
  try {
    _cachedMidRun = data
    await AsyncStorage.setItem(MID_RUN_KEY, JSON.stringify(data))
  } catch (e) {
    console.warn('[persistence] saveMidRun failed:', e)
  }
}

export async function loadMidRun(): Promise<MidRunData | null> {
  try {
    const raw = await AsyncStorage.getItem(MID_RUN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as MidRunData
    _cachedMidRun = parsed
    return parsed
  } catch (e) {
    console.warn('[persistence] loadMidRun failed:', e)
    return null
  }
}

export async function clearMidRun(): Promise<void> {
  try {
    _cachedMidRun = null
    await AsyncStorage.removeItem(MID_RUN_KEY)
  } catch (e) {
    console.warn('[persistence] clearMidRun failed:', e)
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function saveSettings(data: SettingsData): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(data))
  } catch (e) {
    console.warn('[persistence] saveSettings failed:', e)
  }
}

export async function loadSettings(): Promise<SettingsData | null> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SettingsData
  } catch {
    return null
  }
}

// ── Debounced auto-save ───────────────────────────────────────────────────────

let _saveTimer: ReturnType<typeof setTimeout> | null = null

/** Call after any state mutation that should persist. Debounced 500ms. */
export function scheduleSave(): void {
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    _saveTimer = null
    try {
      const { useGameStore }      = require('../store/gameStore')
      const { useInventoryStore } = require('../store/inventoryStore')
      const { useGridStore }      = require('../store/gridStore')

      const gs   = useGameStore.getState()
      const inv  = useInventoryStore.getState()
      const grid = useGridStore.getState()

      // Count scroll items from bag — scrolls live in inventory, not combatStore
      const townPortalScrolls = (Object.values(inv.bag.items) as { baseId: string }[])
        .filter(it => it.baseId === 'town_portal_scroll').length

      const data: SaveData = {
        version:           1,
        xp:                gs.xp,
        level:             gs.level,
        classId:           gs.classId,
        playerHp:          gs.playerHp,
        playerMaxHp:       gs.playerMaxHp,
        mana:              gs.mana,
        maxMana:           gs.maxMana,
        floor:             gs.floor,
        tier:              gs.tier,
        graveyard:         gs.graveyard,
        classXp:           gs.classXp,
        sharedStash:       gs.sharedStash,
        equipped:          inv.equipped,
        equippedByClass:   gs.equippedByClass,
        townPortalScrolls,
        classesPlayed:     gs.classesPlayed,
        careerStats:       gs.careerStats,
        bossDefeated:      grid.bossDefeated,
      }
      saveGame(data)
    } catch (e) {
      console.warn('[persistence] scheduleSave snapshot failed:', e)
    }
  }, 500)
}
