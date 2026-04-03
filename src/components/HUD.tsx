/**
 * Bottom HUD — gothic stone-panel with HP/MP orbs, XP/ST mini-bars,
 * player portrait, and floor/class info row.
 */
import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated } from 'react-native'
import { getHpColor, COLORS } from '../theme'
import { tierName, difficultyLabel, difficultyColor } from '../utils/tierName'
import { PlayerPortrait } from './PlayerPortrait'

interface HUDProps {
  hp:           number
  maxHp:        number
  stamina:      number
  maxStamina:   number
  floor:        number
  tier:         number
  level:        number
  xpCurrent:    number
  xpNeeded:     number
  mana:         number
  maxMana:      number
  classId?:     string | null
  classLabel?:  string
  classColor?:  string
  isBossFloor?: boolean
  ghostEchoActive?: boolean
}

// ── Blood orb — circular fill from bottom ────────────────────────────────────
function GlobeOrb({ value, max, color, label, lowHp }: {
  value: number; max: number; color: string; label: string; lowHp?: boolean
}) {
  const pct = Math.min(1, Math.max(0, max > 0 ? value / max : 0))
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!lowHp) { pulseAnim.setValue(1); return }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.35, duration: 420, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 420, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [lowHp])

  return (
    <Animated.View style={[globeStyles.outer, lowHp && { borderColor: COLORS.red, opacity: pulseAnim }]}>
      <View style={[globeStyles.fill, { height: `${pct * 100}%`, backgroundColor: color }]} />
      <View style={globeStyles.content} pointerEvents="none">
        <Text style={globeStyles.value}>{value}</Text>
        <Text style={[globeStyles.label, { color }]}>{label}</Text>
      </View>
    </Animated.View>
  )
}

const GLOBE = 46
const globeStyles = StyleSheet.create({
  outer: {
    width:         GLOBE,
    height:        GLOBE,
    borderRadius:  GLOBE / 2,
    borderWidth:   2,
    borderColor:   '#2a1a18',
    overflow:      'hidden',
    backgroundColor: '#070303',
    justifyContent: 'center',
    alignItems:    'center',
  },
  fill: {
    position:  'absolute',
    bottom:    0,
    left:      0,
    right:     0,
    opacity:   0.80,
  },
  content: {
    alignItems: 'center',
    zIndex:     1,
  },
  value: {
    color:      '#ffffffcc',
    fontSize:   10,
    fontWeight: '900',
    lineHeight: 11,
  },
  label: {
    fontSize:    7,
    fontWeight:  '800',
    letterSpacing: 0.5,
    lineHeight:  8,
    opacity:     0.9,
  },
})

// ── Thin accent bar — XP / ST ─────────────────────────────────────────────────
function MiniBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <View style={miniStyles.row}>
      <Text style={[miniStyles.label, { color }]}>{label}</Text>
      <View style={miniStyles.track}>
        <View style={[miniStyles.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  )
}
const miniStyles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: 7, fontWeight: '900', letterSpacing: 0.5, width: 12 },
  track: { flex: 1, height: 5, backgroundColor: COLORS.surface2, overflow: 'hidden' },
  fill:  { height: '100%' },
})

