import { create } from 'zustand'
import { useGameStore } from './gameStore'
import { makeRng } from '../engine/rng'
import { scheduleSave } from '../services/persistence'
import {
  generateFloor, revealFog, isWalkable, classifyRooms, getRoomTypeAt,
  TileType, FogState, RoomType,
  GRID_W, GRID_H,
  type Grid, type Position, type Room,
} from '../engine/grid'
import { rollEncounter, floorPacingWeights, EncounterType, isBossFloor } from '../engine/encounter'
import { spawnMonster, type EncounterTier, type MonsterInstance } from '../engine/monsters'
import { spawnBoss } from '../data/bosses'

export const STAMINA_MAX = 100
export const FOG_RADIUS = 2

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface GridState {
  grid: Grid
  playerPos: Position
  floor: number
  seed: number
  stamina: number
  pendingEncounter: { type: EncounterType; monster: MonsterInstance | null } | null
  reachedExit: boolean
  /**
   * True once the boss on the current floor has been defeated.
   * Run-scoped: reset to false in initFloor — NOT persisted across sessions.
   */
  bossDefeated: boolean
  rooms: Room[]
  roomTypes: RoomType[]

  initFloor: (floor: number, seed: number) => void
  movePlayer: (dir: Direction) => boolean  // false = blocked (wall/out-of-bounds)
  clearEncounter: () => void
  restoreStamina: (amount: number) => void
  drainStamina:   (amount: number) => void
  markBossDefeated: () => void
  cancelExit: () => void
  restoreMidRunState: (data: import('../services/persistence').MidRunData) => void
}

function tierForEncounter(type: EncounterType): EncounterTier {
  const map: Record<string, EncounterTier> = {
    [EncounterType.Normal]: 'normal',
    [EncounterType.Elite]: 'elite',
    [EncounterType.Rare]: 'rare',
    [EncounterType.Ancient]: 'ancient',
  }
  return map[type] ?? 'normal'
}

export const useGridStore = create<GridState>((set, get) => ({
  grid: [],
  playerPos: { x: 0, y: 0 },
  floor: 1,
  seed: 0,
  stamina: STAMINA_MAX,
  pendingEncounter: null,
  reachedExit: false,
  bossDefeated: false,
  rooms: [],
  roomTypes: [],

  initFloor: (floor, seed) => {
    const rng = makeRng(seed + floor * 999983)
    const { grid, playerStart, rooms, roomTypes } = generateFloor(seed + floor, rng)
    const freshGrid: Grid = grid.map(row => row.map(t => ({ ...t })))
    revealFog(freshGrid, playerStart, FOG_RADIUS)
    const pact = useGameStore.getState().activePact
    const startStamina = pact === 'exhaustion' ? Math.round(STAMINA_MAX * 0.5) : STAMINA_MAX
    set({
      grid: freshGrid,
      playerPos: playerStart,
      floor,
      seed,
      stamina: startStamina,
      pendingEncounter: null,
      reachedExit: false,
      bossDefeated: false,
      rooms,
      roomTypes,
    })
  },

  movePlayer: (dir) => {
    const { grid, playerPos, stamina, floor, seed, bossDefeated } = get()
    if (get().pendingEncounter) return false

    const delta: Record<Direction, Position> = {
      up:    { x: 0, y: -1 },
      down:  { x: 0, y:  1 },
      left:  { x: -1, y: 0 },
      right: { x:  1, y: 0 },
    }
    const d = delta[dir]
    const next: Position = { x: playerPos.x + d.x, y: playerPos.y + d.y }

    if (!isWalkable(grid, next)) return false

    const newGrid: Grid = grid.map(row => row.map(t => ({ ...t })))
    revealFog(newGrid, next, FOG_RADIUS)

    const tile = newGrid[next.y][next.x]

    // Check exit
    if (tile.type === TileType.Exit) {
      set({ grid: newGrid, playerPos: next, reachedExit: true })
      return true
    }

    // Roll encounter on unvisited tiles
    let pendingEncounter: GridState['pendingEncounter'] = null
    if (!tile.encountered && tile.type === TileType.Floor) {
      tile.encountered = true
      const rng = makeRng(seed + floor * 777 + next.x * 31 + next.y * 97)

      // Boss floor: force boss encounter on first unvisited tile (if not yet defeated)
      if (isBossFloor(floor) && !bossDefeated) {
        const gs = useGameStore.getState()
        const absoluteFloor = (gs.tier - 1) * 10 + floor
        const boss = spawnBoss(absoluteFloor, rng)
        pendingEncounter = { type: EncounterType.Boss, monster: boss }
      } else {
        const { rooms, roomTypes } = get()
        const roomType = getRoomTypeAt(rooms, roomTypes, next)
        const baseWeights = floorPacingWeights(floor)
        const biasedWeights = roomType === RoomType.Charnel
          ? { ...baseWeights, elite: baseWeights.elite * 3, ancient: baseWeights.ancient * 2, shrine: 1, chest: 1 }
          : roomType === RoomType.Sanctum
          ? { ...baseWeights, shrine: baseWeights.shrine * 5, chest: baseWeights.chest * 4, elite: Math.floor(baseWeights.elite * 0.3) }
          : baseWeights
        const enc = rollEncounter(rng, floor, biasedWeights)
        if (enc !== EncounterType.Empty) {
          let monster: MonsterInstance | null = null
          if ([EncounterType.Normal, EncounterType.Elite, EncounterType.Rare, EncounterType.Ancient].includes(enc)) {
            const diffTier = useGameStore.getState().tier
            monster = spawnMonster(rng, floor, tierForEncounter(enc), diffTier)
          }
          pendingEncounter = { type: enc, monster }
        }
      }
    }

    set({
      grid: newGrid,
      playerPos: next,
      stamina: Math.max(0, stamina - 1),
      pendingEncounter,
    })
    return true
  },

  clearEncounter: () => set({ pendingEncounter: null }),

  restoreStamina: (amount) => set((s) => ({
    stamina: Math.min(STAMINA_MAX, s.stamina + amount),
  })),
  drainStamina: (amount) => set((s) => ({
    stamina: Math.max(0, s.stamina - amount),
  })),

  markBossDefeated: () => {
    set({ bossDefeated: true })
    scheduleSave()   // persist so crash after boss-kill doesn't re-spawn the boss
  },

  cancelExit: () => set({ reachedExit: false }),

  restoreMidRunState: (data) => {
    const rng = makeRng(data.seed + data.localFloor * 999983)
    const { grid: baseGrid, rooms, roomTypes } = generateFloor(data.seed + data.localFloor, rng)
    const freshGrid: Grid = baseGrid.map(row => row.map(t => ({ ...t })))
    // Patch per-tile fog and encountered from saved snapshot
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const idx = y * GRID_W + x
        if (freshGrid[y]?.[x]) {
          freshGrid[y][x].fog         = data.fog[idx] as FogState
          freshGrid[y][x].encountered = data.encountered[idx]
        }
      }
    }
    set({
      grid:             freshGrid,
      playerPos:        data.playerPos,
      floor:            data.localFloor,
      seed:             data.seed,
      stamina:          data.stamina,
      pendingEncounter: null,
      reachedExit:      false,
      bossDefeated:     false,
      rooms,
      roomTypes,
    })
  },
}))
