import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert,
} from 'react-native'
import type { Item } from '../engine/loot'
import { getItemColor } from '../utils/itemDisplay'
import { RUNEWORDS, getRuneBonus, getGemBonus, gemColor, gemNextTier } from '../data/runewords'
import { COLORS } from '../theme'

function humanStat(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, c => c.toUpperCase())
    .trim()
}

const STAT_DESC: Record<string, string> = {
  damage:           'Added flat damage on every attack.',
  minDamage:        'Minimum damage rolled per hit.',
  maxDamage:        'Maximum damage rolled per hit.',
  fireDamage:       'Extra fire damage added to each hit.',
  coldDamage:       'Extra cold damage; slows enemy attack speed.',
  lightningDamage:  'Extra lightning damage; ignores some defense.',
  thornDamage:      'Reflects a portion of damage received back to attacker.',
  defense:          'Reduces incoming physical damage.',
  armor:            'Reduces incoming physical damage.',
  life:             'Increases your maximum hit points.',
  mana:             'Increases your mana pool (future skills).',
  strength:         'Increases damage and unlocks heavier gear.',
  dexterity:        'Improves critical hit chance and attack speed.',
  magicFind:        'Increases the chance that drops are Magic, Rare or Unique.',
  goldFind:         'More gold from monster drops.',
  critChance:       'Chance to deal 2× damage on a hit.',
  attackSpeed:      'Higher value means you attack more often per round.',
  moveSpeed:        'Increases tiles moved per stamina point (future).',
  stamina:          'Increases your maximum stamina pool.',
  lifeSteal:        'Percentage of damage dealt returned as HP.',
  blockChance:      'Chance to fully block an incoming attack.',
  resistFire:       'Reduces fire damage taken by this percentage.',
  resistCold:       'Reduces cold damage taken by this percentage.',
  resistLightning:  'Reduces lightning damage taken by this percentage.',
  resistPoison:     'Reduces poison damage taken by this percentage.',
  fireResist:       'Reduces fire damage taken.',
  coldResist:       'Reduces cold damage taken.',
  lightResist:      'Reduces lightning damage taken.',
  poisonResist:     'Reduces poison damage taken.',
}

function fmtVal(v: number): string {
  return v > 0 ? `+${v}` : `${v}`
}

function qualityLabel(item: Item): string {
  if (item.runewordId) return 'RUNEWORD'
  return item.quality.toUpperCase()
}


interface Props {
  item: Item
  compareWith: Item | null   // equipped in same slot — for delta column
  isEquipped:  boolean       // item is from the equipment panel
  onEquip?:    () => void    // bag item, equippable slot
  onUnequip?:  () => void    // equipped item
  onDrop?:     () => void    // bag item → permanent delete
  onStash?:    () => void    // bag item → move to shared stash
  onTake?:     () => void    // loot screen pick-up
  onUse?:      () => void    // consumable (potion) — use outside combat
  onClose:     () => void
  /** Runes and gems available in bag for insertion into sockets */
  bagSocketables?: Item[]
  /** Called with socketable UID when player inserts into an empty socket */
  onInsertRune?:   (runeUid: string) => void
}