export function HUD({
  hp, maxHp, stamina, maxStamina, floor, tier, level,
  xpCurrent, xpNeeded, mana, maxMana,
  classId, classLabel, classColor, isBossFloor, ghostEchoActive,
}: HUDProps) {
  const hpPct   = Math.min(1, Math.max(0, hp / maxHp))
  const stPct   = Math.min(1, Math.max(0, stamina / maxStamina))
  const mpPct   = maxMana > 0 ? Math.min(1, Math.max(0, mana / maxMana)) : 0
  const xpPct   = xpNeeded > 0 ? Math.min(1, xpCurrent / xpNeeded) : 1
  const hpColor = getHpColor(hpPct)
  const hasMana = maxMana > 0

  const diffLabel = difficultyLabel(tier)
  const diffColor = difficultyColor(tier)

  return (
    <View style={styles.panel}>
      {/* Inset stone frame line */}
      <View style={styles.frameInner}>

        {/* ── Info row ─────────────────────────────────────────────────── */}
        <View style={styles.infoRow}>
          <View style={[
            styles.badge,
            isBossFloor && styles.badgeBoss,
            !isBossFloor && diffLabel === 'NIGHTMARE' && styles.badgeNightmare,
            !isBossFloor && diffLabel === 'HELL' && styles.badgeHell,
          ]}>
            <Text style={[
              styles.badgeText,
              isBossFloor && styles.badgeTextBoss,
              !isBossFloor && diffColor != null && { color: diffColor },
            ]}>
              {isBossFloor ? '☠ ' : ''}{diffLabel && !isBossFloor ? `${diffLabel} · ` : ''}T{tier}·F{floor}
            </Text>
            {!isBossFloor && (
              <Text style={[styles.tierNameText, diffColor ? { color: diffColor, opacity: 0.6 } : {}]}>
                {tierName(tier)}
              </Text>
            )}
          </View>

          {classLabel && classColor && (
            <View style={[styles.classChip, { borderColor: classColor + '44' }]}>
              <View style={[styles.classDot, { backgroundColor: classColor }]} />
              <Text style={[styles.classText, { color: classColor }]}>{classLabel.toUpperCase()}</Text>
            </View>
          )}

          <View style={styles.lvlBadge}>
            <Text style={styles.lvlText}>LVL {level}</Text>
          </View>

          {ghostEchoActive && (
            <View style={styles.echoChip}>
              <Text style={styles.echoText}>◈ ECHO</Text>
            </View>
          )}
        </View>

        {/* ── Orb row ──────────────────────────────────────────────────── */}
        <View style={styles.orbRow}>
          {/* Player portrait — left anchor */}
          <PlayerPortrait
            classId={classId ?? null}
            classColor={classColor ?? COLORS.textDim}
            hpPct={hpPct}
            size={GLOBE}
          />

          {/* HP orb */}
          <GlobeOrb value={hp} max={maxHp} color={hpColor} label="HP" lowHp={hpPct < 0.25} />

          {/* Center: thin bars for XP + ST (or just XP when showing ST orb) */}
          <View style={styles.centerBars}>
            <MiniBar label="XP" pct={xpPct} color={COLORS.xpBar} />
            {hasMana && <MiniBar label="ST" pct={stPct} color={COLORS.staminaBar} />}
          </View>

          {/* MP orb — or ST orb for non-mana classes */}
          {hasMana
            ? <GlobeOrb value={mana}    max={maxMana}    color={COLORS.manaBar}    label="MP" />
            : <GlobeOrb value={stamina} max={maxStamina} color={COLORS.staminaBar} label="ST" />
          }
        </View>
      </View>

      {/* Panel corner rivets */}
      <View style={[styles.panelRivet, styles.panelRivetTL]} />
      <View style={[styles.panelRivet, styles.panelRivetTR]} />
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: COLORS.card,
    borderTopWidth:  2,
    borderTopColor:  COLORS.border2,
  },
  frameInner: {
    borderTopWidth:  1,
    borderTopColor:  COLORS.border,
    paddingHorizontal: 12,
    paddingVertical:   8,
    gap: 6,
  },
  // ── Info row ──────────────────────────────────────────────────────────────────
  infoRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  badge: {
    backgroundColor: COLORS.surface2,
    borderWidth:     1,
    borderColor:     COLORS.border2,
    paddingHorizontal: 8,
    paddingVertical:   3,
  },
  badgeBoss: {
    backgroundColor: COLORS.redDim,
    borderColor:     COLORS.red,
  },
  badgeNightmare: {
    backgroundColor: COLORS.blueDim,
    borderColor:     COLORS.blue + '66',
  },
  badgeHell: {
    backgroundColor: COLORS.redDim,
    borderColor:     COLORS.red + '66',
  },
  badgeText: {
    color:        COLORS.textSecondary,
    fontSize:     10,
    fontWeight:   '700',
    letterSpacing: 1,
  },
  badgeTextBoss: {
    color: COLORS.red,
  },
  tierNameText: {
    color:        COLORS.textDim,
    fontSize:     7,
    letterSpacing: 1.2,
    textAlign:    'center',
    opacity:      0.8,
  },
  classChip: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
    backgroundColor: COLORS.surface,
    borderWidth:   1,
    paddingHorizontal: 8,
    paddingVertical:   3,
  },
  classDot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  classText: {
    fontSize:     10,
    fontWeight:   '800',
    letterSpacing: 1.5,
  },
  lvlBadge: {
    backgroundColor: COLORS.card,
    borderWidth:     1,
    borderColor:     COLORS.gold + '44',
    paddingHorizontal: 8,
    paddingVertical:   3,
  },
  lvlText: {
    color:        COLORS.gold,
    fontSize:     10,
    fontWeight:   '800',
    letterSpacing: 1,
  },
  echoChip: {
    backgroundColor: COLORS.card,
    borderWidth:     1,
    borderColor:     COLORS.purple + '88',
    paddingHorizontal: 6,
    paddingVertical:   3,
  },
  echoText: {
    color:        COLORS.purple,
    fontSize:     9,
    fontWeight:   '800',
    letterSpacing: 1,
  },
  // ── Orb row ───────────────────────────────────────────────────────────────────
  orbRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  centerBars: {
    flex: 1,
    gap:  5,
  },
  // ── Panel corner rivets ───────────────────────────────────────────────────────
  panelRivet: {
    position:        'absolute',
    top:             0,
    width:           6,
    height:          6,
    backgroundColor: COLORS.border2,
  },
  panelRivetTL: { left:  0 },
  panelRivetTR: { right: 0 },
})
