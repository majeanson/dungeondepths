import { describe, test, expect } from 'bun:test'
import { makeRng } from './rng'
import { generateFloor, revealFog, isWalkable, getNeighbors, getFloorStats, TileType, FogState, GRID_W, GRID_H } from './grid'

function makeFloor(seed = 42) {
  const rng = makeRng(seed)
  return generateFloor(seed, rng)
}

describe('generateFloor', () => {
  test('grid is correct dimensions', () => {
    const { grid } = makeFloor()
    expect(grid).toHaveLength(GRID_H)
    expect(grid[0]).toHaveLength(GRID_W)
  })

  test('same seed produces identical floor', () => {
    const a = makeFloor(100)
    const b = makeFloor(100)
    for (let y = 0; y < GRID_H; y++)
      for (let x = 0; x < GRID_W; x++)
        expect(a.grid[y][x].type).toBe(b.grid[y][x].type)
  })

  test('different seeds produce different floors', () => {
    const a = makeFloor(1)
    const b = makeFloor(2)
    let diff = 0
    for (let y = 0; y < GRID_H; y++)
      for (let x = 0; x < GRID_W; x++)
        if (a.grid[y][x].type !== b.grid[y][x].type) diff++
    expect(diff).toBeGreaterThan(10)
  })

  test('has walkable floor tiles', () => {
    const { grid } = makeFloor()
    const stats = getFloorStats(grid, [])
    expect(stats.floorTiles).toBeGreaterThan(50)
  })

  test('has at least one exit tile', () => {
    const { grid, exitPos } = makeFloor()
    expect(grid[exitPos.y][exitPos.x].type).toBe(TileType.Exit)
  })

  test('player start is walkable', () => {
    const { grid, playerStart } = makeFloor()
    const tile = grid[playerStart.y][playerStart.x]
    expect(tile.type).not.toBe(TileType.Wall)
  })

  test('all rooms generated', () => {
    const { rooms } = makeFloor()
    expect(rooms.length).toBeGreaterThan(3)
  })

  test('all tiles start hidden', () => {
    const { grid } = makeFloor()
    for (let y = 0; y < GRID_H; y++)
      for (let x = 0; x < GRID_W; x++)
        expect(grid[y][x].fog).toBe(FogState.Hidden)
  })

  test('outer border is all walls', () => {
    const { grid } = makeFloor()
    for (let x = 0; x < GRID_W; x++) {
      expect(grid[0][x].type).toBe(TileType.Wall)
      expect(grid[GRID_H - 1][x].type).toBe(TileType.Wall)
    }
    for (let y = 0; y < GRID_H; y++) {
      expect(grid[y][0].type).toBe(TileType.Wall)
      expect(grid[y][GRID_W - 1].type).toBe(TileType.Wall)
    }
  })
})

describe('revealFog', () => {
  test('reveals tiles in radius around position', () => {
    const { grid } = makeFloor()
    const pos = { x: 25, y: 25 }
    revealFog(grid, pos, 2)
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        expect(grid[25 + dy][25 + dx].fog).toBe(FogState.Revealed)
  })

  test('does not reveal tiles outside radius', () => {
    const { grid } = makeFloor()
    revealFog(grid, { x: 25, y: 25 }, 1)
    // Tile 3 away should still be hidden (unless it was already revealed)
    expect(grid[25][28].fog).toBe(FogState.Hidden)
  })

  test('handles edge positions without throwing', () => {
    const { grid } = makeFloor()
    expect(() => revealFog(grid, { x: 0, y: 0 })).not.toThrow()
    expect(() => revealFog(grid, { x: GRID_W - 1, y: GRID_H - 1 })).not.toThrow()
  })
})

describe('isWalkable', () => {
  test('floor tile is walkable', () => {
    const { grid, playerStart } = makeFloor()
    expect(isWalkable(grid, playerStart)).toBe(true)
  })

  test('out of bounds is not walkable', () => {
    const { grid } = makeFloor()
    expect(isWalkable(grid, { x: -1, y: 0 })).toBe(false)
    expect(isWalkable(grid, { x: GRID_W, y: 0 })).toBe(false)
    expect(isWalkable(grid, { x: 0, y: GRID_H })).toBe(false)
  })
})

describe('getNeighbors', () => {
  test('returns 4 neighbors', () => {
    expect(getNeighbors({ x: 5, y: 5 })).toHaveLength(4)
  })

  test('neighbors are adjacent', () => {
    const n = getNeighbors({ x: 5, y: 5 })
    const positions = n.map(p => `${p.x},${p.y}`)
    expect(positions).toContain('5,4')
    expect(positions).toContain('5,6')
    expect(positions).toContain('4,5')
    expect(positions).toContain('6,5')
  })
})
