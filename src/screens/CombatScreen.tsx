import React, { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Animated, Alert } from 'react-native'
import { useFadeTransition } from '../hooks/useFadeTransition'
import { useCombatStore } from '../store/combatStore'
import { buildPlayerStats } from '../engine/stats'
import { useGameStore } from '../store/gameStore'
import { useInventoryStore } from '../store/inventoryStore'
import { MONSTER_AFFIXES } from '../data/monsters'
import { SKILLS, SKILL_GLYPH, type SkillId, type SkillDef } from '../data/skills'
import { SKILL_DETAIL } from '../data/codex'
import { CLASSES } from '../data/classes'
import { EncounterType } from '../engine/encounter'
import { logEntryColor, getHpColor, getMonsterHpColor, COLORS } from '../theme'
import { useCombatAnimations } from '../hooks/useCombatAnimations'
import { useHaptics } from '../hooks/useHaptics'
import { LevelUpOverlay } from '../components/LevelUpOverlay'
import { MonsterPortrait } from '../components/MonsterPortrait'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSettingsStore } from '../store/settingsStore'

// Opacity for older log entries — index 0 = oldest visible, 4 = most recent older
const LOG_FADE_OPACITIES = [0.10, 0.20, 0.36, 0.55, 0.72]

const ENCOUNTER_NAME_COLOR: Partial<Record<EncounterType, string>> = {
  [EncounterType.Normal]:  COLORS.textSecondary,
  [EncounterType.Elite]:   COLORS.blue,
  [EncounterType.Rare]:    COLORS.gold,
  [EncounterType.Ancient]: COLORS.runewordColor,
  [EncounterType.Boss]:    COLORS.red,
}

// ── Log entry glyph prefixes ──────────────────────────────────────────────────
const LOG_PREFIX: Partial<Record<string, string>> = {
  crit:    '✦ ',
  victory: '✓ ',
  levelUp: '▲ ',
  defeat:  '✕ ',
  heal:    '♥ ',
  enraged: '⚡ ',
  immune:  '◎ ',
  xp:      '+ ',
}

// ── Monster sigil per encounter type ─────────────────────────────────────────
const ENCOUNTER_SIGIL: Partial<Record<EncounterType, string>> = {
  [EncounterType.Normal]:  '◉',
  [EncounterType.Elite]:   '◈',
  [EncounterType.Rare]:    '✦',
  [EncounterType.Ancient]: '◎',
  [EncounterType.Boss]:    '☠',
}

// ── Segmented HP bar ──────────────────────────────────────────────────────────
const SEG_COUNT = 12
function SegBar({ value, max, color }: { value: number; max: number; color: string }) {
  const filled = Math.max(0, Math.round((value / max) * SEG_COUNT))
  return (
    <View style={segStyles.bar}>
      {Array.from({ length: SEG_COUNT }, (_, i) => (
        <View
          key={i}
          style={[segStyles.seg, { backgroundColor: i < filled ? color : COLORS.surface2 }]}
        />
      ))}
    </View>
  )
}
const segStyles = StyleSheet.create({
  bar: { flexDirection: 'row', gap: 2 },
  seg: { flex: 1, height: 12, borderRadius: 1 },
})


