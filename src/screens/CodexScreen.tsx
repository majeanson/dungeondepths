/**
 * CodexScreen — in-game Field Guide.
 * 5 tabs, each sourced from feature.json codexEntry fields.
 * Tabs: MAP | COMBAT | SKILLS | ITEMS | RUN
 */
import React, { useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { useGameStore } from '../store/gameStore'
import { COLORS } from '../theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MONSTER_AFFIXES, type MonsterAffix } from '../data/monsters'
import { CLASSES } from '../data/classes'
import { SKILLS } from '../data/skills'
import {
  ENCOUNTERS, AFFIX_DETAILS, ITEM_TIERS, SKILL_DETAIL,
  XP_ROWS, TIER_ROWS, encPct,
} from '../data/codex'
import { RECIPES, type RecipeDef } from '../data/recipes'

// ── Component ─────────────────────────────────────────────────────────────────

type Tab = 'map' | 'combat' | 'classes' | 'skills' | 'items' | 'crafting' | 'run'

const TAB_LABELS: Record<Tab, string> = {
  map:      'MAP',
  combat:   'COMBAT',
  classes:  'CLASSES',
  skills:   'SKILLS',
  items:    'ITEMS',
  crafting: 'CUBE',
  run:      'RUN',
}

export function CodexScreen() {
  const insets = useSafeAreaInsets()
  const { setScreen, runStarted } = useGameStore()
  const [tab, setTab] = useState<Tab>('map')

  const affixList = Object.entries(MONSTER_AFFIXES) as [MonsterAffix, { name: string; description: string }][]

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setScreen(runStarted ? 'grid' : 'classSelect')}>
          <Text style={styles.backText}>{runStarted ? '← MAP' : '← BACK'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>FIELD GUIDE</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{TAB_LABELS[t]}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ── MAP tab ── */}
        {tab === 'map' && (
          <>
            <Text style={styles.sectionNote}>
              Unvisited floor tiles are color-coded by their encounter type. Step on a tile to trigger it — each tile only triggers once per floor.
            </Text>

            {ENCOUNTERS.map(enc => (
              <View key={enc.key} style={styles.encCard}>
                <View style={styles.encHeader}>
                  <View style={[styles.encTile, { backgroundColor: enc.tileColor }]}>
                    <Text style={[styles.encGlyph, { color: enc.glyphColor }]}>{enc.glyph}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={[styles.encName, { color: enc.glyphColor }]}>{enc.name.toUpperCase()}</Text>
                    {enc.floorNote && <Text style={styles.encFloorNote}>{enc.floorNote}</Text>}
                  </View>
                  <View style={styles.encPctBox}>
                    <Text style={styles.encPct}>{encPct(enc.key)}%</Text>
                    <Text style={styles.encPctLabel}>base rate</Text>
                  </View>
                </View>
                <Text style={styles.encDesc}>{enc.description}</Text>
                <View style={styles.pillRow}>
                  <Text style={styles.pillLabel}>DROPS</Text>
                  <Text style={styles.pillText}>{enc.reward}</Text>
                </View>
              </View>
            ))}

            <NoteCard title="FLOOR SCALING">
              <Text style={styles.noteBody}>
                Empty weight drops 5 per floor (min 100). Elite/Rare/Ancient gain weight each floor. By floor 10, elite encounters are nearly twice as common as floor 1.
              </Text>
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                  <Text style={[styles.tableCell, styles.tableCellHdr]}>Floor</Text>
                  <Text style={[styles.tableCell, styles.tableCellHdr, { color: COLORS.encounter.normal }]}>Normal</Text>
                  <Text style={[styles.tableCell, styles.tableCellHdr, { color: COLORS.encounter.elite }]}>Elite</Text>
                  <Text style={[styles.tableCell, styles.tableCellHdr, { color: COLORS.encounter.rare }]}>Rare</Text>
                  <Text style={[styles.tableCell, styles.tableCellHdr, { color: COLORS.encounter.ancient }]}>Anc</Text>
                </View>
                {[1, 3, 5, 8, 10].map(f => {
                  const bonus  = Math.max(0, f - 1)
                  const empty  = Math.max(100, 600 - bonus * 5)
                  const normal = Math.max(50, 250 - bonus * 2)
                  const elite  = 100 + bonus * 3
                  const rare   = 30  + bonus * 2
                  const anc    = 5   + bonus
                  const tot    = empty + normal + elite + rare + 10 + 5 + anc
                  return (
                    <View key={f} style={styles.tableRow}>
                      <Text style={[styles.tableCell, { color: COLORS.textSecondary }]}>F{f}</Text>
                      <Text style={[styles.tableCell, { color: COLORS.encounter.normal }]}>{(normal/tot*100).toFixed(0)}%</Text>
                      <Text style={[styles.tableCell, { color: COLORS.encounter.elite }]}>{(elite/tot*100).toFixed(0)}%</Text>
                      <Text style={[styles.tableCell, { color: COLORS.encounter.rare }]}>{(rare/tot*100).toFixed(0)}%</Text>
                      <Text style={[styles.tableCell, { color: COLORS.encounter.ancient }]}>{(anc/tot*100).toFixed(1)}%</Text>
                    </View>
                  )
                })}
              </View>
            </NoteCard>

            <NoteCard title="RUNE DROP CHANCE">
              <Text style={styles.noteBody}>
                Every encounter has an independent chance to drop a rune on top of normal loot.{'\n'}
                Normal: 5% · Elite: 15% · Rare: 25% · Chest: 38% · Ancient: 40% · Boss: 80%{'\n'}
                Higher floors unlock better runes. Lower runes are always more common.
              </Text>
            </NoteCard>
          </>
        )}

        {/* ── COMBAT tab ── */}
        {tab === 'combat' && (
          <>
            <Text style={styles.sectionNote}>
              Combat is a fast transaction. Each round you choose one action — monster retaliates unless it died, fled, or you used Shadow Step. Potions are instant with no counter-attack.
            </Text>

            <SectionHeader>TURN ORDER</SectionHeader>
            <NoteCard>
              <Text style={styles.noteBody}>
                Turn order is determined by your Attack Speed stat vs. monster speed.
                {'\n\n'}If your attack speed ≥ monster speed × 50: you go first — attack, then monster retaliates.
                {'\n'}If your attack speed &lt; monster speed × 50: monster strikes first, then you counterattack.
                {'\n\n'}Default attack speed is 50 (floor-independent). Extra Fast monsters hard-bypass the speed check — they <Text style={styles.inlineEm}>always</Text> go first regardless of your attack speed.
              </Text>
            </NoteCard>

            <SectionHeader>HIT & MISS</SectionHeader>
            <NoteCard>
              <Text style={styles.noteBody}>
                <Text style={styles.inlineLabel}>Your hit chance</Text>
                {'\n'}= clamp(85% + Dex×0.6% − MonsterSpeed×7%,  min 50%, max 95%)
                {'\n\n'}
                <Text style={styles.inlineLabel}>Monster hit chance</Text>
                {'\n'}= clamp(65% + MonsterSpeed×6% − Dex×0.3%,  min 50%, max 90%)
                {'\n\n'}At 0 Dex vs a speed-1 monster: you hit ~78%, monster hits ~71%.{'\n'}
                Extra Fast boosts monster speed → harder to hit, it hits you more often.{'\n'}
                Dexterity on gear improves both your accuracy and your avoidance.
              </Text>
            </NoteCard>

            <SectionHeader>BLOCKING</SectionHeader>
            <NoteCard>
              <Text style={styles.noteBody}>
                Block is checked <Text style={styles.inlineEm}>after</Text> a hit lands — only hits that would deal damage can be blocked.
                {'\n\n'}• Equipping any off-hand item: <Text style={styles.inlineEm}>+10% base block</Text>
                {'\n'}• Block Chance stat on items adds on top
                {'\n'}• Hard cap: <Text style={styles.inlineEm}>75% maximum</Text>
                {'\n\n'}<Text style={{ color: COLORS.red }}>Elemental damage cannot be blocked.</Text> Fire, cold, and lightning bypass shields entirely — only physical damage is affected.
              </Text>
            </NoteCard>

            <SectionHeader>ELEMENTAL DAMAGE</SectionHeader>
            {([
              { label: '🔥 Fire', color: COLORS.red, lines: ['Additive on top of physical — never replaces it', 'Enemy hit by fire: Burning → monster physical retaliation −15% this round', 'Fire Enchanted monster: deals +40% base damage as fire', 'Your fire resist (cap 75%) reduces incoming fire damage'] },
              { label: '❄ Cold', color: COLORS.blue, lines: ['Additive on top of physical', 'Enemy hit by cold: Chilled → monster hit chance −20% on their retaliation this round', 'Cold Enchanted monster: deals +40% base damage as cold', 'Cold is the best defensive element — it weakens the monster\'s counter-attack'] },
              { label: '⚡ Lightning', color: COLORS.gold, lines: ['Additive on top of physical (gear-based lightning gets ×1.25 bonus vs physical)', 'No status effect — pure DPS element', 'Lightning Enchanted monster: deals +35% base damage as lightning', 'Lightning resist (cap 75%) applies'] },
            ] as const).map(el => (
              <View key={el.label} style={styles.encCard}>
                <Text style={[styles.encName, { color: el.color, marginBottom: 6 }]}>{el.label}</Text>
                {el.lines.map((l, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>·</Text>
                    <Text style={styles.bulletText}>{l}</Text>
                  </View>
                ))}
              </View>
            ))}

            <NoteCard title="RESIST CAP">
              <Text style={styles.noteBody}>
                All resistance types are capped at <Text style={{ color: COLORS.gold }}>75%</Text>. You cannot fully negate elemental damage. Stack resists to 75% against enchanted monsters for the best survivability.
              </Text>
            </NoteCard>

            <SectionHeader>MONSTER AFFIXES</SectionHeader>
            <Text style={[styles.sectionNote, { marginBottom: 4 }]}>
              Rolls 0–3 affixes depending on encounter tier. Affixes shown as red badges on the encounter splash.
            </Text>
            {affixList.map(([key, { name }]) => {
              const detail = AFFIX_DETAILS[key]
              return (
                <View key={key} style={styles.affixCard}>
                  <Text style={styles.affixName}>{name.toUpperCase()}</Text>
                  {detail ? (
                    <>
                      <Text style={styles.affixDesc}>{detail.combat}</Text>
                      <View style={styles.pillRow}>
                        <Text style={styles.pillLabel}>COUNTER</Text>
                        <Text style={styles.pillText}>{detail.counter}</Text>
                      </View>
                    </>
                  ) : (
                    <Text style={styles.affixDesc}>{MONSTER_AFFIXES[key].description}</Text>
                  )}
                </View>
              )
            })}

            <NoteCard title="ACTIONS REFERENCE">
              <Text style={styles.noteBody}>
                <Text style={styles.inlineEm}>Attack</Text> — standard attack, monster retaliates.{'\n'}
                <Text style={styles.inlineEm}>Potion</Text> — <Text style={{ color: COLORS.green }}>instant heal, no retaliation.</Text> HP scales by floor: 60 / 100 / 160 / 220. 3 potions at run start.{'\n'}
                <Text style={styles.inlineEm}>Flee</Text> — always succeeds immediately. No damage dealt or received. Cannot flee bosses.{'\n'}
                <Text style={styles.inlineEm}>Skill</Text> — replaces Attack. Monster retaliates unless the skill prevents it (Shadow Step, Smoke Bomb).
              </Text>
            </NoteCard>
          </>
        )}

        {/* ── CLASSES tab ── */}
        {tab === 'classes' && (
          <>
            <Text style={styles.sectionNote}>
              Choose a class at the start of each run. Level and XP persist — your class can change but power is cumulative.
            </Text>

            {CLASSES.map(cls => {
              const skills = SKILLS.filter(s => s.classId === cls.id)
              return (
                <View key={cls.id} style={[styles.classCard, { borderLeftColor: cls.color }]}>
                  {/* Header */}
                  <View style={styles.classCardHeader}>
                    <Text style={[styles.classCardName, { color: cls.color }]}>{cls.name.toUpperCase()}</Text>
                    <View style={[styles.classTagBadge, { borderColor: cls.color + '44' }]}>
                      <Text style={[styles.classTagText, { color: cls.color + 'cc' }]}>
                        {cls.id === 'warrior' ? 'BEGINNER' : cls.id === 'rogue' ? 'INTERMEDIATE' : 'ADVANCED'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.classDesc}>{cls.description}</Text>

                  {/* Key stats */}
                  <View style={styles.classStatGrid}>
                    {cls.bonusHp !== 0 && (
                      <View style={styles.classStatChip}>
                        <Text style={[styles.classStatVal, { color: cls.bonusHp > 0 ? COLORS.green : COLORS.red }]}>
                          {cls.bonusHp > 0 ? '+' : ''}{cls.bonusHp}
                        </Text>
                        <Text style={styles.classStatKey}>HP</Text>
                      </View>
                    )}
                    {cls.defensePerLevel > 0 && (
                      <View style={styles.classStatChip}>
                        <Text style={[styles.classStatVal, { color: COLORS.runewordColor }]}>+{cls.defensePerLevel}/lvl</Text>
                        <Text style={styles.classStatKey}>DEF</Text>
                      </View>
                    )}
                    {cls.bonusCritChance > 0 && (
                      <View style={styles.classStatChip}>
                        <Text style={[styles.classStatVal, { color: COLORS.gold }]}>+{cls.bonusCritChance}%</Text>
                        <Text style={styles.classStatKey}>CRIT</Text>
                      </View>
                    )}
                    {cls.bonusDex > 0 && (
                      <View style={styles.classStatChip}>
                        <Text style={[styles.classStatVal, { color: COLORS.green }]}>+{cls.bonusDex}</Text>
                        <Text style={styles.classStatKey}>DEX</Text>
                      </View>
                    )}
                    <View style={styles.classStatChip}>
                      <Text style={[styles.classStatVal, { color: COLORS.manaBar }]}>{cls.baseMana}</Text>
                      <Text style={styles.classStatKey}>BASE MP</Text>
                    </View>
                    <View style={styles.classStatChip}>
                      <Text style={[styles.classStatVal, { color: COLORS.manaBar }]}>+{cls.manaPerLevel}/lvl</Text>
                      <Text style={styles.classStatKey}>MP/LVL</Text>
                    </View>
                    {cls.spellPowerPerFloor > 0 && (
                      <View style={styles.classStatChip}>
                        <Text style={[styles.classStatVal, { color: cls.color }]}>+{cls.spellPowerPerFloor}/fl</Text>
                        <Text style={styles.classStatKey}>SPELL PWR</Text>
                      </View>
                    )}
                  </View>

                  {/* Skills list */}
                  <View style={styles.classSkillList}>
                    {skills.map(sk => (
                      <View key={sk.id} style={styles.classSkillRow}>
                        <View style={[styles.classSkillLvl, { borderColor: cls.color + '44' }]}>
                          <Text style={[styles.classSkillLvlText, { color: cls.color + 'bb' }]}>
                            {sk.levelRequired === 0 ? '—' : sk.levelRequired}
                          </Text>
                        </View>
                        <View style={{ flex: 1, gap: 1 }}>
                          <Text style={[styles.classSkillName, { color: cls.color }]}>{sk.name}</Text>
                          <Text style={styles.classSkillDesc}>{sk.description}</Text>
                        </View>
                        {sk.manaCost > 0 && (
                          <Text style={styles.classSkillMana}>{sk.manaCost}mp</Text>
                        )}
                        {sk.manaCost === 0 && sk.levelRequired > 0 && (
                          <Text style={styles.classSkillFree}>FREE</Text>
                        )}
                      </View>
                    ))}
                  </View>
                </View>
              )
            })}

            <NoteCard title="CLASS SWITCHING">
              <Text style={styles.noteBody}>
                You can pick a different class each run. Your level and XP always carry over.
                {'\n\n'}Switching class changes your <Text style={styles.inlineEm}>base HP, mana, and available skills</Text> — but your level bonuses (+5 HP/level, +1 damage/level) are universal.
                {'\n\n'}Existing equipped items stay equipped. A high-level Warrior who switches to Sorcerer will have good HP/damage stats plus full mana scaling.
              </Text>
            </NoteCard>
          </>
        )}

        {/* ── SKILLS tab ── */}
        {tab === 'skills' && (
          <>
            <Text style={styles.sectionNote}>
              Skills unlock permanently as you level up. Each replaces your attack for that round. Grouped by class below.
            </Text>

            {CLASSES.map(cls => {
              const classSkills = SKILLS.filter(s => s.classId === cls.id)
              return (
                <React.Fragment key={cls.id}>
                  <SectionHeader>
                    <Text style={{ color: cls.color }}>{cls.name.toUpperCase()}</Text>
                    {' SKILLS'}
                  </SectionHeader>
                  {classSkills.map(sk => {
                    const detail = SKILL_DETAIL[sk.id]
                    return (
                      <View key={sk.id} style={[styles.skillCard, { borderLeftColor: cls.color }]}>
                        <View style={styles.skillHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.skillName, { color: cls.color }]}>{sk.name.toUpperCase()}</Text>
                            <Text style={styles.skillUnlock}>Unlocks at Level {sk.levelRequired}</Text>
                          </View>
                          <View style={styles.manaBadge}>
                            <Text style={styles.manaNum}>{sk.manaCost === 0 ? 'FREE' : `${sk.manaCost}`}</Text>
                            {sk.manaCost > 0 && <Text style={styles.manaLabel}>MP</Text>}
                          </View>
                        </View>
                        {detail && (
                          <>
                            <Text style={styles.skillEffect}>{detail.effect}</Text>
                            <Text style={styles.skillDetail}>{detail.detail}</Text>
                            <View style={styles.pillRow}>
                              <Text style={styles.pillLabel}>TIP</Text>
                              <Text style={styles.pillText}>{detail.tip}</Text>
                            </View>
                          </>
                        )}
                      </View>
                    )
                  })}
                </React.Fragment>
              )
            })}

            <NoteCard title="MANA SYSTEM">
              <Text style={styles.noteBody}>
                Mana scales by class — each has different base and per-level values:{'\n\n'}
                <Text style={{ color: COLORS.red }}>Warrior</Text>  20 base · +4/lvl (low mana, few skills){'\n'}
                <Text style={{ color: COLORS.green }}>Rogue</Text>     35 base · +6/lvl (moderate){'\n'}
                <Text style={{ color: COLORS.blue }}>Sorcerer</Text>  60 base · +6/lvl (high base, same scaling as Rogue)
                {'\n\n'}Mana <Text style={styles.inlineEm}>persists across floors</Text> — not reset between fights. Manage it as a run-wide resource.
                {'\n\n'}<Text style={{ color: COLORS.manaBar }}>Mana restoration:</Text>
                {'\n'}· +10 mana at each floor transition
                {'\n'}· +15 mana on tier clear
                {'\n'}· Mana Vials (bag item): +40 mana on use during combat
              </Text>
            </NoteCard>

            <NoteCard title="STATUS EFFECT DURATION">
              <Text style={styles.noteBody}>
                Battle Cry, Iron Skin, Smoke Bomb, and Mana Shield each last <Text style={{ color: COLORS.gold }}>2 rounds</Text> after being cast — and they protect on the cast round itself too.
                {'\n\n'}The HUD shows active status chips with remaining round counts. Re-casting before expiry resets the counter to 2.
              </Text>
            </NoteCard>
          </>
        )}

        {/* ── ITEMS tab ── */}
        {tab === 'items' && (
          <>
            <Text style={styles.sectionNote}>
              Items appear as "Unidentified [Slot]" on the loot screen. Picking them up instantly identifies them.
            </Text>

            {ITEM_TIERS.map(tier => (
              <View key={tier.name} style={[styles.tierCard, { borderLeftColor: tier.color }]}>
                <View style={styles.tierHeader}>
                  <Text style={[styles.tierName, { color: tier.color }]}>{tier.name.toUpperCase()}</Text>
                  <Text style={[styles.tierAffixes, { color: tier.color }]}>{tier.affixes}</Text>
                </View>
                <Text style={styles.tierDesc}>{tier.description}</Text>
                <Text style={styles.tierHook}>{tier.hook}</Text>
                <View style={styles.pillRow}>
                  <Text style={styles.pillLabel}>IDENTIFY</Text>
                  <Text style={styles.pillText}>{tier.identify}</Text>
                </View>
              </View>
            ))}

            <NoteCard title="HOW TO MAKE A RUNEWORD">
              <Text style={styles.noteBody}>
                1. Find a <Text style={{ color: COLORS.textPrimary }}>Normal-quality</Text> base item with the exact socket count the runeword requires.{'\n'}
                2. Insert the runes in the <Text style={{ color: COLORS.runewordColor }}>exact specified order</Text> — wrong order = no runeword.{'\n'}
                3. Magic, Rare, or Unique bases <Text style={{ color: COLORS.red }}>cannot be used</Text> — Normal only.{'\n'}
                4. Runeword stats replace the item's existing stats entirely.{'\n\n'}
                <Text style={{ color: COLORS.runewordColor }}>White item hunting tip:</Text> Hold any Normal base with the right socket count. Runes are the bottleneck, not the base.
              </Text>
            </NoteCard>

            <NoteCard title="MAGIC FIND">
              <Text style={styles.noteBody}>
                Magic Find (MF) shifts quality rolls upward. Formula applied to every loot drop:{'\n\n'}
                Rare weight × (1 + MF/100){'\n'}
                Unique weight × (1 + MF/100){'\n\n'}
                100 MF doubles your Rare/Unique drop rates. Sources:{'\n'}
                · MF stat on equipped items{'\n'}
                · Tier bonus: (tier−1) × 20 MF added automatically{'\n'}
                · Fox's Jewel unique amulet: +25 MF{'\n\n'}
                MF only affects quality — it does not change how many items drop.
              </Text>
            </NoteCard>

            <NoteCard title="SOCKETS & RUNES">
              <Text style={styles.noteBody}>
                Sockets only appear on Normal-quality items. Roll range per base varies (daggers: 1–2, armor: 2–4, staves: 3–6).{'\n\n'}
                Rune drops are always identified. Higher floors unlock higher-tier runes — low-tier runes are always more common even on deep floors (weighted toward index 0).{'\n\n'}
                Rune drop chances per encounter: 5% Normal · 15% Elite · 25% Rare · 38% Chest · 40% Ancient.
              </Text>
            </NoteCard>
          </>
        )}

        {/* ── CRAFTING (CUBE) tab ── */}
        {tab === 'crafting' && (
          <>
            <Text style={styles.sectionNote}>
              Place items in the Horadric Cube and transmute to combine them. Inputs are consumed — results are not guaranteed to be better than what you put in.
            </Text>
            {RECIPES.map((recipe: RecipeDef) => (
              <View key={recipe.id} style={styles.recipeCard}>
                <Text style={styles.recipeName}>{recipe.name.toUpperCase()}</Text>
                <Text style={styles.recipeDesc}>{recipe.description}</Text>
                <View style={styles.recipeInputRow}>
                  <Text style={styles.recipeLabel}>INPUT</Text>
                  <Text style={styles.recipeInput}>
                    {recipe.inputs.map(inp => {
                      if (inp.type === 'rune')    return `${inp.count}× rune (${inp.runeId})`
                      if (inp.type === 'quality') return `${inp.count}× ${inp.quality}${inp.slot ? ` ${inp.slot}` : ''}`
                      if (inp.type === 'potion')  return `${inp.count}× ${inp.potionId.replace(/_/g, ' ')}`
                      if (inp.type === 'gem')     return `${inp.count}× gem (${inp.gemId})`
                      return `${inp.count}× any`
                    }).join('  +  ')}
                  </Text>
                </View>
              </View>
            ))}
            <NoteCard title="TIPS">
              <Text style={styles.noteBody}>
                · Rune Fusion requires 3 <Text style={styles.inlineEm}>identical</Text> runes — mix of tiers won't work.{'\n'}
                · Soul Forge only has a 30% chance to yield a unique — you may get a rare instead.{'\n'}
                · Gem Polish: Chipped → Flawed → Perfect. Perfect gems yield the highest socket bonuses.{'\n'}
                · Infuse re-rolls stats as if you found the item 3 floors deeper — useful for weak magic items late in a run.
              </Text>
            </NoteCard>
          </>
        )}

        {/* ── RUN tab ── */}
        {tab === 'run' && (
          <>
            <Text style={styles.sectionNote}>
              Everything about persistent progression, tiers, and what happens when you die.
            </Text>

            <SectionHeader>LEVEL & XP</SectionHeader>
            <NoteCard>
              <Text style={styles.noteBody}>
                Level persists <Text style={{ color: COLORS.gold }}>forever</Text> — death does not reduce it.
                {'\n\n'}<Text style={styles.inlineEm}>Bonuses per level:</Text>
                {'\n'}· +5 max HP
                {'\n'}· +1 damage (both min and max)
                {'\n'}· +1 defense
                {'\n'}· Every 5 levels: +2% crit chance
                {'\n\n'}Max mana scales per class (see CLASSES tab). Mana persists across floors.
              </Text>
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                  <Text style={[styles.tableCell, styles.tableCellHdr]}>LVL</Text>
                  <Text style={[styles.tableCell, styles.tableCellHdr]}>XP needed</Text>
                  <Text style={[styles.tableCell, styles.tableCellHdr]}>Total XP</Text>
                  <Text style={[styles.tableCell, styles.tableCellHdr, { color: COLORS.manaBar }]}>+HP</Text>
                </View>
                {XP_ROWS.map(row => (
                  <View key={row.lvl} style={styles.tableRow}>
                    <Text style={[styles.tableCell, { color: COLORS.textSecondary }]}>{row.lvl}</Text>
                    <Text style={[styles.tableCell, { color: COLORS.textDim }]}>{row.needed}</Text>
                    <Text style={[styles.tableCell, { color: COLORS.textDim }]}>{row.totalXp}</Text>
                    <Text style={[styles.tableCell, { color: COLORS.green }]}>+{row.hpBonus}</Text>
                  </View>
                ))}
              </View>
            </NoteCard>

            <SectionHeader>DIFFICULTY TIERS</SectionHeader>
            <NoteCard>
              <Text style={styles.noteBody}>
                Clear floor 10 to advance to the next tier. Tier persists across deaths. No tier ceiling.
                {'\n\n'}A gold <Text style={{ color: COLORS.gold }}>TIER CLEAR</Text> overlay appears before you descend, showing the new scaling.
              </Text>
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                  <Text style={[styles.tableCell, styles.tableCellHdr]}>Tier</Text>
                  <Text style={[styles.tableCell, styles.tableCellHdr, { color: COLORS.red }]}>HP ×</Text>
                  <Text style={[styles.tableCell, styles.tableCellHdr, { color: COLORS.runewordColor }]}>DMG ×</Text>
                  <Text style={[styles.tableCell, styles.tableCellHdr, { color: COLORS.gold }]}>MF+</Text>
                </View>
                {TIER_ROWS.map(row => (
                  <View key={row.tier} style={styles.tableRow}>
                    <Text style={[styles.tableCell, { color: COLORS.textSecondary }]}>T{row.tier}</Text>
                    <Text style={[styles.tableCell, { color: COLORS.red }]}>{row.hp}×</Text>
                    <Text style={[styles.tableCell, { color: COLORS.runewordColor }]}>{row.dmg}×</Text>
                    <Text style={[styles.tableCell, { color: COLORS.gold }]}>{row.mfBonus === 0 ? '—' : `+${row.mfBonus}`}</Text>
                  </View>
                ))}
              </View>
            </NoteCard>

            <SectionHeader>DEATH & SACRIFICE</SectionHeader>
            <NoteCard>
              <Text style={styles.noteBody}>
                When you die:
                {'\n\n'}✓ Equipped items survive (minus one sacrifice){'\n'}
                ✓ Level and XP survive{'\n'}
                ✓ Tier survives{'\n'}
                ✓ Shared stash is never touched{'\n'}
                ✗ Bag is wiped entirely{'\n'}
                ✗ One equipped item is sacrificed to the Graveyard{'\n'}
                ✗ Floor resets to 1{'\n'}
                ↺ Next run starts with 3 HP + 1 mana + 1 stamina potion
              </Text>
            </NoteCard>
            <NoteCard title="SACRIFICE PROBABILITY">
              <Text style={styles.noteBody}>
                The sacrificed item is drawn from your <Text style={styles.inlineEm}>equipped items only</Text> using quality weights:
                {'\n\n'}Normal: 1 point{'\n'}Magic: 5 points{'\n'}Rare: 20 points{'\n'}Unique: 40 points
                {'\n\n'}Example: weapon (Unique) + helmet (Normal) + chest (Rare) = 61 total points.{'\n'}
                Unique has 40/61 = <Text style={{ color: COLORS.red }}>65.6% chance of being sacrificed.</Text>
                {'\n\n'}Stash your best-in-slot gear in town before risky fights to remove it from the sacrifice pool.
              </Text>
            </NoteCard>

            <NoteCard title="THE GRAVEYARD">
              <Text style={styles.noteBody}>
                Every sacrificed item is permanently recorded in the Graveyard with:{'\n'}
                · Full identified stats{'\n'}
                · The floor and tier where it was lost{'\n'}
                · Your level at the time{'\n'}
                · The date{'\n\n'}
                Accessible from the main menu at any time. Items in the Graveyard cannot be recovered.
              </Text>
            </NoteCard>

            <NoteCard title="WHAT RESETS ON DEATH">
              <Text style={styles.noteBody}>
                <Text style={{ color: COLORS.red }}>Resets:</Text> Floor, current HP, bag items, potions (3 fresh){'\n'}
                <Text style={{ color: COLORS.hpHigh }}>Kept:</Text> Equipped items (minus sacrifice), level, XP, mana, tier, stash, graveyard
              </Text>
            </NoteCard>
          </>
        )}

      </ScrollView>
    </View>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionHeader}>{children}</Text>
}

function NoteCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.noteCard}>
      {title && <Text style={styles.noteTitle}>{title}</Text>}
      {children}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 60 },
  backText: { color: COLORS.textSecondary, fontSize: 11, letterSpacing: 1 },
  title: { color: COLORS.gold, fontSize: 13, fontWeight: '800', letterSpacing: 4 },

  // Tab bar (horizontal scroll)
  tabBar: { maxHeight: 44, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabBarContent: { paddingHorizontal: 8, gap: 0 },
  tab: { paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.gold },
  tabText: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, fontWeight: '600' },
  tabTextActive: { color: COLORS.gold },

  scroll: { flex: 1 },
  scrollContent: { padding: 14, gap: 8, paddingBottom: 40 },

  sectionNote: { color: COLORS.textDim, fontSize: 11, lineHeight: 17, marginBottom: 2 },
  sectionHeader: {
    color: COLORS.textDim, fontSize: 9, letterSpacing: 3, fontWeight: '700',
    marginTop: 8, marginBottom: 2,
  },
  inlineLabel: { color: COLORS.textSecondary, fontWeight: '700' } as const,
  inlineEm:    { color: COLORS.textSecondary },

  // Encounter cards
  encCard: {
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, padding: 12, gap: 5,
  },
  encHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  encTile: {
    width: 26, height: 26, borderWidth: 0.5, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center', borderRadius: 3, flexShrink: 0,
  },
  encGlyph: { fontSize: 12, fontWeight: '700', includeFontPadding: false },
  encName: { fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  encFloorNote: { color: COLORS.textDim, fontSize: 9, letterSpacing: 0.5 },
  encPctBox: { alignItems: 'flex-end' },
  encPct: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '700' },
  encPctLabel: { color: COLORS.textDim, fontSize: 8, letterSpacing: 1 },
  encDesc: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16 },

  // Pill row (DROPS / COUNTER / TIP / IDENTIFY labels)
  pillRow: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  pillLabel: {
    color: COLORS.textDim, fontSize: 8, letterSpacing: 1.5, fontWeight: '700',
    backgroundColor: COLORS.surface, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 2,
    marginTop: 1,
  },
  pillText: { color: COLORS.green, fontSize: 10, flex: 1, lineHeight: 15 },

  // Tables
  noteCard: {
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, padding: 12, gap: 6,
  },
  noteTitle: { color: COLORS.textDim, fontSize: 9, letterSpacing: 2, fontWeight: '700' },
  noteBody: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 18 },
  table: { gap: 3, marginTop: 4 },
  tableHeader: { marginBottom: 2 },
  tableRow: { flexDirection: 'row', gap: 4 },
  tableCell: { flex: 1, fontSize: 10, textAlign: 'center' },
  tableCellHdr: { color: COLORS.textDim, fontWeight: '700', letterSpacing: 0.5 },

  // Affix cards
  affixCard: {
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, gap: 4,
  },
  affixName: { color: COLORS.runewordColor, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  affixDesc: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16 },

  // Item tier cards
  tierCard: {
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, gap: 4,
  },
  tierHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tierName: { fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  tierAffixes: { fontSize: 9, letterSpacing: 0.5, opacity: 0.7 },
  tierDesc: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16 },
  tierHook: { color: COLORS.green, fontSize: 10, fontStyle: 'italic', lineHeight: 15 },

  // Skill cards
  skillCard: {
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, gap: 5,
  },
  skillHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  skillName: { fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  skillUnlock: { color: COLORS.textDim, fontSize: 9, letterSpacing: 1, marginTop: 2 },
  manaBadge: {
    backgroundColor: COLORS.blueDim, borderWidth: 1, borderColor: COLORS.blue,
    borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center',
  },
  manaNum: { color: COLORS.manaBar, fontSize: 14, fontWeight: '700' },
  manaLabel: { color: COLORS.blue, fontSize: 7, letterSpacing: 1 },
  skillEffect: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  skillDetail: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 17 },

  // Bullet list
  bulletRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  bulletDot: { color: COLORS.textDim, fontSize: 14, lineHeight: 18 },
  bulletText: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 18, flex: 1 },

  // Class cards (CLASSES tab)
  classCard: {
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    borderLeftWidth: 3, borderRadius: 8, padding: 14, gap: 10,
  },
  classCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  classCardName: { fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  classTagBadge: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  classTagText: { fontSize: 8, fontWeight: '700', letterSpacing: 1.5 },
  classDesc: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16 },
  classStatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  classStatChip: {
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center', gap: 1,
  },
  classStatVal: { fontSize: 11, fontWeight: '700' },
  classStatKey: { color: COLORS.textDim, fontSize: 7, letterSpacing: 1 },
  classSkillList: { gap: 6, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8 },
  classSkillRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  classSkillLvl: {
    width: 24, height: 24, borderRadius: 4, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  classSkillLvlText: { fontSize: 9, fontWeight: '700' },
  classSkillName: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  classSkillDesc: { color: COLORS.textDim, fontSize: 10, lineHeight: 14 },
  classSkillMana: { color: COLORS.blue, fontSize: 9, marginTop: 2 },
  classSkillFree: { color: COLORS.green, fontSize: 8, fontWeight: '700', letterSpacing: 0.5, marginTop: 3, opacity: 0.6 },

  // Recipe cards (CUBE tab)
  recipeCard: {
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    borderLeftWidth: 3, borderLeftColor: COLORS.runewordColor,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, gap: 5,
  },
  recipeName: { color: COLORS.runewordColor, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  recipeDesc: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16 },
  recipeInputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 2 },
  recipeLabel: {
    color: COLORS.textDim, fontSize: 8, letterSpacing: 1.5, fontWeight: '700',
    backgroundColor: COLORS.surface, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 2, marginTop: 1,
  },
  recipeInput: { color: COLORS.textDim, fontSize: 10, lineHeight: 15, flex: 1 },
})
