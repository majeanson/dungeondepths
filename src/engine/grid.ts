import { type Rng, roll, chance } from './rng'

export const GRID_W = 50
export const GRID_H = 50

export enum TileType {
  Wall = 0,
  Floor = 1,
  Exit = 2,
}

export enum FogState {
  Hidden = 0,
  Revealed = 1,
}

export enum RoomType {
  Standard = 'standard',
  Charnel  = 'charnel',  // narrow/elongated — biased toward elites
  Sanctum  = 'sanctum',  // wide/square + large — biased toward shrines & chests
}

export interface Tile {
  type: TileType
  fog: FogState
  /** Has this tile spawned its encounter yet? */
  encountered: boolean
}

export interface Position {
  x: number
  y: number
}

export type Grid = Tile[][]

// ─── BSP Dungeon Generation ────────────────────────────────────────────────

export interface Room {
  x: number
  y: number
  w: number
  h: number
}

/** Classify each room by its geometry. */
export function classifyRooms(rooms: Room[]): RoomType[] {
  return rooms.map(r => {
    const ratio = Math.max(r.w / r.h, r.h / r.w)
    if (ratio >= 2.5) return RoomType.Charnel
    if (r.w * r.h >= 30 && ratio < 1.8) return RoomType.Sanctum
    return RoomType.Standard
  })
}

/** Return the RoomType of whichever room contains pos, or Standard if none. */
export function getRoomTypeAt(rooms: Room[], roomTypes: RoomType[], pos: Position): RoomType {
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i]
    if (pos.x >= r.x && pos.x < r.x + r.w && pos.y >= r.y && pos.y < r.y + r.h) {
      return roomTypes[i]
    }
  }
  return RoomType.Standard
}

function carvRoom(grid: Grid, room: Room): void {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      grid[y][x].type = TileType.Floor
    }
  }
}

function carvCorridor(grid: Grid, a: Room, b: Room): void {
  const ax = Math.floor(a.x + a.w / 2)
  const ay = Math.floor(a.y + a.h / 2)
  const bx = Math.floor(b.x + b.w / 2)
  const by = Math.floor(b.y + b.h / 2)
  // L-shaped corridor: horizontal then vertical
  const minX = Math.min(ax, bx)
  const maxX = Math.max(ax, bx)
  for (let x = minX; x <= maxX; x++) grid[ay][x].type = TileType.Floor
  const minY = Math.min(ay, by)
  const maxY = Math.max(ay, by)
  for (let y = minY; y <= maxY; y++) grid[y][bx].type = TileType.Floor
}

function splitBSP(rng: Rng, x: number, y: number, w: number, h: number, depth: number, rooms: Room[]): void {
  const minSize = 5
  const splitChance = depth < 4 ? 0.9 : 0.5

  const canSplitH = w >= minSize * 2
  const canSplitV = h >= minSize * 2

  if ((!canSplitH && !canSplitV) || !chance(rng, splitChance)) {
    // Leaf — create a room with 1-tile padding from partition walls
    const pad = 1
    const rw = roll(rng, Math.min(4, w - pad * 2), w - pad * 2)
    const rh = roll(rng, Math.min(4, h - pad * 2), h - pad * 2)
    const rx = x + pad + roll(rng, 0, w - pad * 2 - rw)
    const ry = y + pad + roll(rng, 0, h - pad * 2 - rh)
    rooms.push({ x: rx, y: ry, w: rw, h: rh })
    return
  }

  const splitH = canSplitH && (!canSplitV || chance(rng, 0.5))
  if (splitH) {
    const split = roll(rng, minSize, w - minSize)
    splitBSP(rng, x, y, split, h, depth + 1, rooms)
    splitBSP(rng, x + split, y, w - split, h, depth + 1, rooms)
  } else {
    const split = roll(rng, minSize, h - minSize)
    splitBSP(rng, x, y, w, split, depth + 1, rooms)
    splitBSP(rng, x, y + split, w, h - split, depth + 1, rooms)
  }
}

export function generateFloor(seed: number, rng: Rng): { grid: Grid; playerStart: Position; exitPos: Position; rooms: Room[]; roomTypes: RoomType[] } {
  // Init all walls
  const grid: Grid = Array.from({ length: GRID_H }, () =>
    Array.from({ length: GRID_W }, () => ({
      type: TileType.Wall,
      fog: FogState.Hidden,
      encountered: false,
    }))
  )

  const rooms: Room[] = []
  splitBSP(rng, 1, 1, GRID_W - 2, GRID_H - 2, 0, rooms)

  // Carve rooms
  for (const room of rooms) carvRoom(grid, room)

  // Carve corridors (connect each room to the next)
  for (let i = 1; i < rooms.length; i++) carvCorridor(grid, rooms[i - 1], rooms[i])

  // Place exit in last room
  const exitRoom = rooms[rooms.length - 1]
  const exitPos: Position = {
    x: Math.floor(exitRoom.x + exitRoom.w / 2),
    y: Math.floor(exitRoom.y + exitRoom.h / 2),
  }
  grid[exitPos.y][exitPos.x].type = TileType.Exit

  // Player starts in center of first room
  const startRoom = rooms[0]
  const playerStart: Position = {
    x: Math.floor(startRoom.x + startRoom.w / 2),
    y: Math.floor(startRoom.y + startRoom.h / 2),
  }

  return { grid, playerStart, exitPos, rooms, roomTypes: classifyRooms(rooms) }
}

// ─── Fog of War ────────────────────────────────────────────────────────────

const FOG_RADIUS = 2

export function revealFog(grid: Grid, pos: Position, radius = FOG_RADIUS): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = pos.x + dx
      const ny = pos.y + dy
      if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H) {
        grid[ny][nx].fog = FogState.Revealed
      }
    }
  }
}

// ─── Movement ──────────────────────────────────────────────────────────────

export function isWalkable(grid: Grid, pos: Position): boolean {
  const { x, y } = pos
  if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return false
  return grid[y][x].type !== TileType.Wall
}

export function getNeighbors(pos: Position): Position[] {
  return [
    { x: pos.x, y: pos.y - 1 },
    { x: pos.x, y: pos.y + 1 },
    { x: pos.x - 1, y: pos.y },
    { x: pos.x + 1, y: pos.y },
  ]
}

// ─── Stats ─────────────────────────────────────────────────────────────────

export interface FloorStats {
  totalTiles: number
  floorTiles: number
  wallTiles: number
  roomCount: number
  revealedTiles: number
}

export function getFloorStats(grid: Grid, rooms: Room[]): FloorStats {
  let floorTiles = 0
  let revealedTiles = 0
  const totalTiles = GRID_W * GRID_H
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid[y][x].type !== TileType.Wall) floorTiles++
      if (grid[y][x].fog === FogState.Revealed) revealedTiles++
    }
  }
  return { totalTiles, floorTiles, wallTiles: totalTiles - floorTiles, roomCount: rooms.length, revealedTiles }
}
