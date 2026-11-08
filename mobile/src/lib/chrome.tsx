import { type ComponentRef, createContext, type ReactNode, type RefObject, useContext, useMemo, useRef } from 'react';
import type { View } from 'react-native';
import { type SharedValue, makeMutable, withSpring } from 'react-native-reanimated';
import { spring } from '@/theme';

/**
 * Shared "chrome" state for the floating glass UI:
 *  - blurTarget: on Android, BlurView needs a ref to the content it blurs.
 *  - dockCollapsed: 0 = full dock, 1 = minimized (scrolling down), like iOS 26.
 *  - playerProgress: 0 = mini player, 1 = full-screen player.
 */
interface ChromeCtx {
  blurTarget: RefObject<ComponentRef<typeof View> | null>;
}

const Ctx = createContext<ChromeCtx | null>(null);

export const chrome = {
  dockCollapsed: makeMutable(0),
  playerProgress: makeMutable(0),
  /** 0 = artwork, 1 = lyrics/queue (artwork shrinks to the header). */
  playerPanel: makeMutable(0),
};

export function ChromeProvider({ children }: { children: ReactNode }) {
  const blurTarget = useRef<ComponentRef<typeof View> | null>(null);
  const value = useMemo(() => ({ blurTarget }), []);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBlurTarget() {
  return useContext(Ctx)?.blurTarget;
}

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