function StatusBuff({ label, rounds, color }: { label: string; rounds: number; color: string }) {
  const isExpiring = rounds === 1
  const pulseAnim  = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (!isExpiring) { pulseAnim.setValue(1); return }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 350, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 350, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [isExpiring])

  const chipColor = isExpiring ? COLORS.gold : color
  return (
    <Animated.View style={[
      buffStyles.chip,
      { borderColor: chipColor + '55', backgroundColor: chipColor + '0d' },
      isExpiring && { opacity: pulseAnim },
    ]}>
      <Text style={[buffStyles.label, { color: chipColor }]}>{label}</Text>
      <View style={[buffStyles.roundBadge, { backgroundColor: chipColor + '22' }]}>
        <Text style={[buffStyles.roundText, { color: chipColor }]}>{rounds}</Text>
      </View>
    </Animated.View>
  )
}
const buffStyles = StyleSheet.create({
  chip:       { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 3, paddingLeft: 7, paddingRight: 4, paddingVertical: 3 },
  label:      { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  roundBadge: { borderRadius: 2, paddingHorizontal: 5, paddingVertical: 1 },
  roundText:  { fontSize: 9, fontWeight: '900' },
})

export function CombatScreen() {
  const insets = useSafeAreaInsets()
  const {
    monster, playerHp, playerMaxHp, monsterHp, log,
    outcome, pendingLoot, statusCounters,
    attackAction, skillAction, potionAction, manaPotionAction, staminaPotionAction, fleeAction, clearCombat,
  } = useCombatStore()
  const { battleCryRoundsLeft, ironSkinRoundsLeft, smokeScreenRoundsLeft, manaShieldRoundsLeft, meditateRoundsLeft, ironSkinCooldown, smokeBombCooldown } = statusCounters
  const { floor, level, mana, maxMana, setScreen, classId, ghostCharm } = useGameStore()
  const { equipped, magicFind, bag } = useInventoryStore()
  const { encounterType, roundNumber } = useCombatStore()
  const { hasSeenFirstBoss, markFirstBossSeen } = useSettingsStore()
  const fadeIn  = useFadeTransition(300)
  const haptics = useHaptics()
  const [bossHint, setBossHint] = useState(false)
  const bossHintAnim = useRef(new Animated.Value(0)).current
  const { shakeX, monsterFlashOpacity, levelUpScale, levelUpOpacity,
          triggerShake, triggerMonsterFlash, triggerLevelUp } = useCombatAnimations()
  const prevLevel      = useRef(level)
  const [levelUpSkill,     setLevelUpSkill]     = useState<SkillDef | null>(null)
  const [levelUpNextSkill, setLevelUpNextSkill] = useState<SkillDef | null>(null)
  // ── Floating damage numbers ────────────────────────────────────────────────
  const monsterDmgAnim  = useRef(new Animated.Value(0)).current
  const playerDmgAnim   = useRef(new Animated.Value(0)).current
  const monsterCritAnim = useRef(new Animated.Value(1)).current
  const [monsterLastDmg,   setMonsterLastDmg]   = useState(0)
  const [playerLastDmg,    setPlayerLastDmg]    = useState(0)
  const [monsterLastIsCrit, setMonsterLastIsCrit] = useState(false)

  // Log entry slide-up animation
  const logSlideY   = useRef(new Animated.Value(12)).current
  const logFadeAnim = useRef(new Animated.Value(0)).current

  // Kill-shot flash — brief red wash when monster dies
  const killFlashAnim = useRef(new Animated.Value(0)).current
  // Crit flash — brief gold pop on crit hit
  const critFlashAnim = useRef(new Animated.Value(0)).current
  // Victory/defeat entrance — scale punch + fade
  const outcomeScaleAnim = useRef(new Animated.Value(0.82)).current
  const outcomeFadeAnim  = useRef(new Animated.Value(0)).current

  // Animate log entry on new log line
  useEffect(() => {
    if (log.length === 0) return
    logSlideY.setValue(12)
    logFadeAnim.setValue(0)
    Animated.parallel([
      Animated.timing(logSlideY,   { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(logFadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start()
  }, [log.length])

  // First boss — show a brief codex hint overlay
  useEffect(() => {
    if (encounterType !== EncounterType.Boss || hasSeenFirstBoss) return
    markFirstBossSeen()
    setBossHint(true)
    Animated.sequence([
      Animated.timing(bossHintAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(bossHintAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setBossHint(false))
  }, [encounterType])

  // Boss pulsing glow
  const bossPulse = useRef(new Animated.Value(0.5)).current
  useEffect(() => {
    if (encounterType !== EncounterType.Boss) return
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(bossPulse, { toValue: 1,    duration: 900, useNativeDriver: true }),
        Animated.timing(bossPulse, { toValue: 0.3,  duration: 900, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [encounterType])

  // Detect level-up
  useEffect(() => {
    if (level > prevLevel.current) {
      haptics.notificationSuccess()
      triggerLevelUp()
      // Find skill unlocked at exactly this level for this class
      const unlocked = classId
        ? SKILLS.find(s => s.classId === classId && s.levelRequired === level) ?? null
        : null
      // If nothing unlocked, find the next upcoming skill
      const nextUpcoming = (!unlocked && classId)
        ? SKILLS.filter(s => s.classId === classId && s.levelRequired > level)
            .sort((a, b) => a.levelRequired - b.levelRequired)[0] ?? null
        : null
      setLevelUpSkill(unlocked)
      setLevelUpNextSkill(nextUpcoming)
    }
    prevLevel.current = level
  }, [level])

  // Haptics + kill-shot flash + victory entrance on outcome
  useEffect(() => {
    if (outcome === 'victory') {
      haptics.notificationSuccess()
      // Kill-shot: red wash → fade out, then punch victory card in
      Animated.sequence([
        Animated.timing(killFlashAnim,  { toValue: 0.72, duration: 80,  useNativeDriver: true }),
        Animated.timing(killFlashAnim,  { toValue: 0,    duration: 260, useNativeDriver: true }),
      ]).start()
    }
    if (outcome === 'defeat') haptics.notificationError()
    // Victory/defeat card entrance whenever combat ends
    if (outcome && outcome !== 'ongoing') {
      outcomeScaleAnim.setValue(0.82)
      outcomeFadeAnim.setValue(0)
      Animated.parallel([
        Animated.spring(outcomeScaleAnim, { toValue: 1, tension: 90, friction: 7, useNativeDriver: true }),
        Animated.timing(outcomeFadeAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start()
    }
  }, [outcome])

  // Animate on each combat round + trigger floating damage
  const prevMonsterHp = useRef(monster?.maxHp ?? 0)
  const prevPlayerHp  = useRef(playerMaxHp)
  useEffect(() => {
    const monsterDmg = prevMonsterHp.current - monsterHp
    const playerDmg  = prevPlayerHp.current  - playerHp
    if (monsterDmg > 0) {
      const isCrit = log.length > 0 && log[log.length - 1].type === 'crit'
      triggerMonsterFlash()
      isCrit ? haptics.notificationSuccess() : haptics.impactMedium()
      setMonsterLastDmg(monsterDmg)
      setMonsterLastIsCrit(isCrit)
      monsterDmgAnim.setValue(0)
      monsterCritAnim.setValue(isCrit ? 1.5 : 1)
      Animated.parallel([
        Animated.timing(monsterDmgAnim,  { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.spring(monsterCritAnim, { toValue: 1, tension: 120, friction: 5, useNativeDriver: true }),
      ]).start()
      if (isCrit) {
        critFlashAnim.setValue(0)
        Animated.sequence([
          Animated.timing(critFlashAnim, { toValue: 0.45, duration: 60,  useNativeDriver: true }),
          Animated.timing(critFlashAnim, { toValue: 0,    duration: 180, useNativeDriver: true }),
        ]).start()
      }
    }
    if (playerDmg > 0) {
      triggerShake()
      haptics.impactHeavy()
      setPlayerLastDmg(playerDmg)
      playerDmgAnim.setValue(0)
      Animated.timing(playerDmgAnim, { toValue: 1, duration: 900, useNativeDriver: true }).start()
    }
    prevMonsterHp.current = monsterHp
    prevPlayerHp.current  = playerHp
  }, [roundNumber])

  const hpPotionCount      = Object.values(bag.items).filter(it => it.baseId === 'hp_potion').length
  const manaPotionCount    = Object.values(bag.items).filter(it => it.baseId === 'mana_potion').length
  const staminaPotionCount = Object.values(bag.items).filter(it => it.baseId === 'stamina_potion').length

  if (!monster) return null

  const isBoss    = encounterType === EncounterType.Boss
  const isEnraged = isBoss && roundNumber > 5  && monster.bossMechanics?.includes('enrage')
  const isImmune  = isBoss && roundNumber % 7 === 0 && roundNumber > 0 && monster.bossMechanics?.includes('immune_round')
  const cantFlee  = isBoss && monster.bossMechanics?.includes('no_flee')

  const playerStats    = buildPlayerStats(floor, level, equipped, classId, ghostCharm)
  const hpPct          = Math.max(0, playerHp / playerMaxHp)
  const monsterPct     = Math.max(0, monsterHp / monster.maxHp)
  const hpColor        = getHpColor(hpPct)
  const monsterHpColor = getMonsterHpColor(monsterPct)

  const isOver = outcome !== 'ongoing' && outcome !== null
  const won    = outcome === 'victory'
  const fled   = outcome === 'fled'

  function handleFlee() {
    fleeAction()
    const next = useCombatStore.getState().outcome
    if (next === 'fled') haptics.notificationSuccess()
    else                 haptics.impactHeavy()
  }

  const monsterNameColor = ENCOUNTER_NAME_COLOR[encounterType ?? EncounterType.Normal] ?? COLORS.textSecondary
  const monsterSigil     = ENCOUNTER_SIGIL[encounterType ?? EncounterType.Normal] ?? '◉'

  // All class skills — show locked ones dimmed
  const classDef    = classId ? CLASSES.find(c => c.id === classId) : null
  const classColor  = classDef?.color ?? COLORS.textDim
  const classSkills = SKILLS.filter(s => s.classId === classId)

  // Active buff rounds per skill id
  const activeRounds: Partial<Record<SkillId, number>> = {
    battle_cry:  battleCryRoundsLeft,
    iron_skin:   ironSkinRoundsLeft,
    smoke_bomb:  smokeScreenRoundsLeft,
    mana_shield: manaShieldRoundsLeft,
    meditate:    meditateRoundsLeft,
  }

  // Cooldown rounds per skill id
  const cooldownRounds: Partial<Record<SkillId, number>> = {
    iron_skin:  ironSkinCooldown,
    smoke_bomb: smokeBombCooldown,
  }

  function handleContinue() {
    if (won && pendingLoot.length > 0) {
      setScreen('loot')
    } else {
      const killedByName = outcome === 'defeat' ? monster?.name : undefined
      clearCombat()
      if (outcome === 'defeat') {
        useGameStore.getState().endRun(false, killedByName)
      } else {
        setScreen('grid')
      }
    }
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeIn, paddingTop: insets.top + 10 }]}>
      <LevelUpOverlay levelUpScale={levelUpScale} levelUpOpacity={levelUpOpacity} newLevel={level} newSkill={levelUpSkill} nextSkill={levelUpNextSkill} />

      {/* ── First boss codex hint ────────────────────────────────────────── */}
      {bossHint && (
        <Animated.View style={[styles.bossHintOverlay, { opacity: bossHintAnim }]} pointerEvents="none">
          <Text style={styles.bossHintTitle}>BOSS ENCOUNTER</Text>
          <Text style={styles.bossHintBody}>Bosses drop guaranteed loot and a Town Portal Scroll. Use skills wisely — this fight matters.</Text>
        </Animated.View>
      )}

      {/* ── Monster header — portrait left, name + affixes right ─────────── */}
      <Animated.View style={[styles.monsterHeader, isBoss && { opacity: bossPulse }]}>
        <MonsterPortrait
          monsterId={monster.defId}
          encounterType={encounterType ?? EncounterType.Normal}
          hpPct={monsterPct}
          size={isBoss ? 'md' : 'sm'}
        />
        <View style={styles.monsterInfo}>
          <Text style={[styles.monsterName, { color: monsterNameColor }, isBoss && styles.bossName]}>
            {monster.name.toUpperCase()}
          </Text>
          {isBoss && (
            <View style={styles.affixBadges}>
              {isEnraged && (
                <TouchableOpacity
                  style={[styles.badge, styles.badgeEnraged]}
                  onPress={() => Alert.alert('ENRAGED', 'After round 5 the boss enters a rage — damage dealt to you is doubled. Finish it fast or stock extra potions.')}
                >
                  <Text style={[styles.badgeText, styles.badgeTextEnraged]}>ENRAGED ⓘ</Text>
                </TouchableOpacity>
              )}
              {isImmune && (
                <TouchableOpacity
                  style={[styles.badge, styles.badgeImmune]}
                  onPress={() => Alert.alert('IMMUNE', 'This round the boss is immune — your attack deals no damage. Use a buff skill or potion instead.')}
                >
                  <Text style={[styles.badgeText, styles.badgeTextImmune]}>IMMUNE ⓘ</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {monster.affixes.length > 0 && (
            <View style={styles.affixBadges}>
              {monster.affixes.map(a => (
                <View key={a} style={[styles.badge, { borderColor: monsterNameColor + '55', backgroundColor: monsterNameColor + '0d' }]}>
                  <Text style={[styles.badgeText, { color: monsterNameColor }]}>{MONSTER_AFFIXES[a]?.name ?? a}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </Animated.View>

      {/* ── Active status buffs ───────────────────────────────────────────── */}
      {(battleCryRoundsLeft > 0 || ironSkinRoundsLeft > 0 || smokeScreenRoundsLeft > 0 || manaShieldRoundsLeft > 0 || meditateRoundsLeft > 0) && (
        <View style={styles.statusRow}>
          {battleCryRoundsLeft > 0   && <StatusBuff label="BATTLE CRY"  rounds={battleCryRoundsLeft}   color={COLORS.red}       />}
          {ironSkinRoundsLeft > 0    && <StatusBuff label="IRON SKIN"   rounds={ironSkinRoundsLeft}    color={COLORS.gold}      />}
          {smokeScreenRoundsLeft > 0 && <StatusBuff label="SMOKE"       rounds={smokeScreenRoundsLeft} color={COLORS.green}     />}
          {manaShieldRoundsLeft > 0  && <StatusBuff label="MANA SHIELD" rounds={manaShieldRoundsLeft}  color={COLORS.blue}      />}
          {meditateRoundsLeft > 0    && <StatusBuff label="MEDITATE"    rounds={meditateRoundsLeft}    color={COLORS.purple}    />}
        </View>
      )}

      {/* ── Monster HP bar + floating damage ────────────────────────────── */}
      <Animated.View style={[styles.barSection, { opacity: monsterFlashOpacity }]}>
        <View style={styles.barLabelRow}>
          <Text style={styles.barLabel}>ENEMY</Text>
          <View style={styles.barLabelRight}>
            {monsterLastDmg > 0 && (
              <Animated.Text style={[
                styles.floatDmg,
                monsterLastIsCrit && styles.floatDmgCrit,
                {
                  color: monsterLastIsCrit ? COLORS.gold : COLORS.red,
                  opacity: monsterDmgAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.7, 0] }),
                  transform: [
                    { translateY: monsterDmgAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -22] }) },
                    { scale: monsterCritAnim },
                  ],
                },
              ]}>
                {monsterLastIsCrit ? '✦ ' : ''}{monsterLastDmg}
              </Animated.Text>
            )}
            <Text style={styles.barValue}>{monsterHp} / {monster.maxHp}</Text>
          </View>
        </View>
        <SegBar value={monsterHp} max={monster.maxHp} color={monsterHpColor} />
      </Animated.View>

      {/* ── Player HP bar + floating damage ─────────────────────────────── */}
      <Animated.View style={[styles.barSection, { transform: [{ translateX: shakeX }] }]}>
        <View style={styles.barLabelRow}>
          <Text style={styles.barLabel}>YOU</Text>
          <View style={styles.barLabelRight}>
            {playerLastDmg > 0 && (
              <Animated.Text style={[styles.floatDmg, {
                color: COLORS.gold,
                opacity: playerDmgAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.7, 0] }),
                transform: [{ translateY: playerDmgAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) }],
              }]}>
                -{playerLastDmg}
              </Animated.Text>
            )}
            <Text style={styles.barValue}>{playerHp} / {playerMaxHp}</Text>
          </View>
        </View>
        <SegBar value={playerHp} max={playerMaxHp} color={hpColor} />
      </Animated.View>

      {/* ── Mana bar ─────────────────────────────────────────────────────── */}
      {maxMana > 0 && (
        <View style={styles.barSection}>
          <View style={styles.barLabelRow}>
            <Text style={styles.barLabel}>MANA</Text>
            <Text style={styles.barValue}>{mana} / {maxMana}</Text>
          </View>
          <SegBar value={mana} max={maxMana} color={COLORS.manaBar} />
        </View>
      )}

      {/* ── Player stat line ─────────────────────────────────────────────── */}
      <View style={styles.statLine}>
        <Text style={styles.statLinePiece}>
          <Text style={styles.statLineLabel}>DMG </Text>
          <Text style={styles.statLineVal}>{playerStats.damage[0]}–{playerStats.damage[1]}</Text>
        </Text>
        <Text style={styles.statLineDot}>·</Text>
        <Text style={styles.statLinePiece}>
          <Text style={styles.statLineLabel}>CRIT </Text>
          <Text style={styles.statLineVal}>{playerStats.critChance}%</Text>
        </Text>
        <Text style={styles.statLineDot}>·</Text>
        <Text style={styles.statLinePiece}>
          <Text style={styles.statLineLabel}>DEF </Text>
          <Text style={styles.statLineVal}>{playerStats.defense}</Text>
        </Text>
        {(playerStats.blockChance ?? 0) > 0 && (
          <>
            <Text style={styles.statLineDot}>·</Text>
            <Text style={styles.statLinePiece}>
              <Text style={styles.statLineLabel}>BLK </Text>
              <Text style={styles.statLineVal}>{playerStats.blockChance}%</Text>
            </Text>
          </>
        )}
        {monster.blockChance > 0 && (
          <>
            <Text style={styles.statLineDot}>·</Text>
            <Text style={styles.statLinePiece}>
              <Text style={[styles.statLineLabel, { color: COLORS.textDim }]}>EBLK </Text>
              <Text style={[styles.statLineVal, { color: COLORS.textDim }]}>{monster.blockChance}%</Text>
            </Text>
          </>
        )}
      </View>

      {/* ── Combat log — D1 style: newest prominent, older fading out ───── */}
      <View style={styles.logSection}>
        {/* Latest entry — animated slide-in */}
        {log.length > 0 && (() => {
          const last        = log[log.length - 1]
          const lastColor   = logEntryColor(last.type)
          const isHighImpact = last.type === 'crit' || last.type === 'levelUp' || last.type === 'victory'
          const isNegative   = last.type === 'defeat' || last.type === 'enraged'
          return (
            <Animated.View style={[
              styles.lastLogLine,
              isHighImpact && { borderColor: lastColor + '99', backgroundColor: lastColor + '12' },
              isNegative   && { borderColor: COLORS.red + '88' },
              { opacity: logFadeAnim, transform: [{ translateY: logSlideY }] },
            ]}>
              <Text style={[styles.lastLogText, { color: lastColor }, isHighImpact && styles.lastLogTextBig]}>
                {LOG_PREFIX[last.type]}{last.text}
              </Text>
            </Animated.View>
          )
        })()}
        {/* Older entries — last 5, graduated opacity oldest→dimmest */}
        {log.length > 1 && (
          <View style={styles.log}>
            {log.slice(0, -1).slice(-5).map((entry, i, arr) => {
              const opacity  = LOG_FADE_OPACITIES[i + (5 - arr.length)] ?? 0.10
              const isBig    = entry.type === 'crit' || entry.type === 'victory' || entry.type === 'levelUp'
              return (
                <Text key={i} style={[
                  styles.logLine,
                  isBig && styles.logLineBold,
                  { color: logEntryColor(entry.type), opacity },
                ]}>
                  {LOG_PREFIX[entry.type]}{entry.text}
                </Text>
              )
            })}
          </View>
        )}
      </View>

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      {!isOver ? (
        <View style={styles.actions}>
          {/* Skills grid — fixed 2×2 (warrior/rogue) or 2×3 (sorcerer) with locked placeholders */}
          {classSkills.length > 0 && (() => {
            const cols = 2
            const rows = Math.ceil(classSkills.length / cols)
            // Build a fixed grid: pad with nulls to fill rows × cols
            const slots: (typeof classSkills[0] | null)[] = [...classSkills]
            while (slots.length < rows * cols) slots.push(null)
            const grid: (typeof classSkills[0] | null)[][] = []
            for (let r = 0; r < rows; r++) grid.push(slots.slice(r * cols, r * cols + cols))

            return (
              <View style={styles.skillGrid}>
                {grid.map((row, ri) => (
                  <View key={ri} style={styles.skillRow}>
                    {row.map((skill, ci) => {
                      if (!skill) {
                        return <View key={`empty-${ri}-${ci}`} style={[styles.skillBtn, styles.skillBtnEmpty]} />
                      }
                      const isLocked     = level < skill.levelRequired
                      const hasNoMana    = skill.manaCost > 0 && mana < skill.manaCost
                      const roundsActive = activeRounds[skill.id] ?? 0
                      const isActive     = roundsActive > 0
                      const cdLeft       = cooldownRounds[skill.id] ?? 0
                      const isOnCooldown = cdLeft > 0
                      const isDisabled   = isLocked || hasNoMana || isActive || isOnCooldown
                      const glyph        = SKILL_GLYPH[skill.id] ?? '·'
                      const detail       = SKILL_DETAIL[skill.id]

                      return (
                        <TouchableOpacity
                          key={skill.id}
                          style={[
                            styles.skillBtn,
                            { borderColor: classColor + (isLocked ? '22' : isActive ? 'cc' : '55') },
                            isActive && { backgroundColor: classColor + '18' },
                            isLocked && styles.skillBtnLocked,
                          ]}
                          onPress={() => !isDisabled && skillAction(skill.id, playerStats, floor, magicFind)}
                          onLongPress={() => detail && Alert.alert(skill.name, `${detail.effect}\n\n${detail.tip}`)}
                          disabled={isDisabled}
                        >
                          <Text style={[styles.skillGlyph, { color: isLocked ? COLORS.textGhost : classColor }]}>
                            {glyph}
                          </Text>
                          <Text style={[styles.skillName, { color: isLocked ? COLORS.textGhost : isActive ? classColor : COLORS.textSecondary }]}>
                            {skill.name}
                          </Text>
                          {isActive ? (
                            <Text style={[styles.skillMeta, { color: classColor }]}>×{roundsActive}</Text>
                          ) : isOnCooldown ? (
                            <Text style={[styles.skillMeta, { color: COLORS.textDim }]}>CD:{cdLeft}</Text>
                          ) : isLocked ? (
                            <Text style={[styles.skillMeta, { color: COLORS.textDim }]}>L{skill.levelRequired}</Text>
                          ) : skill.manaCost > 0 ? (
                            <Text style={[styles.skillMeta, { color: hasNoMana ? COLORS.textDim : COLORS.manaBar }]}>{skill.manaCost}MP</Text>
                          ) : (
                            <Text style={[styles.skillMeta, { color: COLORS.textDim }]}>free</Text>
                          )}
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                ))}
              </View>
            )
          })()}

          {/* Attack */}
          <TouchableOpacity
            style={styles.attackBtn}
            onPress={() => { haptics.impactLight(); attackAction(playerStats, floor, magicFind) }}
          >
            <Text style={styles.attackText}>⚔  STRIKE</Text>
          </TouchableOpacity>

          {/* Secondary actions */}
          <View style={styles.secondaryActions}>
            <TouchableOpacity
              style={[styles.secondaryBtn, hpPotionCount === 0 && styles.disabledBtn]}
              onPress={() => potionAction(playerStats, floor, magicFind)}
              disabled={hpPotionCount === 0}
            >
              <Text style={styles.secondaryText}>◆ HP  <Text style={styles.secondaryCount}>({hpPotionCount})</Text></Text>
              {hpPotionCount === 0 && <Text style={styles.potionEmptyNote}>none</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.manaPotBtn, manaPotionCount === 0 && styles.disabledBtn]}
              onPress={() => manaPotionAction(playerStats, floor, magicFind)}
              disabled={manaPotionCount === 0}
            >
              <Text style={[styles.secondaryText, styles.manaPotText]}>◈ MP  <Text style={styles.secondaryCount}>({manaPotionCount})</Text></Text>
              {manaPotionCount === 0 && <Text style={styles.potionEmptyNote}>none</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.staminaPotBtn, staminaPotionCount === 0 && styles.disabledBtn]}
              onPress={staminaPotionAction}
              disabled={staminaPotionCount === 0}
            >
              <Text style={[styles.secondaryText, styles.staminaPotText]}>⚡ ST  <Text style={styles.secondaryCount}>({staminaPotionCount})</Text></Text>
              {staminaPotionCount === 0 && <Text style={styles.potionEmptyNote}>none</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.fleeBtn, cantFlee && styles.disabledBtn]}
              onPress={handleFlee}
              disabled={cantFlee}
            >
              <Text style={styles.secondaryText}>↩ FLEE</Text>
              {cantFlee ? <Text style={styles.fleeNote}>blocked</Text> : <Text style={styles.fleeNote}>stays</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Animated.View style={[styles.outcomeSection, {
          opacity: outcomeFadeAnim,
          transform: [{ scale: outcomeScaleAnim }],
        }]}>
          <Text style={[styles.outcomeText, won && styles.victoryText, !won && !fled && styles.defeatText]}>
            {won ? '⚔  VICTORY' : fled ? '↩  FLED' : '☠  DEFEATED'}
          </Text>
          <TouchableOpacity style={[styles.continueBtn, won && styles.continueBtnVictory]} onPress={handleContinue}>
            <Text style={[styles.continueBtnText, won && styles.continueBtnTextVictory]}>
              {won && pendingLoot.length > 0 ? `COLLECT LOOT  (${pendingLoot.length})` : 'CONTINUE'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Kill-shot flash — red wash on monster death ─────────────────── */}
      <Animated.View
        style={[styles.fullscreenFlash, { backgroundColor: COLORS.red, opacity: killFlashAnim }]}
        pointerEvents="none"
      />
      {/* ── Crit flash — gold pop on crit hit ───────────────────────────── */}
      <Animated.View
        style={[styles.fullscreenFlash, { backgroundColor: COLORS.gold, opacity: critFlashAnim }]}
        pointerEvents="none"
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    padding: 20,
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  // ── First boss hint overlay ────────────────────────────────────────────────
  bossHintOverlay: {
    position: 'absolute',
    top: '20%',
    left: 24,
    right: 24,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.red,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    zIndex: 50,
  },
  bossHintTitle: {
    color: COLORS.red,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 3,
  },
  bossHintBody: {
    color: COLORS.textSecondary,
    fontSize: 11,
    letterSpacing: 0.5,
    textAlign: 'center',
    lineHeight: 17,
  },
  // ── Monster header — portrait left, info right ────────────────────────────
  monsterHeader: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           12,
  },
  monsterInfo: {
    flex: 1,
    gap:  6,
    justifyContent: 'center',
  },
  monsterName: {
    fontSize:     20,
    fontWeight:   '800',
    letterSpacing: 2.5,
  },
  bossName: {
    color:           COLORS.red,
    fontSize:        22,
    textShadowColor: COLORS.glow.boss,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  affixBadges: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           5,
  },
  badge: {
    borderWidth:      1,
    paddingHorizontal: 7,
    paddingVertical:   2,
  },
  badgeEnraged: {
    backgroundColor: COLORS.redDim,
    borderColor:     COLORS.red,
  },
  badgeTextEnraged: {
    color: COLORS.red,
  },
  badgeImmune: {
    backgroundColor: COLORS.blueDim,
    borderColor:     COLORS.textDim,
  },
  badgeTextImmune: {
    color: COLORS.textSecondary,
  },
  badgeText: {
    fontSize:     10,
    letterSpacing: 1,
    fontWeight:   '700',
  },
  // ── HP/MP bars ─────────────────────────────────────────────────────────────
  barSection: {
    gap: 4,
  },
  barLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barLabelRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  barLabel: {
    color: COLORS.textDim,
    fontSize: 10,
    letterSpacing: 2.5,
    fontWeight: '800',
  },
  barValue: {
    color: COLORS.textDim,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  floatDmg: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  floatDmgCrit: {
    fontSize: 22,
    letterSpacing: 1,
    textShadowColor: COLORS.gold,
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
  // ── Log ───────────────────────────────────────────────────────────────────
  logSection: {
    flex: 1,
    gap: 6,
  },
  lastLogLine: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border2,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lastLogText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    fontFamily: 'monospace',
  },
  lastLogTextBig: {
    fontSize: 15,
    letterSpacing: 0.5,
  },
  log: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  logLine: {
    fontSize: 10,
    fontFamily: 'monospace',
  },
  logLineBold: {
    fontSize: 11,
    fontWeight: '700',
  },
  // ── Player stat line ──────────────────────────────────────────────────────
  statLine: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'nowrap',
  },
  statLinePiece: {
    fontSize: 10,
  },
  statLineLabel: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  statLineVal: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  statLineDot: {
    color: COLORS.textGhost,
    fontSize: 10,
  },
  // ── Actions ───────────────────────────────────────────────────────────────
  actions: {
    gap: 7,
  },
  attackBtn: {
    backgroundColor: COLORS.redDim,
    borderColor: COLORS.red,
    borderWidth: 1,
    paddingVertical: 18,
    borderRadius: 4,
    alignItems: 'center',
  },
  attackText: {
    color: COLORS.red,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 3,
  },
  // ── Skills grid ───────────────────────────────────────────────────────────
  skillGrid: {
    gap: 5,
  },
  skillRow: {
    flexDirection: 'row',
    gap: 5,
  },
  skillBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 4,
    alignItems: 'center',
    gap: 3,
  },
  skillBtnLocked: {
    backgroundColor: COLORS.card,
  },
  skillBtnEmpty: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  skillGlyph: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
  },
  skillName: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  skillMeta: {
    fontSize: 8,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  // ── Secondary actions ─────────────────────────────────────────────────────
  secondaryActions: {
    flexDirection: 'row',
    gap: 7,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border2,
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 4,
    alignItems: 'center',
    gap: 1,
  },
  fleeBtn: {
    borderColor: COLORS.border,
  },
  fleeNote: {
    color: COLORS.textDim,
    fontSize: 8,
    letterSpacing: 0.3,
  },
  manaPotBtn: {
    borderColor: COLORS.blueDim,
    backgroundColor: COLORS.blueDim,
  },
  manaPotText: {
    color: COLORS.blue,
  },
  staminaPotBtn: {
    borderColor: COLORS.greenDim,
    backgroundColor: COLORS.greenDim,
  },
  staminaPotText: {
    color: COLORS.green,
  },
  secondaryText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  secondaryCount: {
    color: COLORS.textDim,
    fontSize: 10,
    fontWeight: '400',
  },
  disabledBtn: {
    opacity: 0.35,
  },
  potionEmptyNote: {
    color: COLORS.textGhost,
    fontSize: 8,
    letterSpacing: 0.5,
  },
  // ── Full-screen flash overlay (kill-shot / crit) ─────────────────────────
  fullscreenFlash: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99,
  },
  // ── Outcome ───────────────────────────────────────────────────────────────
  outcomeSection: {
    alignItems: 'center',
    gap: 16,
  },
  outcomeText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 4,
    color: COLORS.textSecondary,
  },
  victoryText: { color: COLORS.green },
  defeatText:  { color: COLORS.red   },
  continueBtn: {
    backgroundColor: COLORS.surface2,
    borderColor: COLORS.border2,
    borderWidth: 1,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 4,
  },
  continueBtnVictory: {
    backgroundColor: COLORS.greenDim,
    borderColor: COLORS.green,
  },
  continueBtnText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    letterSpacing: 2.5,
    fontWeight: '700',
  },
  continueBtnTextVictory: {
    color: COLORS.green,
  },
})
