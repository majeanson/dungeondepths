import { create } from 'zustand'
import { loadSettings, saveSettings } from '../services/persistence'

export interface SettingsState {
  hapticsEnabled:       boolean
  audioEnabled:         boolean
  onboardingDone:       boolean
  hasSeenFirstBoss:     boolean
  zoomLevel:            0 | 1 | 2
  hasSeenGhostEchoHint: boolean
  hasSeenCodexHint:     boolean
  loaded:               boolean

  setHaptics:               (on: boolean) => void
  setAudio:                 (on: boolean) => void
  setOnboardingDone:        () => void
  markFirstBossSeen:        () => void
  setZoomLevel:             (z: 0 | 1 | 2) => void
  markGhostEchoHintSeen:    () => void
  markCodexHintSeen:        () => void
  loadFromDisk:             () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  hapticsEnabled:       true,
  audioEnabled:         true,
  onboardingDone:       false,
  hasSeenFirstBoss:     false,
  zoomLevel:            1,
  hasSeenGhostEchoHint: false,
  hasSeenCodexHint:     false,
  loaded:               false,

  setHaptics: (on) => {
    set({ hapticsEnabled: on })
    const s = get()
    saveSettings({ hapticsEnabled: on, audioEnabled: s.audioEnabled, onboardingDone: s.onboardingDone, hasSeenFirstBoss: s.hasSeenFirstBoss, zoomLevel: s.zoomLevel, hasSeenGhostEchoHint: s.hasSeenGhostEchoHint, hasSeenCodexHint: s.hasSeenCodexHint })
  },

  setAudio: (on) => {
    set({ audioEnabled: on })
    const s = get()
    saveSettings({ hapticsEnabled: s.hapticsEnabled, audioEnabled: on, onboardingDone: s.onboardingDone, hasSeenFirstBoss: s.hasSeenFirstBoss, zoomLevel: s.zoomLevel, hasSeenGhostEchoHint: s.hasSeenGhostEchoHint, hasSeenCodexHint: s.hasSeenCodexHint })
  },

  setOnboardingDone: () => {
    set({ onboardingDone: true })
    const s = get()
    saveSettings({ hapticsEnabled: s.hapticsEnabled, audioEnabled: s.audioEnabled, onboardingDone: true, hasSeenFirstBoss: s.hasSeenFirstBoss, zoomLevel: s.zoomLevel, hasSeenGhostEchoHint: s.hasSeenGhostEchoHint, hasSeenCodexHint: s.hasSeenCodexHint })
  },

  markFirstBossSeen: () => {
    set({ hasSeenFirstBoss: true })
    const s = get()
    saveSettings({ hapticsEnabled: s.hapticsEnabled, audioEnabled: s.audioEnabled, onboardingDone: s.onboardingDone, hasSeenFirstBoss: true, zoomLevel: s.zoomLevel, hasSeenGhostEchoHint: s.hasSeenGhostEchoHint, hasSeenCodexHint: s.hasSeenCodexHint })
  },

  setZoomLevel: (z) => {
    set({ zoomLevel: z })
    const s = get()
    saveSettings({ hapticsEnabled: s.hapticsEnabled, audioEnabled: s.audioEnabled, onboardingDone: s.onboardingDone, hasSeenFirstBoss: s.hasSeenFirstBoss, zoomLevel: z, hasSeenGhostEchoHint: s.hasSeenGhostEchoHint, hasSeenCodexHint: s.hasSeenCodexHint })
  },

  markGhostEchoHintSeen: () => {
    set({ hasSeenGhostEchoHint: true })
    const s = get()
    saveSettings({ hapticsEnabled: s.hapticsEnabled, audioEnabled: s.audioEnabled, onboardingDone: s.onboardingDone, hasSeenFirstBoss: s.hasSeenFirstBoss, zoomLevel: s.zoomLevel, hasSeenGhostEchoHint: true, hasSeenCodexHint: s.hasSeenCodexHint })
  },

  markCodexHintSeen: () => {
    set({ hasSeenCodexHint: true })
    const s = get()
    saveSettings({ hapticsEnabled: s.hapticsEnabled, audioEnabled: s.audioEnabled, onboardingDone: s.onboardingDone, hasSeenFirstBoss: s.hasSeenFirstBoss, zoomLevel: s.zoomLevel, hasSeenGhostEchoHint: s.hasSeenGhostEchoHint, hasSeenCodexHint: true })
  },

  loadFromDisk: async () => {
    const data = await loadSettings()
    if (data) {
      set({
        hapticsEnabled:       data.hapticsEnabled,
        audioEnabled:         data.audioEnabled,
        onboardingDone:       data.onboardingDone       ?? false,
        hasSeenFirstBoss:     data.hasSeenFirstBoss     ?? false,
        zoomLevel:            data.zoomLevel             ?? 1,
        hasSeenGhostEchoHint: data.hasSeenGhostEchoHint ?? false,
        hasSeenCodexHint:     data.hasSeenCodexHint     ?? false,
      })
    }
    set({ loaded: true })
  },
}))
