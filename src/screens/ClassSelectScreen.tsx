import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Dimensions, Animated, Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFadeTransition } from '../hooks/useFadeTransition'
import { useGameStore, STAKE_DEFS, PACT_DEFS, type StakeId, type PactId } from '../store/gameStore'
import { xpToNextLevel } from '../engine/stats'
import { useGridStore } from '../store/gridStore'
import { useCombatStore } from '../store/combatStore'
import { CLASSES, type ClassId } from '../data/classes'
import { getSkillsForClass } from '../data/skills'
import { difficultyLabel, difficultyColor } from '../utils/tierName'
import { StatBar } from '../components/StatBar'
import { DifficultyBadge } from '../components/DifficultyBadge'
import { BonusChip } from '../components/BonusChip'
import { COLORS } from '../theme'

const CLASS_SYMBOL: Record<ClassId, string> = {
  warrior:  '⚔',
  rogue:    '🗡',
  sorcerer: '✦',
}

const CLASS_DIFFICULTY: Record<ClassId, { stars: number; label: string }> = {
  warrior:  { stars: 1, label: 'BEGINNER FRIENDLY' },
  rogue:    { stars: 2, label: 'INTERMEDIATE' },
  sorcerer: { stars: 3, label: 'ADVANCED' },
}

const CLASS_STATS: Record<ClassId, { hp: number; mana: number; damage: number; defense: number }> = {
  warrior:  { hp: 5, mana: 2, damage: 3, defense: 5 },
  rogue:    { hp: 3, mana: 3, damage: 5, defense: 2 },
  sorcerer: { hp: 2, mana: 5, damage: 4, defense: 1 },
}

