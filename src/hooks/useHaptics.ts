/**
 * Haptic feedback hook — all calls gated by settingsStore.hapticsEnabled.
 * Uses expo-haptics (bundled in Expo SDK, no install needed).
 */

import * as Haptics from 'expo-haptics'
import type { useSettingsStore as SettingsStoreType } from '../store/settingsStore'

// Lazy accessor — avoids circular import; settings may not be initialized yet
function getSettingsStore(): typeof SettingsStoreType {
  return (require('../store/settingsStore') as { useSettingsStore: typeof SettingsStoreType }).useSettingsStore
}

function isHapticsEnabled(): boolean {
  try {
    return getSettingsStore().getState().hapticsEnabled
  } catch {
    return true  // default on if settings not yet initialized
  }
}

export function useHaptics() {
  return {
    impactLight: () => {
      if (!isHapticsEnabled()) return
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    },
    impactMedium: () => {
      if (!isHapticsEnabled()) return
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    },
    impactHeavy: () => {
      if (!isHapticsEnabled()) return
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {})
    },
    notificationSuccess: () => {
      if (!isHapticsEnabled()) return
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    },
    notificationError: () => {
      if (!isHapticsEnabled()) return
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
    },
    notificationWarning: () => {
      if (!isHapticsEnabled()) return
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
    },
  }
}
