import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * One source of truth for where the floating chrome sits, so the dock and
 * the player's mini state line up perfectly while they animate.
 *
 *  expanded dock:        collapsed dock (scrolling down):
 *  ┌───────────────┐
 *  │  mini player  │
 *  └───────────────┘
 *  ┌──────────┐ ┌─┐      ┌─┐ ┌───────────────┐
 *  │ tab pill │ │⌕│      │●│ │  mini player  │
 *  └──────────┘ └─┘      └─┘ └───────────────┘
 */
export function useDockGeometry() {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return useMemo(() => {
    const M = 12;
    const TAB_H = 62;
    const MINI_H = 60;
    const GAP = 8;
    const tabY = H - Math.max(insets.bottom, 8) - 10 - TAB_H;
    const miniY = tabY - GAP - MINI_H;
    const circle = TAB_H;
    const pillW = W - M * 2 - circle - GAP;
    return {
      W,
      H,
      insets,
      M,
      TAB_H,
      MINI_H,
      GAP,
      tabY,
      miniY,
      circle,
      pillW,
      /** Collapsed mini player sits beside the shrunken tab circle, vertically centred in the tab row. */
      miniYCollapsed: tabY + (TAB_H - MINI_H) / 2,
      miniXCollapsed: M + circle + GAP,
      /** How much bottom padding scroll views need so content clears the dock. */
      contentInset: H - miniY + 16,
    };
  }, [W, H, insets]);
}

export type DockGeometry = ReturnType<typeof useDockGeometry>;