export function ItemDetailSheet({
  item, compareWith,
  onEquip, onUnequip, onDrop, onStash, onTake, onUse, onClose,
  bagSocketables, onInsertRune,
}: Props) {
  const nameColor = getItemColor(item)
  const [infoKey, setInfoKey] = useState<string | null>(null)
  const [runePickerOpen, setRunePickerOpen] = useState(false)
  const canInsertRune = !!onInsertRune && item.quality === 'normal' && item.insertedRunes.length < item.sockets

  // Union of all stat keys from both items
  const allKeys = Array.from(
    new Set([
      ...Object.keys(item.effectiveStats),
      ...(compareWith ? Object.keys(compareWith.effectiveStats) : []),
    ])
  ).filter(k => {
    const a = item.effectiveStats[k] ?? 0
    const b = compareWith?.effectiveStats[k] ?? 0
    return a !== 0 || b !== 0
  })

  const hasStats = allKeys.length > 0
  const hasAffixes = item.affixes.length > 0
  const hasCompare = !!compareWith

  // ── Unidentified view ──────────────────────────────────────────────────────
  if (!item.identified) {
    return (
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.scrollContent}>
            <View style={styles.nameRow}>
              <View style={[styles.qualityBadge, { borderColor: nameColor }]}>
                <Text style={[styles.qualityText, { color: nameColor }]}>{qualityLabel(item)}</Text>
              </View>
            </View>
            <Text style={[styles.itemName, { color: nameColor }]}>
              {item.slot.charAt(0).toUpperCase() + item.slot.slice(1)}
            </Text>
            <Text style={styles.metaLine}>
              {item.slot.toUpperCase()}  ·  {item.size[0]}×{item.size[1]}
            </Text>
            <View style={styles.unidBlock}>
              <Text style={styles.unidLock}>?</Text>
              <Text style={styles.unidMessage}>UNIDENTIFIED</Text>
              <Text style={styles.unidSub}>Stats are hidden until picked up.</Text>
              <Text style={styles.unidSub}>Magic, Rare, and Unique items drop unidentified — take them to reveal what they are.</Text>
            </View>
          </View>
          <View style={styles.actions}>
            {onTake && (
              <TouchableOpacity style={[styles.btn, styles.btnEquip]} onPress={onTake}>
                <Text style={styles.btnEquipText}>TAKE & IDENTIFY</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.btn, styles.btnClose]} onPress={onClose}>
              <Text style={styles.btnCloseText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.overlay}>
      {/* Backdrop — tap to close */}
      <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

      {/* Sheet card */}
      <View style={styles.sheet}>
        {/* Drag handle */}
        <View style={styles.handle} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Quality badge + name */}
          <View style={styles.nameRow}>
            <View style={[styles.qualityBadge, { borderColor: nameColor }]}>
              <Text style={[styles.qualityText, { color: nameColor }]}>{qualityLabel(item)}</Text>
            </View>
          </View>
          <Text style={[styles.itemName, { color: nameColor }]}>{item.displayName}</Text>

          {/* Runeword name */}
          {item.runewordId && (
            <Text style={styles.runewordName}>{item.runewordId.replace(/_/g, ' ').toUpperCase()}</Text>
          )}

          {/* Meta row */}
          <Text style={styles.metaLine}>
            {item.slot.toUpperCase()}  ·  {item.size[0]}×{item.size[1]}
            {item.sockets > 0 ? `  ·  ${item.sockets} sockets` : ''}
          </Text>

          {/* Sockets */}
          {item.sockets > 0 && (
            <>
              <View style={styles.socketsRow}>
                {item.insertedRunes.map((r, i) => {
                  const isGem = r.startsWith('gem_')
                  const gc = isGem ? gemColor(r) : null
                  const label = isGem
                    ? r.replace('gem_', '').charAt(0).toUpperCase()
                    : r.replace('rune_', '').toUpperCase()
                  return (
                    <View key={i} style={[
                      styles.socket,
                      isGem
                        ? [styles.socketGem, { borderColor: gc!, backgroundColor: gc! + '30' }]
                        : styles.socketFilled,
                    ]}>
                      <Text style={[styles.socketRuneText, isGem && { color: gc! }]}>{label}</Text>
                    </View>
                  )
                })}
                {Array.from({ length: item.sockets - item.insertedRunes.length }, (_, i) => (
                  <TouchableOpacity
                    key={`empty${i}`}
                    style={[styles.socket, canInsertRune && styles.socketTappable]}
                    onPress={canInsertRune ? () => setRunePickerOpen(v => !v) : undefined}
                    activeOpacity={canInsertRune ? 0.6 : 1}
                  >
                    <Text style={[styles.socketEmptyText, canInsertRune && styles.socketEmptyTappable]}>
                      {canInsertRune ? '⊕' : '○'}
                    </Text>
                  </TouchableOpacity>
                ))}
                {item.quality === 'normal' && item.insertedRunes.length === 0 && (
                  <Text style={styles.runewordHint}>
                    {canInsertRune ? ' ← tap to insert rune' : ' ← runeword base'}
                  </Text>
                )}
              </View>

              {/* Runeword hints — only for normal socketed items not yet activated */}
              {item.quality === 'normal' && !item.runewordId && (() => {
                // Gems occupy socket slots but don't participate in runeword matching —
                // mirror the same filter used in insertRune() / matchRuneword()
                const insertedRunes = item.insertedRunes.filter(id => !id.startsWith('gem_'))
                const gemCount      = item.insertedRunes.length - insertedRunes.length
                const freeSockets   = item.sockets - item.insertedRunes.length

                const runeSockets = item.sockets - gemCount  // sockets available for runes
                const hints = RUNEWORDS.filter(rw => {
                  if (!rw.validSlots.includes(item.slot)) return false
                  // Runeword must fill ALL remaining rune sockets exactly — no wasted slots
                  if (rw.recipe.length !== runeSockets) return false
                  if (rw.recipe.length < insertedRunes.length) return false
                  // Inserted runes must be a strict prefix of the recipe (exact order)
                  for (let i = 0; i < insertedRunes.length; i++) {
                    if (rw.recipe[i] !== insertedRunes[i]) return false
                  }
                  return true
                })
                if (hints.length === 0) return null
                return (
                  <View style={rwStyles.hintBox}>
                    <Text style={rwStyles.hintTitle}>
                      POSSIBLE RUNEWORDS{gemCount > 0 ? ` (${freeSockets} socket${freeSockets !== 1 ? 's' : ''} left)` : ''}
                    </Text>
                    {hints.slice(0, 3).map(rw => {
                      const remaining = rw.recipe.slice(insertedRunes.length)
                      const nextRune  = remaining[0]
                      return (
                        <View key={rw.id} style={rwStyles.hintRow}>
                          <Text style={rwStyles.hintName}>{rw.name}</Text>
                          <Text style={rwStyles.hintRecipe}>
                            {remaining.map(r => r.replace('rune_', '')).join(' · ')}
                          </Text>
                          {nextRune && (
                            <Text style={rwStyles.hintNext}>
                              next: <Text style={rwStyles.hintNextRune}>{nextRune.replace('rune_', '').toUpperCase()}</Text>
                            </Text>
                          )}
                        </View>
                      )
                    })}
                  </View>
                )
              })()}

              {/* Inline socketable picker */}
              {runePickerOpen && onInsertRune && (
                <View style={styles.runePicker}>
                  <Text style={styles.runePickerTitle}>INSERT RUNE OR GEM</Text>
                  {bagSocketables && bagSocketables.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.runePickerRow}>
                      {bagSocketables.map(s => {
                        const isGem = s.slot === 'gem'
                        const gc = isGem ? gemColor(s.baseId) : null
                        const bonusEntries = isGem
                          ? Object.entries(getGemBonus(s.baseId, item.slot))
                          : Object.entries(getRuneBonus(s.baseId, item.slot))
                        return (
                          <TouchableOpacity
                            key={s.uid}
                            style={[
                              styles.runePickerChip,
                              isGem && { borderColor: gc!, backgroundColor: gc! + '18' },
                            ]}
                            onPress={() => {
                              onInsertRune(s.uid)
                              setRunePickerOpen(false)
                            }}
                          >
                            <Text style={[styles.runePickerChipId, isGem && { color: gc! }]}>
                              {isGem
                                ? s.baseId.replace('gem_', '').replace(/_/g, ' ').toUpperCase()
                                : s.baseId.replace('rune_', '').toUpperCase()}
                            </Text>
                            <Text style={styles.runePickerChipName} numberOfLines={1}>
                              {s.displayName}
                            </Text>
                            {bonusEntries.length > 0 && (
                              <Text style={[styles.runePickerBonusLine, isGem && { color: gc! + 'cc' }]}>
                                {bonusEntries.map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${humanStat(k)}`).join('  ')}
                              </Text>
                            )}
                          </TouchableOpacity>
                        )
                      })}
                    </ScrollView>
                  ) : (
                    <Text style={styles.runePickerEmpty}>No runes or gems in bag</Text>
                  )}
                </View>
              )}
            </>
          )}

          {/* Inserted rune/gem bonuses — show individual contributions when no runeword activated */}
          {item.insertedRunes.length > 0 && !item.runewordId && (() => {
            const bonusLines: { label: string; entries: [string, number][]; isGem: boolean; color: string | null }[] = []
            for (const id of item.insertedRunes) {
              const isGem = id.startsWith('gem_')
              const bonus = isGem ? getGemBonus(id, item.slot) : getRuneBonus(id, item.slot)
              const entries = Object.entries(bonus) as [string, number][]
              if (entries.length === 0) continue
              const label = isGem
                ? id.replace('gem_', '').replace(/_/g, ' ').toUpperCase()
                : id.replace('rune_', '').toUpperCase()
              const color = isGem ? gemColor(id) : null
              bonusLines.push({ label, entries, isGem, color })
            }
            if (bonusLines.length === 0) return null
            return (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>SOCKETED BONUSES</Text>
                {bonusLines.map(({ label, entries, isGem, color }, i) => (
                  <View key={i} style={styles.gemBonusRow}>
                    <Text style={[styles.gemBonusSlot, isGem && color ? { color } : { color: COLORS.runewordColor }]}>
                      {label}
                    </Text>
                    <Text style={[styles.gemBonusStat, isGem && color ? { color } : { color: COLORS.runewordColor }]}>
                      {entries.map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${humanStat(k)}`).join('  ·  ')}
                    </Text>
                  </View>
                ))}
              </View>
            )
          })()}

          <View style={styles.divider} />

          {/* Stats comparison table */}
          {hasStats && (
            <View style={styles.section}>
              <View style={styles.statHeader}>
                <Text style={styles.statHeaderLabel}>STAT</Text>
                <Text style={styles.statHeaderVal}>THIS</Text>
                {hasCompare && (
                  <>
                    <Text style={styles.statHeaderVal}>WORN</Text>
                    <Text style={styles.statHeaderDelta}>DIFF</Text>
                  </>
                )}
              </View>
              <Text style={styles.statTapHint}>Tap a stat for details</Text>
              {allKeys.map(key => {
                const val   = item.effectiveStats[key] ?? 0
                const cval  = compareWith?.effectiveStats[key] ?? 0
                const delta = hasCompare ? val - cval : null
                const desc  = STAT_DESC[key]
                const showInfo = infoKey === key
                return (
                  <View key={key}>
                    <TouchableOpacity
                      style={styles.statRow}
                      onPress={() => setInfoKey(showInfo ? null : key)}
                      activeOpacity={desc ? 0.7 : 1}
                    >
                      <Text style={styles.statLabel}>
                        {humanStat(key)}
                        {desc ? <Text style={styles.infoHint}>  ⓘ</Text> : null}
                      </Text>
                      <Text style={styles.statVal}>{val !== 0 ? fmtVal(val) : '—'}</Text>
                      {hasCompare && (
                        <>
                          <Text style={styles.statVal}>{cval !== 0 ? fmtVal(cval) : '—'}</Text>
                          <Text style={[
                            styles.statDelta,
                            delta! > 0 ? styles.deltaPos :
                            delta! < 0 ? styles.deltaNeg :
                            styles.deltaZero,
                          ]}>
                            {delta === 0 ? '—' : fmtVal(delta!)}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                    {showInfo && desc && (
                      <Text style={styles.statDesc}>{desc}</Text>
                    )}
                  </View>
                )
              })}
              {hasCompare && (
                <Text style={styles.compareNote}>vs  {compareWith!.displayName}</Text>
              )}
            </View>
          )}

          {/* Affixes */}
          {hasAffixes && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>AFFIXES</Text>
              {item.affixes.map((a, i) => (
                <View key={i} style={styles.affixBlock}>
                  <Text style={styles.affixName}>· {a.def.name}</Text>
                  {Object.entries(a.rolledStats).map(([k, v]) => (
                    <Text key={k} style={styles.affixStat}>  {fmtVal(v as number)} {humanStat(k)}</Text>
                  ))}
                </View>
              ))}
            </View>
          )}

          {/* Charm passive note */}
          {item.slot === 'charm' && (
            <View style={styles.charmNote}>
              <Text style={styles.charmNoteText}>✦ Passive — bonuses apply while this charm is in your bag. No need to equip.</Text>
            </View>
          )}

          {/* No stats or affixes */}
          {!hasStats && !hasAffixes && item.slot !== 'rune' && item.slot !== 'gem' && (
            <Text style={styles.emptyStats}>No stats.</Text>
          )}

          {/* Gem bonuses per slot */}
          {item.slot === 'gem' && (() => {
            const gc = gemColor(item.baseId)
            const slotGroups: Array<{ label: string; slots: string[] }> = [
              { label: 'WEAPON',  slots: ['weapon'] },
              { label: 'ARMOR',   slots: ['chest', 'helmet', 'gloves', 'legs'] },
              { label: 'OFFHAND', slots: ['offhand'] },
              { label: 'BOOTS',   slots: ['boots'] },
            ]
            const nextTierId = gemNextTier(item.baseId)
            return (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: gc }]}>GEM BONUSES (always active)</Text>
                {slotGroups.map(({ label, slots }) => {
                  const bonus = getGemBonus(item.baseId, slots[0])
                  const entries = Object.entries(bonus)
                  if (entries.length === 0) return null
                  return (
                    <View key={label} style={styles.gemBonusRow}>
                      <Text style={styles.gemBonusSlot}>{label}</Text>
                      <Text style={[styles.gemBonusStat, { color: gc }]}>
                        {entries.map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${humanStat(k)}`).join('  ·  ')}
                      </Text>
                    </View>
                  )
                })}
                {nextTierId && (
                  <Text style={styles.gemUpgradeHint}>
                    ▲ 3× {item.displayName} → upgrade via Horadric Cube
                  </Text>
                )}
              </View>
            )
          })()}

          {/* Possible runewords for rune items */}
          {item.slot === 'rune' && (() => {
            const slotGroups: Array<{ label: string; slot: string }> = [
              { label: 'Weapon',  slot: 'weapon' },
              { label: 'Armor',   slot: 'chest' },
              { label: 'Offhand', slot: 'offhand' },
              { label: 'Boots',   slot: 'boots' },
            ]
            const bonusPreviews = slotGroups
              .map(({ label, slot }) => ({ label, entries: Object.entries(getRuneBonus(item.baseId, slot)) }))
              .filter(({ entries }) => entries.length > 0)
            return (
              <>
                {bonusPreviews.length > 0 && (
                  <View style={[styles.section, { marginBottom: 8 }]}>
                    <Text style={styles.sectionTitle}>SOLO BONUS (no runeword)</Text>
                    {bonusPreviews.map(({ label, entries }) => (
                      <View key={label} style={styles.gemBonusRow}>
                        <Text style={styles.gemBonusSlot}>{label.toUpperCase()}</Text>
                        <Text style={[styles.gemBonusStat, { color: COLORS.runewordColor }]}>
                          {entries.map(([k, v]) => `${(v as number) > 0 ? '+' : ''}${v} ${humanStat(k)}`).join('  ·  ')}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )
          })()}
          {item.slot === 'rune' && (() => {
            const matches = RUNEWORDS.filter(rw => rw.recipe.includes(item.baseId))
            if (matches.length === 0) return (
              <Text style={styles.emptyStats}>No runewords use this rune.</Text>
            )
            return (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>POSSIBLE RUNEWORDS</Text>
                {matches.map(rw => (
                  <View key={rw.id} style={styles.runewordBlock}>
                    <View style={styles.runewordHeader}>
                      <Text style={styles.runewordBlockName}>{rw.name.toUpperCase()}</Text>
                      <Text style={styles.runewordMeta}>
                        {rw.validSlots.join(' / ').toUpperCase()}  ·  FL {rw.minFloor}+
                      </Text>
                    </View>
                    <View style={styles.runewordRecipe}>
                      {rw.recipe.map((r, i) => (
                        <View key={i} style={[styles.runeChip, r === item.baseId && styles.runeChipActive]}>
                          <Text style={[styles.runeChipText, r === item.baseId && styles.runeChipTextActive]}>
                            {r.replace('rune_', '').toUpperCase()}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.runewordStats}>
                      {Object.entries(rw.stats).map(([k, v]) => (
                        <Text key={k} style={styles.runewordStatText}>
                          {Array.isArray(v)
                            ? `+${v[0]}-${v[1]} ${humanStat(k)}`
                            : `${v > 0 ? '+' : ''}${v} ${humanStat(k)}`}
                        </Text>
                      ))}
                    </View>
                    <Text style={styles.runewordDesc}>{rw.description}</Text>
                  </View>
                ))}
              </View>
            )
          })()}
        </ScrollView>

        {/* Action buttons */}
        <View style={styles.actions}>
          {onUse && (
            <TouchableOpacity style={[styles.btn, styles.btnUse]} onPress={onUse}>
              <Text style={styles.btnUseText}>USE</Text>
            </TouchableOpacity>
          )}
          {onEquip && (
            <TouchableOpacity style={[styles.btn, styles.btnEquip]} onPress={onEquip}>
              <Text style={styles.btnEquipText}>EQUIP</Text>
            </TouchableOpacity>
          )}
          {onUnequip && (
            <TouchableOpacity style={[styles.btn, styles.btnUnequip]} onPress={onUnequip}>
              <Text style={styles.btnUnequipText}>UNEQUIP</Text>
            </TouchableOpacity>
          )}
          {onTake && (
            <TouchableOpacity style={[styles.btn, styles.btnEquip]} onPress={onTake}>
              <Text style={styles.btnEquipText}>TAKE</Text>
            </TouchableOpacity>
          )}
          {onStash && (
            <TouchableOpacity style={[styles.btn, styles.btnStash]} onPress={onStash}>
              <Text style={styles.btnStashText}>STASH</Text>
            </TouchableOpacity>
          )}
          {onDrop && (
            <TouchableOpacity
              style={[styles.btn, styles.btnDrop]}
              onPress={() => Alert.alert(
                'Drop Item?',
                `"${item.displayName}" will be permanently destroyed.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Drop', style: 'destructive', onPress: onDrop },
                ],
              )}
            >
              <Text style={styles.btnDropText}>DROP</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.btn, styles.btnClose]} onPress={onClose}>
            <Text style={styles.btnCloseText}>CLOSE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const rwStyles = StyleSheet.create({
  hintBox: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.runewordColor + '44',
    borderRadius: 6,
    padding: 8,
    marginTop: 8,
    gap: 5,
  },
  hintTitle: {
    color: COLORS.runewordColor,
    fontSize: 8,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 2,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  hintName: {
    color: COLORS.runewordColor,
    fontSize: 11,
    fontWeight: '700',
  },
  hintRecipe: {
    color: COLORS.textDim,
    fontSize: 10,
    flex: 1,
  },
  hintNext: {
    color: COLORS.textDim,
    fontSize: 9,
  },
  hintNextRune: {
    color: COLORS.gold,
    fontWeight: '700',
  },
})

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: COLORS.border2,
    maxHeight: '72%',
    paddingBottom: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border2,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  qualityBadge: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  qualityText: {
    fontSize: 8,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  itemName: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 2,
  },
  runewordName: {
    color: COLORS.runewordColor,
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 2,
  },
  metaLine: {
    color: COLORS.textDim,
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 8,
  },
  socketsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  socket: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border2,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  socketFilled: {
    backgroundColor: COLORS.goldDim,
    borderColor: COLORS.gold,
  },
  socketGem: {
    // border/bg set inline via gem color
  },
  socketRuneText: {
    color: COLORS.gold,
    fontSize: 7,
    fontWeight: '800',
  },
  socketEmptyText: {
    color: COLORS.textDim,
    fontSize: 12,
  },
  socketTappable: {
    borderColor: COLORS.runewordColor,
    borderStyle: 'dashed',
  },
  socketEmptyTappable: {
    color: COLORS.runewordColor,
    fontSize: 14,
  },
  runewordHint: {
    color: COLORS.gold,
    fontSize: 10,
    marginLeft: 4,
  },
  runePicker: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border2,
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    gap: 6,
  },
  runePickerTitle: {
    color: COLORS.xpBar,
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: '700',
  },
  runePickerRow: {
    gap: 6,
  },
  runePickerChip: {
    backgroundColor: COLORS.goldDim,
    borderWidth: 1,
    borderColor: COLORS.runewordColor,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 52,
    gap: 2,
  },
  runePickerChipId: {
    color: COLORS.runewordColor,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  runePickerChipName: {
    color: COLORS.xpBar,
    fontSize: 8,
    letterSpacing: 0.5,
  },
  runePickerBonusLine: {
    color: COLORS.xpBar,
    fontSize: 7,
    letterSpacing: 0.3,
    textAlign: 'center',
    marginTop: 2,
  },
  runePickerEmpty: {
    color: COLORS.textDim,
    fontSize: 10,
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: 12,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 8,
  },
  statHeader: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  statHeaderLabel: {
    flex: 1,
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 1,
  },
  statHeaderVal: {
    width: 44,
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 1,
    textAlign: 'right',
  },
  statHeaderDelta: {
    width: 36,
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 1,
    textAlign: 'right',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  statLabel: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  statVal: {
    width: 44,
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: 'right',
  },
  statDelta: {
    width: 36,
    fontSize: 11,
    textAlign: 'right',
    fontWeight: '700',
  },
  deltaPos:  { color: COLORS.hpHigh },
  deltaNeg:  { color: COLORS.red },
  deltaZero: { color: COLORS.textDim },
  infoHint: {
    color: COLORS.textDim,
    fontSize: 10,
  },
  statDesc: {
    color: COLORS.green,
    fontSize: 10,
    fontStyle: 'italic',
    paddingLeft: 8,
    paddingBottom: 6,
    lineHeight: 15,
  },
  compareNote: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 6,
    textAlign: 'right',
  },
  affixBlock: {
    marginBottom: 8,
  },
  affixName: {
    color: COLORS.hpHigh,
    fontSize: 11,
    fontWeight: '600',
  },
  affixStat: {
    color: COLORS.green,
    fontSize: 10,
    marginLeft: 8,
  },
  charmNote: {
    backgroundColor: COLORS.goldDim,
    borderWidth: 1,
    borderColor: COLORS.gold + '55',
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
  },
  charmNoteText: {
    color: COLORS.xpBar,
    fontSize: 11,
    lineHeight: 16,
  },
  statTapHint: {
    color: COLORS.textGhost,
    fontSize: 9,
    letterSpacing: 0.5,
    marginBottom: 6,
    textAlign: 'right',
  },
  unidBlock: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 6,
  },
  unidLock: {
    fontSize: 32,
    color: COLORS.textDim,
  },
  unidMessage: {
    color: COLORS.textDim,
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: '700',
  },
  unidSub: {
    color: COLORS.textDim,
    fontSize: 10,
    letterSpacing: 1,
  },
  emptyStats: {
    color: COLORS.textDim,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 20,
  },
  runewordBlock: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border2,
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    gap: 6,
  },
  runewordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  runewordBlockName: {
    color: COLORS.runewordColor,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  runewordMeta: {
    color: COLORS.textSecondary,
    fontSize: 9,
    letterSpacing: 1,
  },
  runewordRecipe: {
    flexDirection: 'row',
    gap: 5,
  },
  runeChip: {
    backgroundColor: COLORS.goldDim,
    borderWidth: 1,
    borderColor: COLORS.border2,
    borderRadius: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  runeChipActive: {
    backgroundColor: COLORS.goldDim,
    borderColor: COLORS.runewordColor,
  },
  runeChipText: {
    color: COLORS.xpBar,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  runeChipTextActive: {
    color: COLORS.runewordColor,
  },
  runewordStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  runewordStatText: {
    color: COLORS.green,
    fontSize: 10,
  },
  runewordDesc: {
    color: COLORS.textDim,
    fontSize: 10,
    fontStyle: 'italic',
  },
  gemBonusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 5,
  },
  gemBonusSlot: {
    color: COLORS.textDim,
    fontSize: 9,
    letterSpacing: 1,
    width: 52,
    paddingTop: 1,
  },
  gemBonusStat: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 15,
  },
  gemUpgradeHint: {
    color: COLORS.xpBar,
    fontSize: 9,
    letterSpacing: 0.5,
    marginTop: 6,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
  },
  btnUse: {
    backgroundColor: COLORS.goldDim,
    borderColor: COLORS.gold,
  },
  btnUseText: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  btnEquip: {
    backgroundColor: COLORS.greenDim,
    borderColor: COLORS.hpHigh,
  },
  btnEquipText: {
    color: COLORS.hpHigh,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  btnUnequip: {
    backgroundColor: COLORS.goldDim,
    borderColor: COLORS.gold,
  },
  btnUnequipText: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  btnStash: {
    backgroundColor: COLORS.blueDim,
    borderColor: COLORS.blue,
    flex: 0,
    paddingHorizontal: 14,
  },
  btnStashText: {
    color: COLORS.blue,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  btnDrop: {
    backgroundColor: COLORS.redDim,
    borderColor: COLORS.monsterHpHigh,
    flex: 0,
    paddingHorizontal: 14,
  },
  btnDropText: {
    color: COLORS.monsterHpHigh,
    fontSize: 11,
    letterSpacing: 1,
  },
  btnClose: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border2,
  },
  btnCloseText: {
    color: COLORS.textDim,
    fontSize: 11,
    letterSpacing: 1,
  },
})