export function ClassSelectScreen() {
  const insets = useSafeAreaInsets()
  const { classId: savedClassId, selectClass, startRun, level, xp, setScreen, runStarted, classXp, activeStake, setStake, activePact, setPact, careerStats } = useGameStore()
  const { initFloor } = useGridStore()
  const { refillPotions } = useCombatStore()

  // Pre-select the previously played class so returning players don't have to re-tap
  const [selected, setSelected] = useState<ClassId | null>(savedClassId)
  const [startFloor, setStartFloor] = useState(1)

  const { level: _lvl, current: xpCurrent, needed: xpNeeded } = xpToNextLevel(xp)
  const fadeIn = useFadeTransition(350)

  const selectedDef = selected ? CLASSES.find(c => c.id === selected) : null

  // Waypoints: absolute floor checkpoints available for run entry.
  // A waypoint at absFloor N is unlocked if deepestFloorByClass[class] >= N.
  const WAYPOINTS = [1, 5, 10, 15, 20, 25, 30]
  function waypointLabel(absFloor: number): string {
    const t = Math.floor((absFloor - 1) / 10) + 1
    const f = ((absFloor - 1) % 10) + 1
    return f === 10 ? `T${t}·F10 ☠` : `T${t}·F${f}`
  }
  const deepestForClass = selected ? (careerStats.deepestFloorByClass?.[selected] ?? 0) : 0
  function isWaypointUnlocked(absFloor: number) {
    return absFloor === 1 || deepestForClass >= absFloor
  }

  // Tap a card → select the class (loads its XP/level), but don't start the run
  function handleClassPick(classId: ClassId) {
    setSelected(classId)
    selectClass(classId)
    setStartFloor(1)  // reset to floor 1 when switching class
  }

  function doDescend() {
    if (!selected) return
    refillPotions()
    const seed = Date.now()
    const localFloor = ((startFloor - 1) % 10) + 1
    startRun(seed, startFloor)
    initFloor(localFloor, seed)
  }

  // Red button → actually start the run
  function handleDescend() {
    if (!selected) return
    if (runStarted) {
      Alert.alert(
        'Abandon Current Run?',
        'Starting a new run will abandon your current dungeon. Bag items will be lost.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'New Run', style: 'destructive', onPress: doDescend },
        ],
      )
    } else {
      doDescend()
    }
  }

  return (
    <Animated.View style={[styles.root, { opacity: fadeIn }]}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        {runStarted ? (
          <TouchableOpacity onPress={() => setScreen('grid')} style={styles.backBtn}>
            <Text style={styles.backText}>← DUNGEON</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>CHOOSE CLASS</Text>
          {level > 0 && (
            <Text style={styles.headerSub}>LVL {level}  ·  PROGRESS CARRIES OVER</Text>
          )}
        </View>
        <View style={{ width: 80 }} />
      </View>

      {/* ── Top utility strip — always visible ──────────────────────────── */}
      <View style={styles.topUtility}>
        <TouchableOpacity style={styles.topUtilBtn} onPress={() => setScreen('inventory')}>
          <Text style={styles.topUtilIcon}>⚔</Text>
          <Text style={styles.topUtilLabel}>CHARACTER</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.topUtilBtn} onPress={() => setScreen('stash')}>
          <Text style={styles.topUtilIcon}>⬚</Text>
          <Text style={styles.topUtilLabel}>STASH</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.topUtilBtn} onPress={() => setScreen('codex')}>
          <Text style={styles.topUtilIcon}>✦</Text>
          <Text style={styles.topUtilLabel}>CODEX</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.topUtilBtn} onPress={() => setScreen('graveyard')}>
          <Text style={styles.topUtilIcon}>☠</Text>
          <Text style={styles.topUtilLabel}>GRAVEYARD</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.topUtilBtn} onPress={() => setScreen('settings')}>
          <Text style={styles.topUtilIcon}>⚙</Text>
          <Text style={styles.topUtilLabel}>SETTINGS</Text>
        </TouchableOpacity>
      </View>

      {/* ── XP strip ─────────────────────────────────────────────────────── */}
      {level > 0 && (
        <View style={styles.xpStrip}>
          <View style={styles.xpTrack}>
            <View style={[styles.xpFill, { width: `${xpNeeded > 0 ? (xpCurrent / xpNeeded) * 100 : 0}%` }]} />
          </View>
          <Text style={styles.xpLabel}>{xpCurrent} / {xpNeeded} XP to level {level + 1}</Text>
        </View>
      )}

      {/* ── Cards ────────────────────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={[styles.scroll, selected && styles.scrollWithFooter]}
        showsVerticalScrollIndicator={false}
      >
        {CLASSES.map(cls => {
          const skills     = getSkillsForClass(cls.id)
          const stats      = CLASS_STATS[cls.id]
          const diff       = CLASS_DIFFICULTY[cls.id]
          const symbol     = CLASS_SYMBOL[cls.id]
          const isSelected = selected === cls.id
          const clsProgress = classXp[cls.id]
          const clsLevel   = clsProgress?.level ?? 0
          const clsXp      = clsProgress?.xp ?? 0
          const { current: clsXpCurrent, needed: clsXpNeeded } = xpToNextLevel(clsXp)

          return (
            <TouchableOpacity
              key={cls.id}
              style={[
                styles.card,
                { borderColor: isSelected ? cls.color : cls.color + '44' },
                isSelected && { backgroundColor: cls.color + '0d' },
              ]}
              onPress={() => handleClassPick(cls.id)}
              activeOpacity={0.85}
            >
              {/* Card header */}
              <View style={styles.cardTop}>
                <View style={styles.cardTitleRow}>
                  <Text style={[styles.classSymbol, { color: cls.color }]}>{symbol}</Text>
                  <Text style={[styles.className, { color: cls.color }]}>{cls.name.toUpperCase()}</Text>
                  {diff.stars === 1 && (
                    <View style={styles.recommendedBadge}>
                      <Text style={styles.recommendedText}>STARTER</Text>
                    </View>
                  )}
                  {isSelected && (
                    <View style={[styles.selectedBadge, { borderColor: cls.color }]}>
                      <Text style={[styles.selectedBadgeText, { color: cls.color }]}>✓</Text>
                    </View>
                  )}
                </View>
                <View style={styles.cardMeta}>
                  <DifficultyBadge stars={diff.stars} label={diff.label} color={cls.color} />
                  {clsLevel > 0 ? (
                    <View style={[styles.clsLvlBadge, { borderColor: cls.color + '55', backgroundColor: cls.color + '11' }]}>
                      <Text style={[styles.clsLvlText, { color: cls.color }]}>LVL {clsLevel}</Text>
                      <Text style={[styles.clsXpText, { color: cls.color + '88' }]}>{clsXpCurrent}/{clsXpNeeded} XP</Text>
                    </View>
                  ) : (
                    <View style={[styles.clsLvlBadge, styles.clsNewBadge]}>
                      <Text style={styles.clsNewText}>NEW</Text>
                    </View>
                  )}
                </View>
              </View>

              <Text style={styles.classDesc}>{cls.description}</Text>
              <Text style={styles.classFlavor}>{cls.flavor}</Text>

              {/* Stat bars */}
              <View style={styles.statBlock}>
                <StatBar label="HEALTH"  value={stats.hp}      color={cls.color} />
                <StatBar label="MANA"    value={stats.mana}    color={cls.color} />
                <StatBar label="DAMAGE"  value={stats.damage}  color={cls.color} />
                <StatBar label="DEFENSE" value={stats.defense} color={cls.color} />
              </View>

              {/* Key bonuses */}
              <View style={styles.bonusRow}>
                {cls.bonusHp > 0  && <BonusChip text={`+${cls.bonusHp} HP`}     positive />}
                {cls.bonusHp < 0  && <BonusChip text={`${cls.bonusHp} HP`}     positive={false} />}
                {cls.bonusCritChance > 0 && <BonusChip text={`+${cls.bonusCritChance}% CRIT`} positive />}
                {cls.bonusDex > 0 && <BonusChip text={`+${cls.bonusDex} DEX`}  positive />}
                {cls.defensePerLevel > 0 && <BonusChip text={`+${cls.defensePerLevel} DEF/LVL`} positive />}
                {cls.spellPowerPerFloor > 0 && <BonusChip text={`SPELL SCALING`} positive />}
                <BonusChip text={`${cls.baseMana} MP BASE`} neutral />
              </View>

              {/* Skills */}
              <View style={styles.skillsBlock}>
                <Text style={styles.skillsTitle}>SKILLS</Text>
                {skills.map(skill => (
                  <View key={skill.id} style={styles.skillRow}>
                    <View style={[styles.skillLvlBadge, { borderColor: cls.color + '55' }]}>
                      <Text style={[styles.skillLvlText, { color: cls.color + 'bb' }]}>
                        {skill.levelRequired === 0 ? '—' : `${skill.levelRequired}`}
                      </Text>
                    </View>
                    <View style={styles.skillInfo}>
                      <Text style={[styles.skillName, { color: cls.color }]}>{skill.name}</Text>
                      <Text style={styles.skillDesc}>{skill.description}</Text>
                    </View>
                    {skill.manaCost > 0 && (
                      <Text style={styles.skillMana}>{skill.manaCost}mp</Text>
                    )}
                  </View>
                ))}
              </View>

              {/* Selection indicator row */}
              <View style={[
                styles.selectRow,
                { borderColor: isSelected ? cls.color + '66' : cls.color + '22', backgroundColor: cls.color + (isSelected ? '18' : '08') },
              ]}>
                <Text style={[styles.selectRowText, { color: isSelected ? cls.color : cls.color + '66' }]}>
                  {isSelected ? `✓  ${cls.name.toUpperCase()} SELECTED` : `TAP TO SELECT  ${cls.name.toUpperCase()}`}
                </Text>
              </View>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* ── Sticky footer — only visible when a class is chosen ──────────── */}
      {selected && selectedDef && (
        <View style={styles.footer}>
          {/* ── Stake picker ──────────────────────────────────────────── */}
          <View style={styles.stakeRow}>
            <Text style={styles.stakeLabel}>HUNT</Text>
            {STAKE_DEFS.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[styles.stakeChip, activeStake === s.id && styles.stakeChipActive]}
                onPress={() => setStake(activeStake === s.id ? null : s.id)}
              >
                <Text style={styles.stakeChipIcon}>{s.icon}</Text>
                <Text style={[styles.stakeChipText, activeStake === s.id && styles.stakeChipTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {activeStake && (
            <Text style={styles.stakeHint}>
              {STAKE_DEFS.find(s => s.id === activeStake)?.desc} — 35% bonus drop on success
            </Text>
          )}

          {/* ── Pact picker ──────────────────────────────────────────── */}
          <View style={styles.stakeRow}>
            <Text style={styles.pactLabel}>PACT</Text>
            {PACT_DEFS.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.stakeChip, styles.pactChip, activePact === p.id && styles.pactChipActive]}
                onPress={() => setPact(activePact === p.id ? null : p.id as PactId)}
              >
                <Text style={styles.stakeChipIcon}>{p.icon}</Text>
                <Text style={[styles.pactChipText, activePact === p.id && styles.pactChipTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {activePact && (
            <View style={styles.pactHintBox}>
              <Text style={styles.pactHintCurse}>✗  {PACT_DEFS.find(p => p.id === activePact)?.curse}</Text>
              <Text style={styles.pactHintReward}>✓  {PACT_DEFS.find(p => p.id === activePact)?.reward}</Text>
            </View>
          )}

          {/* ── Waypoint / entry floor picker ──────────────────────── */}
          <View style={styles.waypointSection}>
            <Text style={styles.waypointLabel}>ENTRY FLOOR</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.waypointRow}>
              {WAYPOINTS.map(absFloor => {
                const unlocked   = isWaypointUnlocked(absFloor)
                const active     = startFloor === absFloor
                const wpTier     = Math.floor((absFloor - 1) / 10) + 1
                const wpDiffColor = difficultyColor(wpTier)
                return (
                  <TouchableOpacity
                    key={absFloor}
                    style={[
                      styles.waypointChip,
                      active    && styles.waypointChipActive,
                      !active && wpDiffColor != null && unlocked && {
                        borderColor: wpDiffColor + '55',
                        backgroundColor: wpDiffColor + '11',
                      },
                      !unlocked && styles.waypointChipLocked,
                    ]}
                    onPress={() => unlocked && setStartFloor(absFloor)}
                    activeOpacity={unlocked ? 0.7 : 1}
                  >
                    <Text style={[
                      styles.waypointChipText,
                      !active && wpDiffColor != null && unlocked && { color: wpDiffColor },
                      active  && styles.waypointChipTextActive,
                      !unlocked && styles.waypointChipTextLocked,
                    ]}>
                      {waypointLabel(absFloor)}
                    </Text>
                    {!unlocked && <Text style={styles.waypointLock}>🔒</Text>}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
            {startFloor > 1 && (
              <Text style={[
                styles.waypointHint,
                difficultyColor(Math.floor((startFloor - 1) / 10) + 1) != null && {
                  color: difficultyColor(Math.floor((startFloor - 1) / 10) + 1)!,
                  opacity: 0.85,
                },
              ]}>
                Starting at absolute floor {startFloor} · {difficultyLabel(Math.floor((startFloor - 1) / 10) + 1) ?? 'NORMAL'} difficulty
              </Text>
            )}
            {deepestForClass === 0 && (
              <Text style={styles.waypointHint}>
                Clear deeper floors to unlock waypoints for {selected ? selected.charAt(0).toUpperCase() + selected.slice(1) : 'this class'}
              </Text>
            )}
          </View>

          <TouchableOpacity style={styles.descendBtn} onPress={handleDescend}>
            <Text style={styles.descendText}>▼  DESCEND</Text>
            <Text style={styles.descendSub}>
              {startFloor > 1
                ? `from ${waypointLabel(startFloor)} as ${selectedDef.name.toUpperCase()}`
                : `as ${selectedDef.name.toUpperCase()}`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface2,
  },
  backBtn: {
    paddingVertical: 4,
    width: 80,
  },
  backText: {
    color: COLORS.textDim,
    fontSize: 12,
    letterSpacing: 1,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  headerTitle: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 5,
  },
  headerSub: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 2,
  },
  xpStrip: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface,
    alignItems: 'center',
    gap: 4,
  },
  xpTrack: {
    width: '60%',
    height: 2,
    backgroundColor: COLORS.surface,
    borderRadius: 1,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    backgroundColor: COLORS.gold,
    borderRadius: 1,
  },
  xpLabel: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 1,
  },
  scroll: {
    padding: 14,
    gap: 14,
    paddingBottom: 40,
  },
  scrollWithFooter: {
    paddingBottom: 200,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderRadius: 12,
    padding: 18,
    gap: 12,
  },
  cardTop: {
    gap: 6,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clsLvlBadge: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'flex-end',
    gap: 1,
  },
  clsLvlText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  clsXpText: {
    fontSize: 8,
    letterSpacing: 0.5,
  },
  clsNewBadge: {
    borderColor: COLORS.textGhost,
    backgroundColor: 'transparent',
  },
  clsNewText: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  classSymbol: {
    fontSize: 20,
  },
  className: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 4,
    flex: 1,
  },
  recommendedBadge: {
    backgroundColor: COLORS.greenDim,
    borderWidth: 1,
    borderColor: COLORS.green,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  recommendedText: {
    color: COLORS.green,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  selectedBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  classDesc: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 19,
  },
  classFlavor: {
    color: COLORS.textDim,
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  statBlock: {
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  bonusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  skillsBlock: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.surface2,
    paddingTop: 12,
  },
  skillsTitle: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 3,
    fontWeight: '700',
    marginBottom: 2,
  },
  skillRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  skillLvlBadge: {
    width: 26,
    height: 26,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  skillLvlText: {
    fontSize: 9,
    fontWeight: '700',
  },
  skillInfo: {
    flex: 1,
    gap: 2,
  },
  skillName: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  skillDesc: {
    color: COLORS.textDim,
    fontSize: 10,
    lineHeight: 15,
  },
  skillMana: {
    color: COLORS.blue,
    fontSize: 9,
    marginTop: 3,
    letterSpacing: 0.5,
  },
  selectRow: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  selectRowText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  // ── Top utility strip ─────────────────────────────────────────────────────────
  topUtility: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface2,
    backgroundColor: COLORS.card,
  },
  topUtilBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 3,
  },
  topUtilIcon: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  topUtilLabel: {
    color: COLORS.textDim,
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  // ── Sticky footer ─────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 10,
  },
  stakeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stakeLabel: {
    color: COLORS.textDim,
    fontSize: 8,
    letterSpacing: 2,
    fontWeight: '700',
    marginRight: 2,
  },
  stakeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border2,
    borderRadius: 6,
    backgroundColor: COLORS.card,
  },
  stakeChipActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldDim,
  },
  stakeChipIcon: {
    fontSize: 11,
  },
  stakeChipText: {
    color: COLORS.textDim,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
  stakeChipTextActive: {
    color: COLORS.gold,
  },
  stakeHint: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 0.5,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  pactLabel: {
    color: COLORS.red + 'cc',
    fontSize: 8,
    letterSpacing: 2,
    fontWeight: '700',
    marginRight: 2,
  },
  pactChip: {
    borderColor: COLORS.redDim,
    backgroundColor: COLORS.redDim,
  },
  pactChipActive: {
    borderColor: COLORS.red,
    backgroundColor: COLORS.redDim,
  },
  pactChipText: {
    color: COLORS.red + '88',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
  pactChipTextActive: {
    color: COLORS.red,
  },
  pactHintBox: {
    borderWidth: 1,
    borderColor: COLORS.red + '44',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.redDim,
    gap: 3,
  },
  pactHintCurse: {
    color: COLORS.red,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  pactHintReward: {
    color: COLORS.green,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  waypointSection: {
    gap: 6,
  },
  waypointLabel: {
    color: COLORS.textDim,
    fontSize: 8,
    letterSpacing: 2,
    fontWeight: '700',
  },
  waypointRow: {
    gap: 6,
    paddingVertical: 2,
  },
  waypointChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: COLORS.border2,
    borderRadius: 6,
    backgroundColor: COLORS.card,
  },
  waypointChipActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldDim,
  },
  waypointChipLocked: {
    opacity: 0.35,
  },
  waypointChipText: {
    color: COLORS.textDim,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  waypointChipTextActive: {
    color: COLORS.gold,
  },
  waypointChipTextLocked: {
    color: COLORS.textGhost,
  },
  waypointLock: {
    fontSize: 8,
  },
  waypointHint: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 0.3,
    fontStyle: 'italic',
  },
  descendBtn: {
    backgroundColor: COLORS.redDim,
    borderWidth: 1,
    borderColor: COLORS.red,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 2,
  },
  descendText: {
    color: COLORS.red,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 4,
  },
  descendSub: {
    color: COLORS.red + '88',
    fontSize: 9,
    letterSpacing: 3,
  },
})
