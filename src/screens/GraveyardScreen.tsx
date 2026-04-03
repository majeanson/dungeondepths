import React from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useGameStore, type GraveyardEntry } from '../store/gameStore'
import { getItemColor } from '../utils/itemDisplay'
import { difficultyLabel } from '../utils/tierName'
import { COLORS } from '../theme'
import { CLASSES } from '../data/classes'
import { EmptyState } from '../components/EmptyState'

// ── Study bonuses — keyed by item quality ─────────────────────────────────────
const STUDY_BONUS_DESC: Record<string, string> = {
  normal:   'Normal items now show socket capacity before pickup.',
  magic:    'Magic items hint at affix count before identification.',
  rare:     'Rare items pulse faintly in revealed tiles.',
  unique:   'Unique item lore entries are auto-unlocked in the Codex.',
  runeword: 'Runeword recipes always visible in the Codex.',
}

function getStudyBonus(entry: GraveyardEntry): { id: string; desc: string } {
  const quality = entry.item.runewordId ? 'runeword' : entry.item.quality
  return { id: quality, desc: STUDY_BONUS_DESC[quality] ?? 'The dungeon yields its secrets slowly.' }
}

// ── Floor Death Heatmap ───────────────────────────────────────────────────────
function FloorHeatmap({ floorDeaths }: { floorDeaths: number[] }) {
  if (floorDeaths.length === 0) return null
  const maxDeaths = Math.max(...floorDeaths.filter(Boolean), 1)
  const bars = Array.from({ length: 30 }, (_, i) => floorDeaths[i] ?? 0)
  return (
    <View style={hmStyles.container}>
      <Text style={hmStyles.title}>DEATH MAP</Text>
      <View style={hmStyles.chart}>
        {bars.map((count, i) => (
          <View key={i} style={hmStyles.barCol}>
            <View style={[hmStyles.bar, { height: Math.max(2, (count / maxDeaths) * 28), opacity: count > 0 ? 0.8 : 0.12 }]} />
            {(i + 1) % 5 === 0 && <Text style={hmStyles.floorLabel}>{i + 1}</Text>}
          </View>
        ))}
      </View>
    </View>
  )
}

const hmStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1110',
    gap: 6,
  },
  title: {
    color: '#7a6a5a',
    fontSize: 8,
    letterSpacing: 2,
    fontWeight: '700',
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 36,
    gap: 1,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 36,
  },
  bar: {
    width: '90%',
    backgroundColor: '#c02a2a',
    borderRadius: 1,
  },
  floorLabel: {
    color: '#7a6a5a',
    fontSize: 6,
    marginTop: 2,
  },
})

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

