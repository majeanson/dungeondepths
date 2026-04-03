import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, TouchableOpacity, Text, StyleSheet, Dimensions, PanResponder, Animated, Alert } from 'react-native'
import { useFadeTransition } from '../hooks/useFadeTransition'
import { useGridStore, STAMINA_MAX, type Direction } from '../store/gridStore'
import { useGameStore } from '../store/gameStore'
import { useCombatStore } from '../store/combatStore'
import { buildPlayerStats, xpToNextLevel } from '../engine/stats'
import { useInventoryStore } from '../store/inventoryStore'
import { freeCells, INV_COLS, INV_ROWS } from '../engine/inventory'
import { DPad } from '../components/DPad'
import { HUD } from '../components/HUD'
import { LegendOverlay } from '../components/LegendOverlay'
import { TierClearOverlay } from '../components/TierClearOverlay'
import { EncounterSplash, type EncounterSplashData } from '../components/EncounterSplash'
import { FogState, TileType, RoomType, GRID_W, GRID_H, getRoomTypeAt } from '../engine/grid'
import { EncounterType, rollEncounter, floorPacingWeights, isBossFloor } from '../engine/encounter'
import { makeRng } from '../engine/rng'
import { rollLoot } from '../engine/loot'
import { CLASSES } from '../data/classes'
import { useHaptics } from '../hooks/useHaptics'
import { useSettingsStore } from '../store/settingsStore'
import { COLORS } from '../theme'
import { difficultyLabel } from '../utils/tierName'

const SCREEN_W = Dimensions.get('window').width
const SCREEN_H = Dimensions.get('window').height

// Subtle per-tier tints — T1=neutral, T2=blue (Nightmare), T3+=red (Hell), deeper tiers shift hue
const TIER_BG: Record<number, string> = {
  1: '#0d0d0f',
  2: '#0d0d10',
  3: '#100d0d',
  4: '#110d0d',
  5: '#120d0d',
}

// ── Zoom levels — cell size in pixels ────────────────────────────────────────
const ZOOM_CELLS = [16, 22, 30] as const
type ZoomLevel = 0 | 1 | 2
const DEFAULT_ZOOM: ZoomLevel = 1   // 22px — ~17 cols, clear tiles
// Pinch: must travel this many px difference to trigger a zoom step
const PINCH_THRESHOLD = 55

function vpDims(cellSize: number) {
  const cols = Math.min(GRID_W, Math.floor(SCREEN_W / cellSize))
  const rows = Math.min(GRID_H, Math.max(8, Math.floor((SCREEN_H - 260) / cellSize)))
  return { cols, rows }
}

// ── Tile colors ───────────────────────────────────────────────────────────────
const TILE_COLORS: Record<number, string> = {
  [TileType.Wall]:  COLORS.tile.wall,
  [TileType.Floor]: COLORS.tile.floor,
  [TileType.Exit]:  COLORS.tile.exit,
}
const FOG_COLOR     = COLORS.tile.fog
const VISITED_FLOOR = COLORS.tile.explored
// Fog-edge bleed: floor tiles adjacent to fog get a clearly dimmer tone (transition zone)
const FOG_EDGE_COLOR = '#201810'

const ENC_TILE_COLOR: Partial<Record<EncounterType, string>> = {
  [EncounterType.Normal]:  COLORS.tile.floor,
  [EncounterType.Elite]:   COLORS.blueDim,
  [EncounterType.Rare]:    COLORS.tile.rare,
  [EncounterType.Ancient]: COLORS.tile.boss,
  [EncounterType.Chest]:   COLORS.tile.chest,
  [EncounterType.Shrine]:  COLORS.tile.shrine,
  [EncounterType.Boss]:    COLORS.tile.boss,
}
const ENC_DOT_COLOR: Partial<Record<EncounterType, string>> = {
  [EncounterType.Normal]:  '#ffffff',
  [EncounterType.Elite]:   COLORS.encounter.elite,
  [EncounterType.Rare]:    COLORS.encounter.rare,
  [EncounterType.Ancient]: COLORS.encounter.ancient,
  [EncounterType.Chest]:   COLORS.encounter.chest,
  [EncounterType.Shrine]:  COLORS.encounter.shrine,
  [EncounterType.Boss]:    COLORS.encounter.boss,
}

// ── Encounter glyphs — Unicode symbols per type ───────────────────────────────
const ENC_GLYPH: Partial<Record<EncounterType, string>> = {
  [EncounterType.Boss]:    '☠',
  [EncounterType.Elite]:   '·',
  [EncounterType.Rare]:    '✦',
  [EncounterType.Ancient]: '◈',
  [EncounterType.Chest]:   '◆',
  [EncounterType.Shrine]:  '✺',
  [EncounterType.Normal]:  '•',
}

/** Returns true if this visible tile is adjacent to any fog-hidden tile. */
function isFogEdge(grid: ({ fog: FogState } | null | undefined)[][], gx: number, gy: number): boolean {
  return (
    grid[gy - 1]?.[gx]?.fog === FogState.Hidden ||
    grid[gy + 1]?.[gx]?.fog === FogState.Hidden ||
    grid[gy]?.[gx - 1]?.fog === FogState.Hidden ||
    grid[gy]?.[gx + 1]?.fog === FogState.Hidden
  )
}

