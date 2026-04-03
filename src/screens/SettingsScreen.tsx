import React from 'react'
import { View, Text, TouchableOpacity, Switch, StyleSheet, ScrollView, Alert, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Constants from 'expo-constants'
import { useSettingsStore } from '../store/settingsStore'
import { clearSave } from '../services/persistence'
import { useGameStore } from '../store/gameStore'
import { useInventoryStore } from '../store/inventoryStore'
import { createInventory } from '../engine/inventory'
import { COLORS } from '../theme'

interface Props {
  onBack: () => void
}

export function SettingsScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets()
  const { hapticsEnabled, audioEnabled, setHaptics, setAudio } = useSettingsStore()

  function handleResetProgress() {
    Alert.alert(
      'Reset All Progress',
      'This will delete your XP, tier, graveyard, and stash. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await clearSave()
            useGameStore.setState({
              xp: 0, level: 0, tier: 1, floor: 1,
              mana: 40, maxMana: 40,
              graveyard: [], lastSacrifice: null,
              sharedStash: [], classId: null,
              classXp: {}, equippedByClass: {},
              runStarted: false, screen: 'classSelect',
            })
            useInventoryStore.setState({ equipped: {}, bag: createInventory(), magicFind: 0 })
            onBack()
          },
        },
      ],
    )
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + 10 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>SETTINGS</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Feedback */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>FEEDBACK</Text>

        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowLabel}>Haptic Feedback</Text>
            <Text style={styles.rowSub}>Vibration on hits, crits, and level ups</Text>
          </View>
          <Switch
            value={hapticsEnabled}
            onValueChange={setHaptics}
            trackColor={{ true: COLORS.gold, false: COLORS.border2 }}
            thumbColor={hapticsEnabled ? COLORS.gold : COLORS.textSecondary}
          />
        </View>

        <View style={[styles.row, styles.rowDisabled]}>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowLabel, styles.rowLabelDisabled]}>Audio</Text>
            <Text style={styles.rowSub}>Sound effects — coming soon</Text>
          </View>
          <Switch
            value={false}
            disabled={true}
            trackColor={{ true: COLORS.border2, false: COLORS.border2 }}
            thumbColor={COLORS.textDim}
          />
        </View>
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ABOUT</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Version</Text>
          <Text style={styles.infoValue}>{Constants.expoConfig?.version ?? '—'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Build</Text>
          <Text style={styles.infoValue}>{Constants.expoConfig?.name ?? 'Dungeon Depths'}</Text>
        </View>
        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => Linking.openURL('https://majeanson.github.io/d2game-privacy')}
        >
          <Text style={styles.infoLabel}>Privacy Policy</Text>
          <Text style={[styles.infoValue, styles.linkText]}>View →</Text>
        </TouchableOpacity>
      </View>

      {/* Danger zone */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: COLORS.red }]}>DANGER</Text>
        <TouchableOpacity style={styles.dangerBtn} onPress={handleResetProgress}>
          <Text style={styles.dangerText}>RESET ALL PROGRESS</Text>
          <Text style={styles.dangerSub}>Deletes save data permanently</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    paddingVertical: 8,
    paddingRight: 16,
    width: 60,
  },
  backText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    letterSpacing: 1,
  },
  title: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 6,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: COLORS.textDim,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowInfo: {
    flex: 1,
    gap: 3,
  },
  rowLabel: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  rowSub: {
    color: COLORS.textDim,
    fontSize: 10,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowLabelDisabled: {
    color: COLORS.textDim,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  infoValue: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  linkText: {
    color: COLORS.blue,
  },
  dangerBtn: {
    backgroundColor: COLORS.redDim,
    borderWidth: 1,
    borderColor: COLORS.redDim,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  dangerText: {
    color: COLORS.red,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  dangerSub: {
    color: COLORS.textDim,
    fontSize: 10,
  },
})
