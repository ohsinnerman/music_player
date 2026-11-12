import { type SharedValue, makeMutable, withSpring } from 'react-native-reanimated';
import { spring } from '@/theme';

/**
 * Shared UI-thread state for the floating chrome:
 *  - dockCollapsed: 0 = full dock, 1 = minimized (scrolling down).
 *  - playerProgress: 0 = mini player, 1 = full-screen player.
 */
export const chrome = {
  dockCollapsed: makeMutable(0),
  playerProgress: makeMutable(0),
  /** 0 = artwork, 1 = lyrics/queue (artwork shrinks to the header). */
  playerPanel: makeMutable(0),
};

/** Call from scroll handlers (worklet) to collapse/expand the dock based on direction. */
export function dockScrollWorklet(y: number, last: SharedValue<number>) {
  'worklet';
  const dy = y - last.value;
  last.value = y;
  if (y < 40) {
    if (chrome.dockCollapsed.value !== 0) chrome.dockCollapsed.value = withSpring(0, spring.smooth);
    return;
  }
  if (dy > 6 && chrome.dockCollapsed.value < 0.5) chrome.dockCollapsed.value = withSpring(1, spring.smooth);
  else if (dy < -10 && chrome.dockCollapsed.value > 0.5) chrome.dockCollapsed.value = withSpring(0, spring.smooth);
}