// Show legend hint once per app session
let legendHintShown = false

const ECHO_WHISPERS: Record<string, string> = {
  weapon:  'She always struck before the monster could raise its guard.',
  offhand: 'She said: the shield is your second weapon.',
  helmet:  'She watched the ceiling. Most adventurers don\'t.',
  chest:   'She survived three elites on that armor. So can you.',
  gloves:  'Her grip never slipped — not even at the end.',
  legs:    'She ran when she had to. She stopped when she should.',
  boots:   'She found the exit before it found her.',
  belt:    'She always kept one potion in reserve. Until she didn\'t.',
  amulet:  'She felt the shrine before she saw it.',
  ring:    'She wore it for luck. It almost worked.',
  circlet: 'She counted floors. You should too.',
}

export function GridScreen() {
  const { grid, playerPos, floor, seed: gridSeed, stamina, pendingEncounter, reachedExit, movePlayer, clearEncounter,
          rooms, roomTypes, bossDefeated,
          restoreStamina: gridRestoreStamina, initFloor: gridInitFloor, cancelExit } = useGridStore()
  const { floor: gameFloor, setScreen, playerHp, playerMaxHp, healPlayer,
          tier, level, xp, mana, maxMana, classId, restoreMana,
          returnedFromTown, setReturnedFromTown, ghostCharm,
          clearFirstTimeTierClear, graveyard,
          activeStake, stakeClaimed, stakeBonusItem, clearStakeBonusItem,
          runKills, runRareItemsFound,
          echoWhisperShown, markEchoWhisperShown } = useGameStore()
  const activeStkDef = activeStake ? ({
    slayer:    { target: 75, progress: runKills },
    scavenger: { target: 10, progress: runRareItemsFound },
    deepdiver: { target: 7,  progress: gameFloor },
  } as const)[activeStake] : null
  const { zoomLevel: savedZoom, setZoomLevel: persistZoom,
          hasSeenGhostEchoHint, markGhostEchoHintSeen } = useSettingsStore()
  const { gainScroll, openChest } = useCombatStore()
  const { bag: bagStore, equipped } = useInventoryStore()
  const bagItems = bagStore.items
  const bagFree = freeCells(bagStore)
  const bagUsed = INV_COLS * INV_ROWS - bagFree
  const bagIsFull   = bagFree === 0
  const bagIsNearly = !bagIsFull && bagUsed / (INV_COLS * INV_ROWS) >= 0.75
  const scrollItems = Object.values(bagItems).filter(i => i.baseId === 'town_portal_scroll')
  const townPortalScrolls = scrollItems.length
  const [legendVisible, setLegendVisible] = useState(false)
  const classDef = classId ? CLASSES.find(c => c.id === classId) : null

  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(savedZoom)
  const zoomLevelRef = useRef<ZoomLevel>(savedZoom)
  const [zoomLocked, setZoomLocked] = useState(false)
  const zoomLockedRef = useRef(false)
  useEffect(() => { zoomLevelRef.current = zoomLevel }, [zoomLevel])

  // ── Map pan offset (in cells, from player-centered default) ─────────────────
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const panOffsetRef    = useRef({ x: 0, y: 0 })
  const panDragBase     = useRef({ x: 0, y: 0 })

  // Auto-center when player actually moves
  useEffect(() => {
    panOffsetRef.current = { x: 0, y: 0 }
    setPanOffset({ x: 0, y: 0 })
  }, [playerPos.x, playerPos.y])

  const [ghostEchoHint, setGhostEchoHint] = useState(false)
  const [stakeToast, setStakeToast] = useState<string | null>(null)
  const [echoWhisper, setEchoWhisper] = useState<string | null>(null)
  const [restToast, setRestToast] = useState<string | null>(null)
  const restToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cellSize = ZOOM_CELLS[zoomLevel]
  const { cols: vpCols, rows: vpRows } = vpDims(cellSize)

  const haptics = useHaptics()
  const [townReturnFlash, setTownReturnFlash] = useState(false)
  const townReturnAnim = useRef(new Animated.Value(0)).current
  const [encounterSplash, setEncounterSplash] = useState<EncounterSplashData | null>(null)
  const [tierClear, setTierClear] = useState<{ tier: number; isFirstTime: boolean } | null>(null)
  const [shrineToast, setShrineToast] = useState<string | null>(null)
  const [bossFloorWarn, setBossFloorWarn] = useState(false)
  const [legendHint, setLegendHint] = useState(false)
  const prevFloorRef    = useRef(gameFloor)
  const bossWarnTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const splashRef = useRef(false)

  useEffect(() => { splashRef.current = !!encounterSplash }, [encounterSplash])

  // Legend hint — once per session
  useEffect(() => {
    if (legendHintShown) return
    legendHintShown = true
    const t = setTimeout(() => setLegendHint(true), 1500)
    return () => clearTimeout(t)
  }, [])

  // Ghost Echo discoverability hint — once per install, when graveyard has items but echo is not active
  useEffect(() => {
    if (hasSeenGhostEchoHint || ghostCharm || graveyard.length === 0) return
    let t2: ReturnType<typeof setTimeout>
    const t1 = setTimeout(() => {
      setGhostEchoHint(true)
      markGhostEchoHintSeen()
      t2 = setTimeout(() => setGhostEchoHint(false), 4000)
    }, 2000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [graveyard.length, ghostCharm])

  // Stake bonus item — consume into bag; fallback to stash; show toast
  const invStore = useInventoryStore
  useEffect(() => {
    if (!stakeBonusItem) return
    const added = invStore.getState().addItem(stakeBonusItem)
    let msg: string
    if (added) {
      msg = '★ STAKE CLAIMED — bonus item added to bag'
    } else {
      const stashed = useGameStore.getState().depositToStash(stakeBonusItem)
      msg = stashed
        ? '★ STAKE CLAIMED — bag full, item sent to stash'
        : '★ STAKE CLAIMED — bag & stash full, bonus item lost!'
    }
    clearStakeBonusItem()
    setStakeToast(msg)
    const t = setTimeout(() => setStakeToast(null), 4500)
    return () => clearTimeout(t)
  }, [stakeBonusItem])

  // Stake claimed (no drop) — still show toast once
  useEffect(() => {
    if (!stakeClaimed || stakeBonusItem) return
    setStakeToast('★ STAKE CLAIMED')
    const t = setTimeout(() => setStakeToast(null), 3000)
    return () => clearTimeout(t)
  }, [stakeClaimed])

  // Echo Whisper — once on floor 1 when ghostCharm is active
  useEffect(() => {
    if (gameFloor !== 1 || !ghostCharm || echoWhisperShown) return
    let t2: ReturnType<typeof setTimeout>
    const t1 = setTimeout(() => {
      setEchoWhisper(ECHO_WHISPERS[ghostCharm.slot] ?? 'The echo of another run guides you.')
      markEchoWhisperShown()
      t2 = setTimeout(() => setEchoWhisper(null), 6000)
    }, 2500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [gameFloor, ghostCharm?.uid, echoWhisperShown])

  // Town portal return — brief gold flash + haptic
  useEffect(() => {
    if (!returnedFromTown) return
    setReturnedFromTown(false)
    setTownReturnFlash(true)
    haptics.impactLight()
    townReturnAnim.setValue(1)
    Animated.timing(townReturnAnim, { toValue: 0, duration: 900, useNativeDriver: true }).start(() => {
      setTownReturnFlash(false)
    })
  }, [returnedFromTown])

  // Boss floor warning on floor change
  useEffect(() => {
    if (gameFloor !== prevFloorRef.current && isBossFloor(gameFloor)) {
      haptics.notificationError()
      setBossFloorWarn(true)
      if (bossWarnTimer.current) clearTimeout(bossWarnTimer.current)
      bossWarnTimer.current = setTimeout(() => setBossFloorWarn(false), 3000)
    }
    prevFloorRef.current = gameFloor
    return () => { if (bossWarnTimer.current) clearTimeout(bossWarnTimer.current) }
  }, [gameFloor])

  const fadeIn = useFadeTransition(300)
  const playerStats = useMemo(
    () => buildPlayerStats(floor, level, equipped, classId, ghostCharm),
    [floor, level, equipped, classId, ghostCharm],
  )
  const { current: xpCurrent, needed: xpNeeded } = xpToNextLevel(xp)

  // No clamping — allow viewport to extend past map edges so corner/edge players can
  // still be centered. Out-of-bounds tiles render as solid stone (grid[y]?.[x] === undefined).
  // Pan is clamped only to prevent scrolling more than half a screen beyond the map.
  const vpStartX = playerPos.x - Math.floor(vpCols / 2) + panOffset.x
  const vpStartY = playerPos.y - Math.floor(vpRows / 2) + panOffset.y

  // ── Pulsing player indicator ───────────────────────────────────────────────
  const playerPulse = useRef(new Animated.Value(0.6)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(playerPulse, { toValue: 1,    duration: 700, useNativeDriver: true }),
        Animated.timing(playerPulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])

  // ── Pulsing exit tile ──────────────────────────────────────────────────────
  const exitPulse = useRef(new Animated.Value(0.35)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(exitPulse, { toValue: 1,    duration: 1400, useNativeDriver: true }),
        Animated.timing(exitPulse, { toValue: 0.25, duration: 1400, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])

  useEffect(() => {
    if (!pendingEncounter) return
    const { type, monster } = pendingEncounter

    if (type === EncounterType.Shrine) {
      const scaleFactor = 1 + (tier - 1) * 0.5 + (gameFloor - 1) * 0.05
      const shrineHp  = Math.round(25 * scaleFactor)
      const shrineMp  = Math.round(15 * scaleFactor)
      const shrineSt  = Math.round(30 * scaleFactor)
      const shrineXp  = Math.round(10 + floor * 8)
      gridRestoreStamina(shrineSt)
      healPlayer(shrineHp)
      restoreMana(shrineMp)
      useGameStore.getState().gainXp(shrineXp)
      haptics.notificationSuccess()
      setShrineToast(`✺  SHRINE  ·  +${shrineHp} HP  ·  +${shrineMp} MP  ·  +${shrineSt} ST  ·  +${shrineXp} XP`)
      const t = setTimeout(() => setShrineToast(null), 2500)
      clearEncounter()
      return () => clearTimeout(t)
    }
    if (type === EncounterType.Chest) {
      const gs = useGameStore.getState()
      const inv = useInventoryStore.getState()
      const chestRng = makeRng(gs.seed ^ (gs.floor * 0x9e3779b9) ^ 0xc4e57ab)
      const chestLoot = rollLoot(chestRng, 'chest', floor, inv.magicFind)
      const chestXp = Math.round(15 + floor * 5)
      gs.gainXp(chestXp)
      gainScroll()
      openChest(chestLoot)
      clearEncounter()
      setScreen('loot')
      return
    }
    if (monster) {
      clearEncounter()
      const isBoss = type === EncounterType.Boss
      if (isBoss) haptics.notificationError()
      else haptics.impactMedium()
      setEncounterSplash({ monsterName: monster.name, affixes: monster.affixes, monster, type })
    }
  }, [pendingEncounter])

  useEffect(() => {
    if (!reachedExit) return
    const nextFloorNum = gameFloor + 1
    Alert.alert(
      'DESCEND?',
      `You found the stairs to floor ${nextFloorNum}. Descend now, or stay and clear the floor?`,
      [
        {
          text: 'Stay',
          style: 'cancel',
          onPress: () => cancelExit(),
        },
        {
          text: 'Descend',
          onPress: () => {
            const prevTier = useGameStore.getState().tier
            useGameStore.getState().nextFloor()
            const gs = useGameStore.getState()
            gridInitFloor(gs.floor, gs.seed)
            if (gs.tier > prevTier) setTierClear({ tier: gs.tier, isFirstTime: !!gs.firstTimeTierClear })
          },
        },
      ],
    )
  }, [reachedExit])

  function handleFight() {
    if (!encounterSplash) return
    useCombatStore.getState().startCombat(
      encounterSplash.monster, encounterSplash.type, floor, playerStats,
    )
    setEncounterSplash(null)
    setScreen('combat')
  }

  function handleTownVisit() {
    if (scrollItems.length === 0) return
    useInventoryStore.getState().dropItem(scrollItems[0].uid)
    setScreen('town')
  }

  function applyZoom(z: ZoomLevel) { setZoomLevel(z); zoomLevelRef.current = z; persistZoom(z) }
  function applyZoomWithHaptic(z: ZoomLevel) { applyZoom(z); haptics.impactLight() }
  function zoomIn()  { if (zoomLevelRef.current < 2) applyZoom((zoomLevelRef.current + 1) as ZoomLevel) }
  function zoomOut() { if (zoomLevelRef.current > 0) applyZoom((zoomLevelRef.current - 1) as ZoomLevel) }
  function toggleZoomLock() { const next = !zoomLockedRef.current; setZoomLocked(next); zoomLockedRef.current = next; haptics.impactLight() }

  // ── PanResponder — swipe to move + two-finger pinch to zoom ──────────────────
  const pinchStartDist = useRef<number | null>(null)

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !splashRef.current,
      onMoveShouldSetPanResponder:  () => !splashRef.current,

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches
        if (touches.length === 2) {
          const dx = touches[1].pageX - touches[0].pageX
          const dy = touches[1].pageY - touches[0].pageY
          pinchStartDist.current = Math.sqrt(dx * dx + dy * dy)
        } else {
          // Record where pan started
          panDragBase.current = { ...panOffsetRef.current }
        }
      },

      onPanResponderMove: (evt, gs) => {
        const touches = evt.nativeEvent.touches
        if (touches.length === 2 && pinchStartDist.current !== null) {
          const dx = touches[1].pageX - touches[0].pageX
          const dy = touches[1].pageY - touches[0].pageY
          const dist = Math.sqrt(dx * dx + dy * dy)
          const delta = dist - pinchStartDist.current
          if (Math.abs(delta) > PINCH_THRESHOLD) {
            if (delta > 0 && zoomLevelRef.current < 2) {
              applyZoomWithHaptic((zoomLevelRef.current + 1) as ZoomLevel)
            } else if (delta < 0 && zoomLevelRef.current > 0) {
              applyZoomWithHaptic((zoomLevelRef.current - 1) as ZoomLevel)
            }
            pinchStartDist.current = dist
          }
        } else if (touches.length === 1 && zoomLockedRef.current) {
          // Zoom-lock mode: treat vertical swipe as zoom
          const { dy } = gs
          if (Math.abs(dy) > PINCH_THRESHOLD) {
            if (dy < 0 && zoomLevelRef.current < 2) {
              applyZoomWithHaptic((zoomLevelRef.current + 1) as ZoomLevel)
            } else if (dy > 0 && zoomLevelRef.current > 0) {
              applyZoomWithHaptic((zoomLevelRef.current - 1) as ZoomLevel)
            }
          }
        } else if (touches.length === 1 && !zoomLockedRef.current) {
          // Single-finger drag: pan the viewport (drag right → see left, drag down → see up)
          const cs = ZOOM_CELLS[zoomLevelRef.current]
          const cellDx = Math.round(-gs.dx / cs)
          const cellDy = Math.round(-gs.dy / cs)
          const { cols: vCols, rows: vRows } = vpDims(cs)
          const nx = Math.max(-Math.ceil(vCols / 2), Math.min(Math.ceil(vCols / 2), panDragBase.current.x + cellDx))
          const ny = Math.max(-Math.ceil(vRows / 2), Math.min(Math.ceil(vRows / 2), panDragBase.current.y + cellDy))
          if (nx !== panOffsetRef.current.x || ny !== panOffsetRef.current.y) {
            panOffsetRef.current = { x: nx, y: ny }
            setPanOffset({ x: nx, y: ny })
          }
        }
      },

      onPanResponderRelease: (_evt, _gs) => {
        pinchStartDist.current = null
      },
    })
  ).current

  const bossFloor = isBossFloor(gameFloor)

  return (
    <Animated.View style={[styles.root, { opacity: fadeIn }]}>
      {/* ── Grid area ─────────────────────────────────────────────────────── */}
      <View style={[styles.gridArea, { backgroundColor: TIER_BG[tier] ?? TIER_BG[5] }]} {...panResponder.panHandlers}>
        <View style={styles.gridInner}>
          {Array.from({ length: vpRows }, (_, ry) => {
            const gy = vpStartY + ry
            return (
              <View key={gy} style={styles.row}>
                {Array.from({ length: vpCols }, (_, rx) => {
                  const gx = vpStartX + rx
                  const tile = grid[gy]?.[gx]
                  if (!tile) return <View key={gx} style={[styles.cell, { width: cellSize, height: cellSize, backgroundColor: '#0e0b0a' }]} />

                  const isPlayer = gx === playerPos.x && gy === playerPos.y
                  const isHidden = tile.fog === FogState.Hidden

                  let encType: EncounterType | null = null
                  if (!isHidden && !tile.encountered && tile.type === TileType.Floor && !isPlayer) {
                    if (isBossFloor(floor) && !bossDefeated) {
                      encType = EncounterType.Boss
                    } else {
                      const tileRng = makeRng(gridSeed + floor * 777 + gx * 31 + gy * 97)
                      const baseWeights = floorPacingWeights(floor)
                      const roomType = getRoomTypeAt(rooms, roomTypes, { x: gx, y: gy })
                      const weights = roomType === RoomType.Charnel
                        ? { ...baseWeights, elite: baseWeights.elite * 3, ancient: baseWeights.ancient * 2, shrine: 1, chest: 1 }
                        : roomType === RoomType.Sanctum
                        ? { ...baseWeights, shrine: baseWeights.shrine * 5, chest: baseWeights.chest * 4, elite: Math.floor(baseWeights.elite * 0.3) }
                        : baseWeights
                      encType = rollEncounter(tileRng, floor, weights)
                      if (encType === EncounterType.Empty) encType = null
                    }
                  }

                  let bgColor: string = FOG_COLOR
                  if (!isHidden) {
                    if (tile.type === TileType.Wall) {
                      bgColor = TILE_COLORS[TileType.Wall]
                    } else if (tile.type === TileType.Exit) {
                      bgColor = TILE_COLORS[TileType.Exit]
                    } else if (tile.encountered) {
                      bgColor = VISITED_FLOOR
                    } else if (encType && ENC_TILE_COLOR[encType]) {
                      bgColor = ENC_TILE_COLOR[encType]!
                    } else {
                      // Room-type floor tints + fog-edge bleed
                      const rt = getRoomTypeAt(rooms, roomTypes, { x: gx, y: gy })
                      const roomFloorColor = rt === RoomType.Charnel
                        ? '#100808'
                        : rt === RoomType.Sanctum
                        ? '#07060f'
                        : TILE_COLORS[TileType.Floor]
                      bgColor = isFogEdge(grid, gx, gy) ? FOG_EDGE_COLOR : roomFloorColor
                    }
                  }

                  const dotColor = encType ? ENC_DOT_COLOR[encType] : undefined
                  const glyph    = encType ? ENC_GLYPH[encType]     : undefined
                  const cs = cellSize
                  // Glyph font size scales with cell, capped so it stays readable
                  const isSmallEnemy = encType === EncounterType.Normal || encType === EncounterType.Elite
                  const glyphSize = Math.max(5, Math.floor(cs * (isSmallEnemy ? 0.80 : 0.55)))

                  return (
                    <View
                      key={gx}
                      style={[
                        styles.cell,
                        { width: cs, height: cs, backgroundColor: bgColor },
                        isHidden && styles.cellHidden,
                      ]}
                    >
                      {/* Player — pulsing amber diamond */}
                      {isPlayer && (
                        <Animated.View
                          style={[
                            styles.playerTile,
                            { width: cs - 4, height: cs - 4, borderRadius: Math.max(2, cs / 8), opacity: playerPulse },
                          ]}
                        />
                      )}

                      {/* Exit — pulsing green with glyph */}
                      {!isPlayer && tile.type === TileType.Exit && !isHidden && (
                        <Animated.View style={[styles.exitTile, { width: cs - 2, height: cs - 2, opacity: exitPulse }]}>
                          <Text style={[styles.exitGlyph, { fontSize: Math.max(5, cs / 5) }]}>▼</Text>
                        </Animated.View>
                      )}

                      {/* Encounter glyph */}
                      {!isPlayer && encType !== null && dotColor && glyph && (
                        <Text
                          style={[
                            encType === EncounterType.Boss ? styles.bossGlyph : styles.encGlyph,
                            { fontSize: glyphSize, color: dotColor },
                          ]}
                        >
                          {glyph}
                        </Text>
                      )}
                    </View>
                  )
                })}
              </View>
            )
          })}
        </View>

        {/* Re-center button — shown when viewport is panned away from player */}
        {(panOffset.x !== 0 || panOffset.y !== 0) && (
          <TouchableOpacity
            style={styles.recenterBtn}
            onPress={() => { panOffsetRef.current = { x: 0, y: 0 }; setPanOffset({ x: 0, y: 0 }) }}
          >
            <Text style={styles.recenterBtnText}>⊕</Text>
          </TouchableOpacity>
        )}

        {/* Floor / tier watermark */}
        <View style={styles.floorLabel} pointerEvents="none">
          <Text style={styles.floorLabelText}>
            {bossFloor ? '☠ ' : ''}FLOOR {gameFloor} · {difficultyLabel(tier) ?? `TIER ${tier}`}
          </Text>
        </View>

        {/* Town portal return flash */}
        {townReturnFlash && (
          <Animated.View style={[styles.townReturnFlash, { opacity: townReturnAnim }]} pointerEvents="none">
            <Text style={styles.townReturnText}>RETURNED FROM TOWN</Text>
          </Animated.View>
        )}

        {/* Shrine toast */}
        {shrineToast && (
          <View style={styles.shrineToast} pointerEvents="none">
            <Text style={styles.shrineToastText}>{shrineToast}</Text>
          </View>
        )}

        {/* Boss floor warning */}
        {bossFloorWarn && (
          <View style={styles.bossFloorWarn} pointerEvents="none">
            <Text style={styles.bossFloorWarnText}>☠  BOSS FLOOR</Text>
            <Text style={styles.bossFloorWarnSub}>Prepare before engaging — stock potions</Text>
          </View>
        )}

        {/* Ghost Echo discoverability hint */}
        {ghostEchoHint && (
          <View style={styles.ghostEchoHint} pointerEvents="none">
            <Text style={styles.ghostEchoHintText}>◈  GHOST ECHO</Text>
            <Text style={styles.ghostEchoHintSub}>Visit the Graveyard to invoke a fallen item's power</Text>
          </View>
        )}

        {/* Stake progress badge */}
        {activeStake && !stakeClaimed && activeStkDef && (
          <View style={styles.stakeBadge} pointerEvents="none">
            <Text style={styles.stakeBadgeText}>
              {activeStake.toUpperCase()}  {Math.min(activeStkDef.progress, activeStkDef.target)}/{activeStkDef.target}
            </Text>
          </View>
        )}

        {/* Stake claimed toast */}
        {stakeToast && (
          <View style={styles.stakeToast} pointerEvents="none">
            <Text style={styles.stakeToastText}>{stakeToast}</Text>
          </View>
        )}

        {/* Rest toast */}
        {restToast && (
          <View style={styles.restToast} pointerEvents="none">
            <Text style={styles.restToastText}>{restToast}</Text>
          </View>
        )}

        {/* Echo Whisper */}
        {echoWhisper && (
          <View style={styles.echoWhisper} pointerEvents="none">
            <Text style={styles.echoWhisperText}>◈  "{echoWhisper}"</Text>
          </View>
        )}
      </View>

      {/* ── HUD ──────────────────────────────────────────────────────────────── */}
      <HUD
        hp={playerHp}       maxHp={playerMaxHp}
        stamina={stamina}   maxStamina={STAMINA_MAX}
        floor={gameFloor}   tier={tier}
        level={level}       xpCurrent={xpCurrent}    xpNeeded={xpNeeded}
        mana={mana}         maxMana={maxMana}
        classId={classId}
        classLabel={classDef?.name}
        classColor={classDef?.color}
        isBossFloor={bossFloor}
        ghostEchoActive={!!ghostCharm}
      />

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <View style={styles.controls}>
        <DPad
          onPress={(dir: Direction) => {
            const moved = movePlayer(dir)
            if (moved) haptics.impactLight()
            else       haptics.notificationWarning()
          }}
          onWait={() => {
            const gridSt = useGridStore.getState()
            const gs     = useGameStore.getState()
            if (gridSt.stamina < 2) {
              haptics.notificationWarning()
              if (restToastTimer.current) clearTimeout(restToastTimer.current)
              setRestToast('⚡ Too exhausted to rest')
              restToastTimer.current = setTimeout(() => setRestToast(null), 1800)
              return
            }
            gridSt.drainStamina(2)
            const restHeal = Math.max(3, Math.round(gs.playerMaxHp * 0.04))
            gs.healPlayer(restHeal)
            gs.restoreMana(3)
            haptics.impactLight()
            if (restToastTimer.current) clearTimeout(restToastTimer.current)
            setRestToast(`✦ REST  ·  +${restHeal} HP  ·  +3 MP`)
            restToastTimer.current = setTimeout(() => setRestToast(null), 1800)
          }}
        />

        <View style={styles.rightPanel}>
          {/* Zoom row — kept as fallback alongside pinch */}
          <View style={styles.zoomRow}>
            <TouchableOpacity
              style={[styles.zoomBtn, zoomLevel === 0 && styles.btnDisabled]}
              onPress={zoomOut}
              disabled={zoomLevel === 0}
            >
              <Text style={[styles.zoomBtnText, zoomLevel === 0 && styles.btnTextDisabled]}>
                {zoomLevel === 0 ? 'MIN' : '−'}
              </Text>
            </TouchableOpacity>
            <View style={styles.zoomDots}>
              {[0, 1, 2].map(z => (
                <View key={z} style={[styles.zoomDot, zoomLevel === z && styles.zoomDotActive]} />
              ))}
            </View>
            <TouchableOpacity
              style={[styles.zoomBtn, zoomLevel === 2 && styles.btnDisabled]}
              onPress={zoomIn}
              disabled={zoomLevel === 2}
            >
              <Text style={[styles.zoomBtnText, zoomLevel === 2 && styles.btnTextDisabled]}>
                {zoomLevel === 2 ? 'MAX' : '+'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.zoomLockBtn, zoomLocked && styles.zoomLockBtnActive]}
              onPress={toggleZoomLock}
            >
              <Text style={[styles.zoomBtnText, zoomLocked && styles.zoomLockBtnTextActive]}>
                {zoomLocked ? '🔒' : '🔓'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Town portal */}
          <TouchableOpacity
            style={[styles.actionBtn, townPortalScrolls === 0 && styles.btnDisabled, bossFloor && styles.actionBtnBoss]}
            onPress={handleTownVisit}
            disabled={townPortalScrolls === 0}
          >
            <Text style={[styles.actionBtnText, townPortalScrolls === 0 && styles.btnTextDisabled]}>
              TOWN
            </Text>
            <Text style={[styles.actionBtnSub, townPortalScrolls === 0 && styles.btnTextDisabled]}>
              {townPortalScrolls > 0 ? `📜 ×${townPortalScrolls}` : '📜 ×0'}
            </Text>
          </TouchableOpacity>

          {/* Bag + Legend row */}
          <View style={styles.miniRow}>
            <TouchableOpacity
              style={[styles.miniBtn, styles.miniBtnPrimary, bagIsNearly && styles.miniBtnNearly, bagIsFull && styles.miniBtnFull]}
              onPress={() => setScreen('inventory')}
            >
              <Text style={[styles.miniBtnText, bagIsNearly && styles.miniBtnTextNearly, bagIsFull && styles.miniBtnTextFull]}>BAG</Text>
              <Text style={[styles.miniBtnSub, bagIsNearly && styles.miniBtnTextNearly, bagIsFull && styles.miniBtnTextFull]}>{bagUsed}/{INV_COLS * INV_ROWS}</Text>
            </TouchableOpacity>
            <View style={styles.legendBtnWrap}>
              <TouchableOpacity
                style={[styles.miniBtn, legendHint && styles.miniBtnHinted]}
                onPress={() => { setLegendVisible(v => !v); setLegendHint(false) }}
              >
                <Text style={styles.miniBtnText}>?</Text>
              </TouchableOpacity>
              {legendHint && (
                <View style={styles.legendHintBubble} pointerEvents="none">
                  <Text style={styles.legendHintText}>Tap for tile legend</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* ── Overlays ──────────────────────────────────────────────────────── */}
      {legendVisible && (
        <LegendOverlay
          onClose={() => setLegendVisible(false)}
          onOpenGuide={() => { setLegendVisible(false); setScreen('codex') }}
          onEndRun={() => { setLegendVisible(false); useGameStore.getState().endRun(false) }}
        />
      )}
      {tierClear && (
        <TierClearOverlay
          tier={tierClear.tier}
          isFirstTime={tierClear.isFirstTime}
          onDismiss={() => { setTierClear(null); clearFirstTimeTierClear() }}
        />
      )}
      {encounterSplash && (
        <EncounterSplash splash={encounterSplash} onFight={handleFight} />
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  // ── Grid ─────────────────────────────────────────────────────────────────────
  gridArea: {
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
  },
  gridInner: {
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    borderWidth: 0.5,
    borderColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellHidden: {
    borderColor: COLORS.tile.fog,
  },
  // ── Player ───────────────────────────────────────────────────────────────────
  playerTile: {
    backgroundColor: COLORS.gold,
    borderWidth: 1,
    borderColor: COLORS.gold,
    shadowColor: COLORS.glow.rune,
    shadowRadius: 4,
    shadowOpacity: 0.9,
    shadowOffset: { width: 0, height: 0 },
  },
  // ── Boss glyph (larger, no extra treatment) ───────────────────────────────────
  bossGlyph: {
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: false,
  },
  // ── Generic encounter glyph ───────────────────────────────────────────────────
  encGlyph: {
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
  // ── Exit tile ────────────────────────────────────────────────────────────────
  exitTile: {
    backgroundColor: COLORS.tile.exit,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exitGlyph: {
    color: COLORS.gold,
    fontWeight: '900',
    lineHeight: 14,
  },
  // ── Re-center button ─────────────────────────────────────────────────────────
  recenterBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 20,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenterBtnText: {
    color: COLORS.gold,
    fontSize: 18,
    lineHeight: 22,
  },
  // ── Floor / tier watermark ────────────────────────────────────────────────────
  floorLabel: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  floorLabelText: {
    color: COLORS.textGhost,
    fontSize: 9,
    letterSpacing: 2.5,
    fontWeight: '700',
  },
  // ── Town portal return flash ──────────────────────────────────────────────────
  townReturnFlash: {
    position: 'absolute',
    top: '30%',
    left: 24,
    right: 24,
    alignItems: 'center',
    zIndex: 40,
  },
  townReturnText: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.gold,
    color: COLORS.gold,
    fontSize: 11,
    letterSpacing: 2.5,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 4,
    textAlign: 'center',
  },
  // ── Shrine toast ──────────────────────────────────────────────────────────────
  shrineToast: {
    position: 'absolute',
    top: '35%',
    left: 24,
    right: 24,
    alignItems: 'center',
    zIndex: 40,
  },
  shrineToastText: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.purple,
    color: COLORS.purple,
    fontSize: 11,
    letterSpacing: 2.5,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 4,
    textAlign: 'center',
    overflow: 'hidden',
  },
  // ── Boss floor warning ────────────────────────────────────────────────────────
  bossFloorWarn: {
    position: 'absolute',
    top: '30%',
    left: 24,
    right: 24,
    alignItems: 'center',
    zIndex: 41,
    gap: 6,
  },
  bossFloorWarnText: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.red,
    color: COLORS.red,
    fontSize: 16,
    letterSpacing: 3,
    fontWeight: '900',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 4,
    textAlign: 'center',
    overflow: 'hidden',
  },
  bossFloorWarnSub: {
    color: COLORS.textDim,
    fontSize: 10,
    letterSpacing: 1,
    textAlign: 'center',
  },
  // ── Controls ──────────────────────────────────────────────────────────────────
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 10,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  rightPanel: {
    gap: 7,
    alignItems: 'stretch',
    minWidth: 100,
  },
  // ── Zoom controls ─────────────────────────────────────────────────────────────
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  zoomBtn: {
    minWidth: 36,
    height: 28,
    paddingHorizontal: 4,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    letterSpacing: 0.5,
  },
  zoomDots: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    width: 28,
    justifyContent: 'center',
  },
  zoomDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.border2,
  },
  zoomDotActive: {
    backgroundColor: COLORS.gold,
  },
  zoomLockBtn: {
    width: 28,
    height: 28,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomLockBtnActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldDim,
  },
  zoomLockBtnTextActive: {
    color: COLORS.gold,
  },
  // ── Ghost Echo hint ───────────────────────────────────────────────────────────
  ghostEchoHint: {
    position: 'absolute',
    top: '25%',
    left: 24,
    right: 24,
    alignItems: 'center',
    zIndex: 42,
    gap: 4,
  },
  ghostEchoHintText: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.purple,
    color: COLORS.purple,
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '900',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 4,
    textAlign: 'center',
    overflow: 'hidden',
  },
  ghostEchoHintSub: {
    color: COLORS.textDim,
    fontSize: 10,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  stakeBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: COLORS.goldDim,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stakeBadgeText: {
    color: COLORS.gold,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  stakeToast: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    backgroundColor: COLORS.goldDim,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  stakeToastText: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  restToast: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.hpHigh,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  restToastText: {
    color: COLORS.hpHigh,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  echoWhisper: {
    position: 'absolute',
    bottom: 110,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  echoWhisperText: {
    color: COLORS.purple,
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.3,
    lineHeight: 17,
  },
  // ── Action buttons ────────────────────────────────────────────────────────────
  actionBtn: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border2,
    borderRadius: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 1,
  },
  actionBtnBoss: {
    borderColor: COLORS.redDim,
  },
  actionBtnText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  actionBtnSub: {
    color: COLORS.textDim,
    fontSize: 7,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  miniRow: {
    flexDirection: 'row',
    gap: 7,
  },
  miniBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingVertical: 7,
    alignItems: 'center',
    gap: 1,
  },
  miniBtnPrimary: {
    borderColor: COLORS.border2,
  },
  miniBtnNearly: {
    borderColor: COLORS.red + '88',
  },
  miniBtnTextNearly: {
    color: COLORS.red,
  },
  miniBtnFull: {
    borderColor: COLORS.gold + '88',
    backgroundColor: COLORS.goldDim,
  },
  miniBtnText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  miniBtnSub: {
    color: COLORS.textDim,
    fontSize: 8,
    letterSpacing: 0.5,
  },
  miniBtnTextFull: {
    color: COLORS.gold,
  },
  legendBtnWrap: {
    flex: 1,
    overflow: 'visible',
  },
  miniBtnHinted: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldDim,
  },
  legendHintBubble: {
    position: 'absolute',
    bottom: 44,
    right: 0,
    backgroundColor: COLORS.gold,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minWidth: 110,
    alignItems: 'center',
  },
  legendHintText: {
    color: COLORS.bg,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  btnDisabled: {
    opacity: 0.25,
    borderColor: COLORS.border,
  },
  btnTextDisabled: {
    color: COLORS.textDim,
  },
})
