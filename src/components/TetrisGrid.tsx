/**
 * TetrisGrid — 10×4 drag-and-drop inventory grid.
 *
 * Layout (top → bottom inside the container):
 *   EQUIP_H  px  "↑ EQUIP" drop zone (drag item here to equip)
 *   GRID_H   px  actual 10×4 grid cells
 *   BIN_H    px  "╳ DROP"  drop zone  (drag item here to discard)
 *
 * STALE CLOSURE FIX: all prop-callbacks are kept in a ref so the PanResponder
 * (created once in useRef) always calls the latest version.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react'
import { View, Text, PanResponder, StyleSheet, Dimensions, Animated } from 'react-native'
import * as Haptics from 'expo-haptics'
import {
  INV_COLS, INV_ROWS,
  canPlace as engineCanPlace,
  removeItem as engineRemove,
  findItemPosition,
  getItems,
} from '../engine/inventory'
import type { InventoryGrid, Placement } from '../engine/inventory'
import type { EquipSlot } from '../engine/inventory'
import type { Item } from '../engine/loot'
import { QUALITY_BG, getItemColor, getItemBorderColor, SLOT_ICON, itemEquipSlot } from '../utils/itemDisplay'
import { COLORS } from '../theme'

// ── Shared shimmer animation — one loop drives all rare/unique overlays ────────
const SHIMMER_ANIM = new Animated.Value(0)
Animated.loop(
  Animated.sequence([
    Animated.timing(SHIMMER_ANIM, { toValue: 1, duration: 1400, useNativeDriver: true }),
    Animated.timing(SHIMMER_ANIM, { toValue: 0, duration: 1400, useNativeDriver: true }),
  ])
).start()

const SCREEN_W  = Dimensions.get('window').width
const H_PAD     = 16
export const CELL_SIZE = Math.floor((SCREEN_W - H_PAD * 2) / INV_COLS)

const EQUIP_H = 40   // equip zone at top
const GRID_H  = CELL_SIZE * INV_ROWS
const GRID_W  = CELL_SIZE * INV_COLS
const BIN_H   = 44   // discard zone at bottom
const TOTAL_H = EQUIP_H + GRID_H + BIN_H

function itemBg(item: Item): string {
  if (item.baseId === 'town_portal_scroll') return COLORS.bg
  if (item.runewordId) return COLORS.goldDim
  return QUALITY_BG[item.quality] ?? COLORS.surface
}
function isEquippable(item: Item): boolean {
  return item.slot !== 'rune' && item.slot !== 'charm'
}

interface Props {
  grid:         InventoryGrid
  onMove:       (uid: string, pos: Placement) => void
  onDrop:       (uid: string) => void
  onTap:        (uid: string) => void   // short tap → show detail sheet
  onEquip?:     (uid: string) => void   // drag to equip zone
  onDragSlot?:  (slot: EquipSlot | null) => void  // highlight target equip slot while dragging
}

export function TetrisGrid({ grid, onMove, onDrop, onTap, onEquip, onDragSlot }: Props) {
  const gridViewRef = useRef<View>(null)

  // ── Callbacks ref ── keeps PanResponder from ever calling stale closures ──
  const cb = useRef({ onMove, onDrop, onTap, onEquip, onDragSlot })
  useEffect(() => { cb.current = { onMove, onDrop, onTap, onEquip, onDragSlot } }, [onMove, onDrop, onTap, onEquip, onDragSlot])

  // ── All mutable drag state lives here — no stale closure risk ─────────────
  const d = useRef({
    grid,
    containerOrigin: { x: H_PAD, y: 0 },  // absolute screen coords of container top-left
    uid:        null as string | null,
    touchOff:   { x: 0, y: 0 },           // touch point relative to item top-left in container px
    hoverPos:   null as Placement | null,
    overBin:    false,
    overEquip:  false,
    wasDrag:    false,
  })
  useEffect(() => { d.current.grid = grid }, [grid])

  // ── React state — drives renders only ─────────────────────────────────────
  const [dragUid,    setDragUid]     = useState<string | null>(null)
  const [dragPixel,  setDragPixel]   = useState({ x: 0, y: 0 })  // item top-left in container px
  const [hoverRender,setHoverRender] = useState<Placement | null>(null)
  const [overBin,    setOverBin]     = useState(false)
  const [overEquip,  setOverEquip]   = useState(false)

  const measureOrigin = useCallback(() => {
    gridViewRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
      d.current.containerOrigin = { x: pageX, y: pageY }
    })
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder:        () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder:         () => true,
      onMoveShouldSetPanResponderCapture:  () => !!d.current.uid,
      onPanResponderTerminationRequest:    () => false,

      // ── Touch start ───────────────────────────────────────────────────────
      onPanResponderGrant: (_evt, gs) => {
        gridViewRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
          d.current.containerOrigin = { x: pageX, y: pageY }
        })
        const origin = d.current.containerOrigin
        const lx = gs.x0 - origin.x            // x in container
        const ly = gs.y0 - origin.y            // y in container
        const lyGrid = ly - EQUIP_H            // y relative to grid top

        const col = Math.floor(lx / CELL_SIZE)
        const row = Math.floor(lyGrid / CELL_SIZE)
        if (col < 0 || col >= INV_COLS || row < 0 || row >= INV_ROWS) return

        const uid = d.current.grid.cells[row]?.[col] ?? null
        if (!uid) return
        const item = d.current.grid.items[uid]
        if (!item) return
        const itemPos = findItemPosition(d.current.grid, uid)
        if (!itemPos) return

        // touchOff: distance from item's container top-left to the touch point
        d.current.uid       = uid
        d.current.touchOff  = {
          x: lx - itemPos.col * CELL_SIZE,
          y: ly - (EQUIP_H + itemPos.row * CELL_SIZE),
        }
        d.current.hoverPos  = itemPos
        d.current.overBin   = false
        d.current.overEquip = false
        d.current.wasDrag   = false

        const itemContainerTop  = EQUIP_H + itemPos.row * CELL_SIZE
        const itemContainerLeft = itemPos.col * CELL_SIZE

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
        setDragUid(uid)
        setDragPixel({ x: itemContainerLeft, y: itemContainerTop })
        setHoverRender(itemPos)
        setOverBin(false)
        setOverEquip(false)
      },

      // ── Touch move ────────────────────────────────────────────────────────
      onPanResponderMove: (_evt, gs) => {
        const uid = d.current.uid
        if (!uid) return
        if (Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5) d.current.wasDrag = true

        const origin    = d.current.containerOrigin
        const lx        = gs.moveX - origin.x
        const ly        = gs.moveY - origin.y
        const itemLeft  = lx - d.current.touchOff.x       // container px
        const itemTop   = ly - d.current.touchOff.y       // container px
        const gridItemTop = itemTop - EQUIP_H             // grid-relative px

        setDragPixel({ x: itemLeft, y: itemTop })

        const item = d.current.grid.items[uid]
        if (!item) return
        const [w, h] = item.size

        const bin   = gridItemTop + h * CELL_SIZE > GRID_H + 6
        const equip = itemTop < EQUIP_H / 2 && isEquippable(item)
        d.current.overBin   = bin
        d.current.overEquip = equip
        setOverBin(bin)
        setOverEquip(equip)
        cb.current.onDragSlot?.(equip ? itemEquipSlot(item) : null)

        if (!bin && !equip) {
          const hp: Placement = {
            col: Math.max(0, Math.min(INV_COLS - w, Math.round(itemLeft / CELL_SIZE))),
            row: Math.max(0, Math.min(INV_ROWS - h, Math.round(gridItemTop / CELL_SIZE))),
          }
          d.current.hoverPos = hp
          setHoverRender(hp)
        } else {
          d.current.hoverPos = null
          setHoverRender(null)
        }
      },

      // ── Touch end ─────────────────────────────────────────────────────────
      onPanResponderRelease: (_evt, gs) => {
        const uid     = d.current.uid
        const bin     = d.current.overBin
        const equip   = d.current.overEquip
        const hp      = d.current.hoverPos
        const wasDrag = d.current.wasDrag || Math.abs(gs.dx) > 8 || Math.abs(gs.dy) > 8

        d.current.uid     = null
        d.current.hoverPos = null
        d.current.overBin = false
        d.current.overEquip = false

        setDragUid(null)
        setHoverRender(null)
        setOverBin(false)
        setOverEquip(false)
        cb.current.onDragSlot?.(null)

        if (!uid) return

        if (!wasDrag) {
          Haptics.selectionAsync().catch(() => {})
          cb.current.onTap(uid)
          return
        }

        if (equip) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
          cb.current.onEquip?.(uid)
          return
        }

        if (bin) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
          cb.current.onDrop(uid)
          return
        }

        if (hp) {
          const item = d.current.grid.items[uid]
          if (item) {
            const gridWithout = engineRemove(d.current.grid, uid)
            if (engineCanPlace(gridWithout, item, hp)) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
              cb.current.onMove(uid, hp)
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
            }
          }
        }
      },

      onPanResponderTerminate: () => {
        d.current.uid       = null
        d.current.hoverPos  = null
        d.current.overBin   = false
        d.current.overEquip = false
        setDragUid(null)
        setHoverRender(null)
        setOverBin(false)
        setOverEquip(false)
        cb.current.onDragSlot?.(null)
      },
    })
  ).current

  // ── Hover validity ────────────────────────────────────────────────────────
  const dragItem = dragUid ? grid.items[dragUid] : null
  const isDraggingPotion = dragItem?.slot === 'potion'
  let isValidDrop = false
  if (dragItem && hoverRender && !overBin && !overEquip) {
    const gridWithout = engineRemove(grid, dragUid!)
    isValidDrop = engineCanPlace(gridWithout, dragItem, hoverRender)
  }

  return (
    <View
      ref={gridViewRef}
      onLayout={measureOrigin}
      style={[styles.container, { width: GRID_W, height: TOTAL_H }]}
      {...panResponder.panHandlers}
    >
      {/* ── EQUIP zone ───────────────────────────────────────────────────── */}
      <View
        pointerEvents="none"
        style={[styles.equipZone, overEquip && styles.equipZoneActive, { top: 0, width: GRID_W, height: EQUIP_H }]}
      >
        <Text style={[styles.zoneText, overEquip && styles.zoneTextActive]}>
          {overEquip
            ? (isDraggingPotion ? '⬆  USE' : '⬆  EQUIP')
            : (isDraggingPotion ? '↑  drag here to use' : '↑  drag here to equip')}
        </Text>
      </View>

      {/* ── Background grid cells ─────────────────────────────────────────── */}
      {Array.from({ length: INV_ROWS }, (_, r) =>
        Array.from({ length: INV_COLS }, (_, c) => (
          <View
            key={`bg${r}-${c}`}
            pointerEvents="none"
            style={[styles.bgCell, {
              left:   c * CELL_SIZE,
              top:    EQUIP_H + r * CELL_SIZE,
              width:  CELL_SIZE,
              height: CELL_SIZE,
            }]}
          />
        ))
      )}

      {/* ── Hover preview ─────────────────────────────────────────────────── */}
      {hoverRender && dragItem && !overBin && !overEquip && (
        <View
          pointerEvents="none"
          style={[styles.preview, {
            left:   hoverRender.col * CELL_SIZE,
            top:    EQUIP_H + hoverRender.row * CELL_SIZE,
            width:  dragItem.size[0] * CELL_SIZE,
            height: dragItem.size[1] * CELL_SIZE,
            backgroundColor: isValidDrop ? 'rgba(46,204,64,0.18)' : 'rgba(231,76,60,0.18)',
            borderColor:     isValidDrop ? COLORS.hpHigh : COLORS.red,
          }]}
        />
      )}

      {/* ── Placed items ──────────────────────────────────────────────────── */}
      {getItems(grid).map(item => {
        if (item.uid === dragUid) return null
        const pos = findItemPosition(grid, item.uid)
        if (!pos) return null
        const [w, h] = item.size
        const isRune   = item.slot === 'rune'
        const isPotion = item.slot === 'potion'
        const isShimmer = item.quality === 'rare' || item.quality === 'unique' || !!item.runewordId
        const shimmerColor = item.runewordId ? COLORS.runewordColor
                           : item.quality === 'unique' ? COLORS.quality.unique
                           : COLORS.quality.rare
        const shimmerMax = item.quality === 'unique' ? 0.20 : 0.12
        return (
          <View
            key={item.uid}
            pointerEvents="none"
            style={[styles.itemRect, {
              left:   pos.col * CELL_SIZE + 1,
              top:    EQUIP_H + pos.row * CELL_SIZE + 1,
              width:  w * CELL_SIZE - 2,
              height: h * CELL_SIZE - 2,
              backgroundColor: itemBg(item),
              borderColor:     getItemBorderColor(item),
            }]}
          >
            {/* Shimmer overlay for rare / unique / runeword */}
            {isShimmer && (
              <Animated.View
                style={[StyleSheet.absoluteFillObject, {
                  borderRadius: 3,
                  backgroundColor: shimmerColor,
                  opacity: SHIMMER_ANIM.interpolate({
                    inputRange: [0, 1], outputRange: [0, shimmerMax],
                  }),
                }]}
              />
            )}

            {/* Potion display */}
            {isPotion ? (
              <>
                <Text style={[styles.itemIcon, {
                  color: item.baseId === 'hp_potion' ? COLORS.hpHigh : COLORS.manaBar,
                }]}>
                  {item.baseId === 'hp_potion' ? '❤' : item.baseId === 'mana_potion' ? '💧' : '📜'}
                </Text>
                {(item.quantity ?? 1) > 1 ? (
                  <Text style={[styles.itemQty, {
                    color: item.baseId === 'hp_potion' ? COLORS.hpHigh : COLORS.manaBar,
                  }]}>
                    ×{item.quantity}
                  </Text>
                ) : (
                  <Text style={[styles.itemName, {
                    color: item.baseId === 'hp_potion' ? COLORS.hpHigh : COLORS.manaBar,
                    fontSize: 7,
                  }]}>
                    {item.baseId === 'hp_potion' ? 'HP' : item.baseId === 'mana_potion' ? 'MP' : 'TP'}
                  </Text>
                )}
              </>
            ) : isRune ? (
              <>
                <Text style={[styles.itemIcon, { color: COLORS.runewordColor }]}>
                  {SLOT_ICON.rune}
                </Text>
                <Text style={[styles.itemName, { color: COLORS.runewordColor, fontSize: 7 }]} numberOfLines={1}>
                  {item.baseId.replace('rune_', '').toUpperCase()}
                </Text>
              </>
            ) : (
              <Text style={[styles.itemName, { color: getItemColor(item) }]} numberOfLines={3}>
                {item.displayName}
              </Text>
            )}

            {item.sockets > 0 && (
              <Text style={styles.sockets}>
                {'○'.repeat(item.sockets - item.insertedRunes.length)}
                {'●'.repeat(item.insertedRunes.length)}
              </Text>
            )}
          </View>
        )
      })}

      {/* ── Drag ghost ────────────────────────────────────────────────────── */}
      {dragUid && dragItem && (
        <View
          pointerEvents="none"
          style={[styles.itemRect, styles.ghost, {
            left:   dragPixel.x + 1,
            top:    dragPixel.y + 1,
            width:  dragItem.size[0] * CELL_SIZE - 2,
            height: dragItem.size[1] * CELL_SIZE - 2,
            backgroundColor: (overBin || overEquip) ? (overBin ? COLORS.redDim : COLORS.greenDim) : itemBg(dragItem),
            borderColor:     (overBin || overEquip) ? (overBin ? COLORS.red : COLORS.green) : getItemBorderColor(dragItem),
          }]}
        >
          <Text style={[styles.itemName, {
            color: (overBin || overEquip) ? (overBin ? COLORS.red : COLORS.hpHigh) : getItemColor(dragItem)
          }]} numberOfLines={3}>
            {dragItem.displayName}
          </Text>
        </View>
      )}

      {/* ── BIN zone ──────────────────────────────────────────────────────── */}
      <View
        pointerEvents="none"
        style={[styles.binZone, overBin && styles.binZoneActive, {
          top:   EQUIP_H + GRID_H,
          width: GRID_W,
          height: BIN_H,
        }]}
      >
        <Text style={[styles.zoneText, overBin && styles.zoneTextActive]}>
          {overBin ? '🗑  DROP ITEM' : '╳  drag here to drop'}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  bgCell: {
    position: 'absolute',
    borderWidth: 0.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  preview: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 3,
    zIndex: 10,
  },
  itemRect: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 3,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  ghost: {
    opacity: 0.85,
    zIndex: 30,
  },
  itemIcon: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 15,
  },
  itemQty: {
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.3,
    lineHeight: 11,
  },
  itemName: {
    fontSize: 8,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
    lineHeight: 10,
  },
  sockets: {
    color: COLORS.textSecondary,
    fontSize: 7,
    marginTop: 1,
  },
  equipZone: {
    position: 'absolute',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.card,
  },
  equipZoneActive: {
    backgroundColor: COLORS.greenDim,
    borderBottomColor: COLORS.green,
  },
  binZone: {
    position: 'absolute',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.card,
  },
  binZoneActive: {
    backgroundColor: COLORS.redDim,
    borderTopColor: COLORS.red,
  },
  zoneText: {
    color: COLORS.textGhost,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  zoneTextActive: {
    color: COLORS.textSecondary,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
})
