import React, { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Dimensions, Animated, Alert, AppState } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Disable system font scaling globally — fixed game layouts require stable text sizes
;(Text as { defaultProps?: Record<string, unknown> }).defaultProps = {
  ...((Text as { defaultProps?: Record<string, unknown> }).defaultProps ?? {}),
  allowFontScaling: false,
}
import { useGameStore } from './src/store/gameStore'
import { useGridStore } from './src/store/gridStore'
import { useInventoryStore } from './src/store/inventoryStore'
import { useSettingsStore } from './src/store/settingsStore'
import { GridScreen } from './src/screens/GridScreen'
import { CombatScreen } from './src/screens/CombatScreen'
import { LootScreen } from './src/screens/LootScreen'
import { InventoryScreen } from './src/screens/InventoryScreen'
import { CodexScreen } from './src/screens/CodexScreen'
import { GraveyardScreen } from './src/screens/GraveyardScreen'
import { ClassSelectScreen } from './src/screens/ClassSelectScreen'
import { StashScreen } from './src/screens/StashScreen'
import { TownScreen } from './src/screens/TownScreen'
import { SettingsScreen } from './src/screens/SettingsScreen'
import { CLASSES } from './src/data/classes'
import { useCombatStore } from './src/store/combatStore'
import { loadGame, clearSave, loadMidRun, saveMidRun, type LoadResult } from './src/services/persistence'
import { GRID_W, GRID_H } from './src/engine/grid'
import { XpBar } from './src/components/XpBar'
import { LoadingScreen } from './src/components/LoadingScreen'
import { FirstRunOverlay } from './src/components/FirstRunOverlay'
import { COLORS } from './src/theme'

const { width: SW } = Dimensions.get('window')

// ── Screen fade-in wrapper — triggers fresh on every mount ────────────────────
function ScreenFade({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start()
  }, [])
  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>
}