function EntryCard({ entry, canInvoke, isActive, onInvoke, onStudy }: {
  entry: GraveyardEntry
  canInvoke: boolean
  isActive: boolean
  onInvoke: () => void
  onStudy: () => void
}) {
  const item        = entry.item
  const nameColor   = getItemColor(item)
  const qualLabel   = item.runewordId ? 'RUNEWORD' : item.quality.toUpperCase()
  const classDef    = entry.classId ? CLASSES.find(c => c.id === entry.classId) : null
  const statEntries = Object.entries(item.effectiveStats)

  return (
    <View style={[styles.card, classDef && { borderLeftColor: classDef.color + '88' }, isActive && styles.cardEchoActive]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.qualBadge, { borderColor: nameColor }]}>
            <Text style={[styles.qualText, { color: nameColor }]}>{qualLabel}</Text>
          </View>
          {classDef && (
            <View style={[styles.classBadge, { borderColor: classDef.color + '44' }]}>
              <View style={[styles.classDot, { backgroundColor: classDef.color }]} />
              <Text style={[styles.classLabel, { color: classDef.color }]}>{classDef.name.toUpperCase()}</Text>
            </View>
          )}
        </View>
        <Text style={styles.meta}>T{entry.tier}·F{entry.floor}  ·  {difficultyLabel(entry.tier) ?? 'NORMAL'}  ·  LVL {entry.level}  ·  {formatDate(entry.lostAt)}</Text>
        {entry.killedBy && (
          <Text style={styles.killedBy}>claimed by {entry.killedBy}</Text>
        )}
      </View>
      <Text style={[styles.itemName, { color: nameColor }]}>{item.displayName}</Text>
      <Text style={styles.slotLine}>{item.slot.toUpperCase()}  ·  {item.size[0]}×{item.size[1]}</Text>

      {/* Key stats */}
      {statEntries.length > 0 && (
        <View style={styles.stats}>
          {statEntries.slice(0, 5).map(([k, v], si) => (
            <Text key={`${k}-${si}`} style={styles.stat}>
              {(v as number) > 0 ? '+' : ''}{v as number} {k}
            </Text>
          ))}
          {statEntries.length > 5 && (
            <Text style={styles.stat}>+{statEntries.length - 5} more…</Text>
          )}
        </View>
      )}

      {item.sockets > 0 && (
        <Text style={styles.sockets}>
          {item.insertedRunes.length}/{item.sockets} sockets
          {item.insertedRunes.length > 0 ? ` [${item.insertedRunes.map(r => r.replace('_rune', '').toUpperCase()).join(', ')}]` : ''}
        </Text>
      )}

      {isActive && (
        <Text style={styles.echoActive}>◈ ECHO ACTIVE — 25% stats applied this floor</Text>
      )}
      {!isActive && canInvoke && !entry.studied && (
        <TouchableOpacity style={styles.invokeBtn} onPress={onInvoke}>
          <Text style={styles.invokeBtnText}>INVOKE ECHO  ◈</Text>
        </TouchableOpacity>
      )}

      {/* Study / Studied state */}
      {entry.studied ? (
        <View style={styles.studiedBadge}>
          <Text style={styles.studiedText}>✦ STUDIED — {getStudyBonus(entry).desc}</Text>
        </View>
      ) : !isActive ? (
        <TouchableOpacity style={styles.studyBtn} onPress={onStudy}>
          <Text style={styles.studyBtnText}>STUDY  ✦</Text>
          <Text style={styles.studyBtnSub}>consume for permanent knowledge</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

export function GraveyardScreen() {
  const insets = useSafeAreaInsets()
  const { graveyard, setScreen, runStarted, ghostCharm, invokeGhostEcho, careerStats, studyGraveyardEntry } = useGameStore()

  const sorted = [...graveyard].reverse()  // most recent first
  const echoAvail = runStarted && !ghostCharm

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => setScreen(runStarted ? 'grid' : 'classSelect')}
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>GRAVEYARD</Text>
        <View style={styles.backBtn} />
      </View>

      <Text style={styles.subtitle}>
        {graveyard.length === 0
          ? 'No items lost yet.'
          : `${graveyard.length} item${graveyard.length === 1 ? '' : 's'} claimed by death`}
      </Text>

      {runStarted && ghostCharm && (
        <Text style={styles.echoHint}>◈ Ghost Echo active — returns to rest next floor</Text>
      )}

      <FloorHeatmap floorDeaths={careerStats.floorDeaths ?? []} />

      {graveyard.length === 0 ? (
        <View style={styles.emptyContainer}>
          <EmptyState icon="⚰" title="The graveyard is empty." note="Items lost to death rest here. Invoke them as Ghost Echo to carry their power for one floor." />
          {!runStarted && (
            <TouchableOpacity style={styles.startRunBtn} onPress={() => setScreen('classSelect')}>
              <Text style={styles.startRunText}>START A RUN →</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {sorted.map((entry, i) => (
            <EntryCard
              key={entry.item.uid ? `${entry.item.uid}-${i}` : `grave-${i}`}
              entry={entry}
              canInvoke={echoAvail}
              isActive={!!(ghostCharm && ghostCharm.uid === entry.item.uid)}
              onInvoke={() => invokeGhostEcho(i)}
              onStudy={() => studyGraveyardEntry(entry.item.uid)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
  },
  startRunBtn: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 6,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  startRunText: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 60,
  },
  backText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    letterSpacing: 1,
  },
  title: {
    color: COLORS.red,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 4,
  },
  subtitle: {
    color: COLORS.textDim,
    fontSize: 11,
    letterSpacing: 1,
    textAlign: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 14,
    gap: 10,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.redDim,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  classBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  classDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  classLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },
  qualBadge: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  qualText: {
    fontSize: 7,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  meta: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  slotLine: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 1,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  stat: {
    color: COLORS.green,
    fontSize: 10,
  },
  sockets: {
    color: COLORS.gold,
    fontSize: 10,
    marginTop: 2,
  },
  killedBy: {
    color: COLORS.red,
    fontSize: 9,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  cardEchoActive: {
    borderColor: COLORS.purple,
    borderLeftColor: COLORS.purple,
  },
  echoActive: {
    color: COLORS.purple,
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 6,
    fontWeight: '700',
  },
  invokeBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.purple,
    borderRadius: 4,
    paddingVertical: 7,
    alignItems: 'center',
  },
  invokeBtnText: {
    color: COLORS.purple,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  echoHint: {
    color: COLORS.purple,
    fontSize: 10,
    letterSpacing: 1,
    textAlign: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  studyBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.xpBar,
    borderRadius: 4,
    paddingVertical: 7,
    alignItems: 'center',
    gap: 2,
  },
  studyBtnText: {
    color: COLORS.xpBar,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  studyBtnSub: {
    color: COLORS.textDim,
    fontSize: 8,
    letterSpacing: 1,
  },
  studiedBadge: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: COLORS.xpBar + '44',
    borderRadius: 4,
    backgroundColor: COLORS.xpBar + '0f',
  },
  studiedText: {
    color: COLORS.xpBar,
    fontSize: 9,
    letterSpacing: 0.5,
    fontStyle: 'italic',
  },
})
