import { makeMutable, withTiming } from 'react-native-reanimated';
import { useSettings } from '@/settings/store';

export * from './glassMaterial';

/**
 * The glass material dial as a UI-thread shared value, so every glass surface
 * re-tints at 60/120 fps while the slider is dragged, without React re-renders.
 * The persisted setting (useSettings.glass) is the source of truth.
 */
export const glassLevel = makeMutable(0);

let dragging = false;
/** While the slider owns glassLevel, store updates must not animate it back. */
export const setGlassDragging = (v: boolean) => {
  dragging = v;
};

/** Mirror the persisted setting into the shared value (call once, after settings hydrate). */
export function startGlassSync(): () => void {
  glassLevel.value = useSettings.getState().glass;
  return useSettings.subscribe((s, prev) => {
    if (s.glass !== prev.glass && !dragging) glassLevel.value = withTiming(s.glass, { duration: 280 });
  });
}