// ── Main Menu ─────────────────────────────────────────────────────────────────
function MainMenu() {
  const { setScreen, graveyard, tier, level, classId, sharedStash, xp, careerStats, classesPlayed } = useGameStore()
  const classDef   = classId ? CLASSES.find(c => c.id === classId) : null
  const ascensions = careerStats.ascensions ?? 0

  const isReturning = level > 0 || tier > 1

  // Breathing glow on title
  const glowOpacity = useRef(new Animated.Value(0.6)).current
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 1,   duration: 1800, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.6, duration: 1800, useNativeDriver: true }),
      ])
    )
    pulse.start()
    return () => pulse.stop()
  }, [])

  // Fade in the whole menu on mount
  const fadeIn = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 400, useNativeDriver: true }).start()
  }, [])

  return (
    <Animated.View style={[menuStyles.root, { opacity: fadeIn }]}>
      {/* ── Title block ─────────────────────────────────────────────────── */}
      <View style={menuStyles.titleBlock}>
        <Animated.Text style={[menuStyles.title, { opacity: glowOpacity }]}>DUNGEON DEPTHS</Animated.Text>
        <Text style={menuStyles.subtitle}>GRID · LOOT · SURVIVE</Text>
      </View>

      {/* ── Returning player card ────────────────────────────────────────── */}
      {isReturning && classDef ? (
        <View style={[menuStyles.charCard, { borderColor: classDef.color + '44' }]}>
          <View style={menuStyles.charCardTop}>
            <View style={[menuStyles.classDot, { backgroundColor: classDef.color }]} />
            <Text style={[menuStyles.charClass, { color: classDef.color }]}>{classDef.name.toUpperCase()}</Text>
            <View style={menuStyles.charBadges}>
              <View style={menuStyles.tierBadge}>
                <Text style={menuStyles.tierBadgeText}>T{tier}</Text>
              </View>
              {ascensions > 0 && (
                <View style={menuStyles.ascensionBadge}>
                  <Text style={menuStyles.ascensionBadgeText}>✦×{ascensions}</Text>
                </View>
              )}
            </View>
          </View>
          <XpBar xp={xp} color={classDef.color} />
        </View>
      ) : isReturning ? (
        <View style={menuStyles.charCard}>
          <Text style={menuStyles.persistText}>TIER {tier}  ·  LVL {level}</Text>
        </View>
      ) : null}

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <View style={menuStyles.actions}>
        <TouchableOpacity style={menuStyles.primaryBtn} onPress={() => setScreen('classSelect')}>
          <Text style={menuStyles.primaryBtnText}>NEW RUN</Text>
          {classDef && <Text style={menuStyles.primaryBtnSub}>pick a class to begin</Text>}
        </TouchableOpacity>

        <View style={menuStyles.secondaryRow}>
          <TouchableOpacity
            style={[menuStyles.secondaryBtn, menuStyles.stashBtn]}
            onPress={() => setScreen('town')}
          >
            <Text style={menuStyles.stashIcon}>⬚</Text>
            <Text style={menuStyles.secondaryBtnText}>TOWN</Text>
            {sharedStash.length > 0 && (
              <View style={menuStyles.badge}>
                <Text style={menuStyles.badgeText}>{sharedStash.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          {graveyard.length > 0 && (
            <TouchableOpacity
              style={[menuStyles.secondaryBtn, menuStyles.graveyardBtn]}
              onPress={() => setScreen('graveyard')}
            >
              <Text style={menuStyles.graveyardIcon}>⚰</Text>
              <Text style={menuStyles.secondaryBtnText}>GRAVEYARD</Text>
              <View style={[menuStyles.badge, menuStyles.graveBadge]}>
                <Text style={menuStyles.badgeText}>{graveyard.length}</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {careerStats.totalRuns > 0 && (
        <View style={menuStyles.careerRow}>
          <Text style={menuStyles.careerStat}>{careerStats.totalRuns} run{careerStats.totalRuns !== 1 ? 's' : ''}</Text>
          <Text style={menuStyles.careerDot}>·</Text>
          <Text style={menuStyles.careerStat}>T{careerStats.deepestTier} deepest</Text>
          <Text style={menuStyles.careerDot}>·</Text>
          <Text style={menuStyles.careerStat}>{careerStats.totalKills} kills</Text>
          {careerStats.bestQuality && (
            <>
              <Text style={menuStyles.careerDot}>·</Text>
              <Text style={menuStyles.careerStat}>{careerStats.bestQuality} best</Text>
            </>
          )}
          {(careerStats.dailyStreak ?? 0) >= 2 && (
            <>
              <Text style={menuStyles.careerDot}>·</Text>
              <Text style={[menuStyles.careerStat, { color: COLORS.gold }]}>🔥 {careerStats.dailyStreak}d streak</Text>
            </>
          )}
        </View>
      )}

      <Text style={menuStyles.hint}>
        {isReturning
          ? 'XP · level · tier carry over between runs'
          : 'D-pad or swipe · tap encounters · collect loot'}
      </Text>

    </Animated.View>
  )
}

// ── Epitaph generator ─────────────────────────────────────────────────────────
function generateEpitaph(
  className: string,
  absFloor: number,
  killedBy: string | undefined,
  runKills: number,
  runItemsFound: number,
  item: { quality: string; slot: string; sockets: number; insertedRunes: string[] } | null,
): [string, string] {
  const line1 = killedBy
    ? `Here lies your ${className} — claimed by ${killedBy} on floor ${absFloor}.`
    : `Here lies your ${className}, fallen on floor ${absFloor}.`

  let line2: string
  if (item && (item.quality === 'unique' || item.quality === 'rare')) {
    line2 = `Her ${item.quality} ${item.slot} rests in the graveyard. Invoke its echo.`
  } else if (item && item.sockets > 0 && item.insertedRunes.length === 0) {
    line2 = `She left ${item.sockets} empty socket${item.sockets > 1 ? 's' : ''}. Find the runes.`
  } else if (runKills === 0) {
    line2 = `She drew no blood before the end.`
  } else if (runKills < 5) {
    line2 = `Only ${runKills} kill${runKills > 1 ? 's' : ''} before the darkness took her.`
  } else if (runKills >= 25) {
    line2 = `${runKills} monsters fell before her. A worthy echo awaits.`
  } else if (runItemsFound === 0) {
    line2 = `${runKills} slain, nothing carried. Greed will serve her better.`
  } else {
    line2 = `${runKills} slain · ${runItemsFound} item${runItemsFound !== 1 ? 's' : ''} found · the graveyard grows.`
  }

  return [line1, line2]
}

// ── Game Over / Victory ───────────────────────────────────────────────────────
function EndScreen({ won }: { won: boolean }) {
  const { setScreen, lastSacrifice, tier, level, floor, classId, xp, sharedStash, graveyard, classesPlayed, ascendRun, careerStats, runKills, runItemsFound, invokeGhostEcho, ghostCharm } = useGameStore()
  const absFloor = (tier - 1) * 10 + floor
  const [epitaphLine1, epitaphLine2] = !won && lastSacrifice
    ? generateEpitaph(
        CLASSES.find(c => c.id === classId)?.name ?? 'Adventurer',
        absFloor,
        lastSacrifice.killedBy,
        runKills,
        runItemsFound,
        lastSacrifice.item,
      )
    : ['', '']
  const classDef    = classId ? CLASSES.find(c => c.id === classId) : null
  const accentColor = won ? COLORS.green : COLORS.red

  // Class completion — which of the 3 classes have been played
  const allClassIds = CLASSES.map(c => c.id)
  const nextUnplayed = allClassIds.find(id => id !== classId && !classesPlayed.includes(id))
  const nextClassDef = nextUnplayed ? CLASSES.find(c => c.id === nextUnplayed) : null

  const fadeIn = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 400, useNativeDriver: true }).start()
  }, [])

  return (
    <Animated.View style={[endStyles.root, { opacity: fadeIn }]}>
      <View style={endStyles.topBlock}>
        <Text style={[endStyles.headline, { color: accentColor }]}>
          {won ? 'VICTORY' : 'DEFEATED'}
        </Text>
        <Text style={endStyles.sub}>
          {won ? 'The dungeon is yours.' : 'The darkness claimed you.'}
        </Text>
      </View>

      {/* Epitaph */}
      {!won && epitaphLine1 !== '' && (
        <View style={endStyles.epitaphBlock}>
          <Text style={endStyles.epitaphLine1}>{epitaphLine1}</Text>
          <Text style={endStyles.epitaphLine2}>{epitaphLine2}</Text>
        </View>
      )}

      {/* Run summary */}
      {(runKills > 0 || runItemsFound > 0) && (
        <View style={endStyles.runSummaryCard}>
          <Text style={endStyles.runSummaryEyebrow}>THIS RUN</Text>
          <View style={endStyles.runSummaryRow}>
            {runKills > 0 && (
              <Text style={endStyles.runSummaryStat}>{runKills} kill{runKills !== 1 ? 's' : ''}</Text>
            )}
            {runKills > 0 && runItemsFound > 0 && <Text style={endStyles.runSummaryDot}>·</Text>}
            {runItemsFound > 0 && (
              <Text style={endStyles.runSummaryStat}>{runItemsFound} item{runItemsFound !== 1 ? 's' : ''}</Text>
            )}
          </View>
        </View>
      )}

      {/* Sacrifice card — full stats */}
      {!won && lastSacrifice && (() => {
        const { item } = lastSacrifice
        const statsEntries = Object.entries(item.effectiveStats)
        return (
          <View style={endStyles.sacrificeCard}>
            <Text style={endStyles.sacrificeEyebrow}>LOST TO THE GRAVEYARD</Text>
            {lastSacrifice.killedBy && (
              <Text style={endStyles.sacrificeKilledBy}>claimed by {lastSacrifice.killedBy}</Text>
            )}
            <Text style={endStyles.sacrificeName}>{item.displayName}</Text>
            <Text style={endStyles.sacrificeMeta}>
              {item.quality.toUpperCase()}  ·  {item.slot.toUpperCase()}  ·  T{lastSacrifice.tier}·F{lastSacrifice.floor}
            </Text>
            {statsEntries.length > 0 && (
              <View style={endStyles.sacrificeStats}>
                {statsEntries.slice(0, 6).map(([k, v]) => (
                  <Text key={k} style={endStyles.sacrificeStat}>
                    {(v as number) > 0 ? '+' : ''}{v as number} {k}
                  </Text>
                ))}
                {statsEntries.length > 6 && (
                  <Text style={endStyles.sacrificeStat}>+{statsEntries.length - 6} more</Text>
                )}
              </View>
            )}

            {/* Ghost Echo gift */}
            {ghostCharm?.uid === item.uid ? (
              <View style={endStyles.echoConfirmed}>
                <Text style={endStyles.echoConfirmedText}>◈ ECHO INVOKED — carries into your next run</Text>
              </View>
            ) : !ghostCharm ? (
              <TouchableOpacity style={endStyles.echoGiftBtn} onPress={() => invokeGhostEcho(0)}>
                <Text style={endStyles.echoGiftBtnText}>◈  CARRY HER ECHO</Text>
                <Text style={endStyles.echoGiftBtnSub}>25% of her stats · active for floor 1</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )
      })()}

      {/* Progress kept */}
      <View style={endStyles.progressCard}>
        <Text style={endStyles.progressEyebrow}>PROGRESS KEPT</Text>
        {classDef && (
          <View style={endStyles.progressRow}>
            <View style={[endStyles.classDot, { backgroundColor: classDef.color }]} />
            <Text style={[endStyles.progressClass, { color: classDef.color }]}>{classDef.name}</Text>
          </View>
        )}
        <Text style={endStyles.progressStats}>Tier {tier}  ·  Level {level}</Text>
        {careerStats.totalRuns > 1 && (
          <View style={endStyles.floorCompareRow}>
            <Text style={endStyles.floorCompareLabel}>FLOOR {absFloor}</Text>
            {absFloor >= careerStats.deepestFloor ? (
              <Text style={endStyles.floorNewBest}>★ NEW BEST</Text>
            ) : (
              <Text style={endStyles.floorBest}>· BEST {careerStats.deepestFloor}</Text>
            )}
          </View>
        )}
        {classDef && <XpBar xp={xp} color={classDef.color} />}

        {/* Class completion hint */}
        {nextClassDef && (
          <View style={endStyles.classHintRow}>
            <Text style={endStyles.classHintText}>
              {classesPlayed.length} / {allClassIds.length} classes explored  ·  try{' '}
              <Text style={[endStyles.classHintName, { color: nextClassDef.color }]}>
                {nextClassDef.name}
              </Text>?
            </Text>
          </View>
        )}
        {classesPlayed.length >= allClassIds.length && (
          <Text style={endStyles.classHintText}>All 3 classes explored ✦</Text>
        )}
      </View>

      <View style={endStyles.actions}>
        {won && graveyard.length > 0 && (
          <TouchableOpacity
            style={endStyles.ascendBtn}
            onPress={() => { ascendRun(); setScreen('classSelect') }}
          >
            <Text style={endStyles.ascendBtnText}>✦  ASCEND</Text>
            <Text style={endStyles.ascendBtnSub}>Start fresh · Ghost Echo pre-loaded · ascension ×{(careerStats.ascensions ?? 0) + 1}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[endStyles.primaryBtn, { borderColor: accentColor }]}
          onPress={() => setScreen('classSelect')}
        >
          <Text style={[endStyles.primaryBtnText, { color: accentColor }]}>
            {won ? `CONTINUE  T${tier}` : 'TRY AGAIN'}
          </Text>
        </TouchableOpacity>

        <View style={endStyles.secondaryRow}>
          <TouchableOpacity style={endStyles.secondaryBtn} onPress={() => setScreen('town')}>
            <Text style={endStyles.secondaryText}>⬚  TOWN{sharedStash.length > 0 ? ` (${sharedStash.length})` : ''}</Text>
          </TouchableOpacity>
          {graveyard.length > 0 && (
            <TouchableOpacity style={endStyles.secondaryBtn} onPress={() => setScreen('graveyard')}>
              <Text style={endStyles.secondaryText}>⚰  GRAVEYARD</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  )
}

// ── Root router ───────────────────────────────────────────────────────────────
export default function App() {
  const insets = useSafeAreaInsets()
  const { screen, runStarted, hydrate, setScreen } = useGameStore()
  const hydrateEquipped  = useInventoryStore(s => s.hydrateEquipped)
  const loadSettings     = useSettingsStore(s => s.loadFromDisk)
  const onboardingDone   = useSettingsStore(s => s.onboardingDone)
  const setOnboardingDone = useSettingsStore(s => s.setOnboardingDone)
  const [loading, setLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    async function bootstrap() {
      await loadSettings()
      const result: LoadResult = await loadGame()

      if (result.corrupted) {
        await clearSave()
        setLoading(false)
        setTimeout(() => {
          Alert.alert(
            'Save Corrupted',
            'Your save data could not be loaded and has been cleared. Starting fresh.',
            [{ text: 'OK' }],
          )
        }, 150)
        return
      }

      if (result.save) {
        const save = result.save
        hydrate(save)
        useGridStore.setState({ bossDefeated: save.bossDefeated ?? false })
        if (save.equipped) hydrateEquipped(save.equipped)
        // Restore town portal scrolls as actual bag items
        const gainScroll = useCombatStore.getState().gainScroll
        for (let i = 0; i < (save.townPortalScrolls ?? 0); i++) {
          gainScroll()
        }
      }

      // Populate in-memory mid-run cache (used by ClassSelectScreen for sync reads)
      await loadMidRun()

      setLoading(false)
    }
    bootstrap()
  }, [])

  // Auto-save mid-run state whenever the app backgrounds
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'background') return
      const gs   = useGameStore.getState()
      const grid = useGridStore.getState()
      if (!gs.runStarted || !gs.classId) return
      const fogFlat: number[]  = []
      const encFlat: boolean[] = []
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          const tile = grid.grid[y]?.[x]
          fogFlat.push(tile ? tile.fog : 0)
          encFlat.push(tile ? tile.encountered : false)
        }
      }
      const inv = useInventoryStore.getState()
      const bagItems = Object.values(inv.bag.items) as { baseId: string }[]
      saveMidRun({
        absFloor:    gs.floor,
        localFloor:  grid.floor,
        seed:        grid.seed,
        tier:        gs.tier,
        classId:     gs.classId,
        playerPos:   grid.playerPos,
        fog:         fogFlat,
        encountered: encFlat,
        stamina:     grid.stamina,
        hpPotions:   bagItems.filter(i => i.baseId === 'hp_potion').length,
        manaPotions: bagItems.filter(i => i.baseId === 'mana_potion').length,
        stPotions:   bagItems.filter(i => i.baseId === 'stamina_potion').length,
      })
    })
    return () => sub.remove()
  }, [])

  if (loading) return <LoadingScreen />

  const showMainMenu = !runStarted
    && screen !== 'gameover' && screen !== 'victory'
    && screen !== 'classSelect' && screen !== 'stash' && screen !== 'graveyard'
    && screen !== 'town' && screen !== 'settings' && screen !== 'inventory'
    && screen !== 'codex'

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      {showMainMenu && (
        <>
          <MainMenu />
          {!onboardingDone && <FirstRunOverlay onDismiss={setOnboardingDone} />}
        </>
      )}
      {!runStarted && screen === 'classSelect'        && <ScreenFade key="classSelect"><ClassSelectScreen /></ScreenFade>}
      {(screen === 'gameover' || screen === 'victory') && <ScreenFade key={screen}><EndScreen won={screen === 'victory'} /></ScreenFade>}
      {runStarted && screen === 'grid'                && <ScreenFade key="grid"><GridScreen /></ScreenFade>}
      {runStarted && screen === 'combat'              && <ScreenFade key="combat"><CombatScreen /></ScreenFade>}
      {runStarted && screen === 'loot'                && <ScreenFade key="loot"><LootScreen /></ScreenFade>}
      {screen === 'inventory'                         && <ScreenFade key="inventory"><InventoryScreen /></ScreenFade>}
      {screen === 'codex'                             && <ScreenFade key="codex"><CodexScreen /></ScreenFade>}
      {screen === 'graveyard'                         && <ScreenFade key="graveyard"><GraveyardScreen /></ScreenFade>}
      {screen === 'stash'                             && <ScreenFade key="stash"><StashScreen /></ScreenFade>}
      {screen === 'town'                              && <ScreenFade key="town"><TownScreen /></ScreenFade>}
      {screen === 'settings'                          && <ScreenFade key="settings"><SettingsScreen onBack={() => setScreen(runStarted ? 'grid' : 'classSelect')} /></ScreenFade>}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const menuStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 28,
  },
  titleBlock: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: COLORS.gold,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 8,
    textAlign: 'center',
    textShadowColor: COLORS.gold,
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  subtitle: {
    color: COLORS.textDim,
    fontSize: 11,
    letterSpacing: 4,
  },
  charCard: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 16,
    gap: 10,
    alignItems: 'center',
  },
  charCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  classDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  charClass: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 3,
    flex: 1,
  },
  charBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  tierBadge: {
    backgroundColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  tierBadgeText: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  persistText: {
    color: COLORS.gold,
    fontSize: 12,
    letterSpacing: 3,
    fontWeight: '700',
  },
  ascensionBadge: {
    backgroundColor: COLORS.goldDim,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  ascensionBadgeText: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  actions: {
    width: '100%',
    gap: 12,
    alignItems: 'center',
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: COLORS.goldDim,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 8,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 4,
  },
  primaryBtnText: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 5,
  },
  primaryBtnSub: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 2,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    position: 'relative',
  },
  stashBtn: {
    borderColor: COLORS.border2,
    backgroundColor: COLORS.surface,
  },
  graveyardBtn: {
    borderColor: COLORS.redDim,
    backgroundColor: COLORS.surface,
  },
  stashIcon: {
    fontSize: 14,
    color: COLORS.xpBar,
  },
  graveyardIcon: {
    fontSize: 13,
    color: COLORS.monsterHpHigh,
  },
  secondaryBtnText: {
    color: COLORS.textDim,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: COLORS.gold,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  graveBadge: {
    backgroundColor: COLORS.monsterHpHigh,
  },
  badgeText: {
    color: COLORS.bg,
    fontSize: 9,
    fontWeight: '900',
  },
  hint: {
    color: COLORS.textDim,
    fontSize: 10,
    letterSpacing: 1,
    textAlign: 'center',
  },
  careerRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  careerStat: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 1,
  },
  careerDot: {
    color: COLORS.border2,
    fontSize: 9,
  },
})

const endStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    gap: 20,
  },
  topBlock: {
    alignItems: 'center',
    gap: 6,
  },
  headline: {
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 8,
  },
  sub: {
    color: COLORS.textDim,
    fontSize: 12,
    letterSpacing: 2,
  },
  runSummaryCard: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 4,
  },
  runSummaryEyebrow: {
    color: COLORS.textDim,
    fontSize: 8,
    letterSpacing: 2,
  },
  runSummaryRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  runSummaryStat: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  runSummaryDot: {
    color: COLORS.border2,
    fontSize: 11,
  },
  sacrificeCard: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.redDim,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.monsterHpHigh,
    borderRadius: 8,
    padding: 16,
    gap: 4,
    alignItems: 'center',
  },
  sacrificeEyebrow: {
    color: COLORS.textDim,
    fontSize: 8,
    letterSpacing: 2,
  },
  sacrificeKilledBy: {
    color: COLORS.red,
    fontSize: 9,
    letterSpacing: 0.5,
    opacity: 0.8,
  },
  sacrificeName: {
    color: COLORS.red,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1,
  },
  sacrificeMeta: {
    color: COLORS.textDim,
    fontSize: 10,
    letterSpacing: 1,
  },
  sacrificeStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    justifyContent: 'center',
  },
  sacrificeStat: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 0.3,
    opacity: 0.7,
  },
  classHintRow: {
    marginTop: 4,
  },
  classHintText: {
    color: COLORS.textDim,
    fontSize: 10,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  classHintName: {
    fontWeight: '700',
  },
  progressCard: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 16,
    gap: 8,
    alignItems: 'center',
  },
  progressEyebrow: {
    color: COLORS.textDim,
    fontSize: 8,
    letterSpacing: 2,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  classDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  progressClass: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 2,
  },
  progressStats: {
    color: COLORS.textDim,
    fontSize: 11,
    letterSpacing: 2,
  },
  actions: {
    width: '100%',
    gap: 10,
    alignItems: 'center',
  },
  primaryBtn: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 4,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: {
    color: COLORS.textDim,
    fontSize: 11,
    letterSpacing: 2,
  },
  ascendBtn: {
    width: '100%',
    backgroundColor: COLORS.goldDim,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 4,
  },
  ascendBtnText: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 4,
  },
  ascendBtnSub: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 1,
  },
  epitaphBlock: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  epitaphLine1: {
    color: COLORS.textDim,
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.3,
    lineHeight: 16,
  },
  epitaphLine2: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  echoGiftBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.purple,
    borderRadius: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 3,
  },
  echoGiftBtnText: {
    color: COLORS.purple,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  echoGiftBtnSub: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 1,
  },
  echoConfirmed: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.purple + '55',
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignItems: 'center',
    backgroundColor: COLORS.purple + '11',
  },
  echoConfirmedText: {
    color: COLORS.purple,
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: '700',
  },
  floorCompareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  floorCompareLabel: {
    color: COLORS.textDim,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  floorNewBest: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  floorBest: {
    color: COLORS.textDim,
    fontSize: 10,
    letterSpacing: 1,
  },
})
