import * as Haptics from 'expo-haptics';
import { useSettings } from '@/settings/store';

const on = () => useSettings.getState().haptics;

/** Small, purposeful haptics. Never on scroll, never on every tap. */
export const haptic = {
  tap: () => on() && Haptics.selectionAsync().catch(() => undefined),
  soft: () => on() && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => undefined),
  medium: () => on() && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined),
  success: () => on() && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined),
  error: () => on() && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined),
};
