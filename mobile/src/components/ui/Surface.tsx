import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, memo } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { useColors } from '@/theme';

export type SurfaceTone =
  /** Floats above the page: dock, mini player, sheets, toasts. Raised, with a soft top light and a shadow. */
  | 'overlay'
  /** Sits in the page: fields, cards. */
  | 'inline'
  /** Full-width bars that content scrolls under (top bar). Near-opaque page colour. */
  | 'bar'
  /** Over artwork: a dark see-through wash with a light edge, for white text. */
  | 'scrim';

export interface SurfaceProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  tone?: SurfaceTone;
  /** Extra colour wash (e.g. the album's colour on the mini player). */
  tint?: string;
  /** Hairline edge (on by default, except bars). */
  border?: boolean;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}

/**
 * Aura's chrome surface: solid layered colour from the theme, a hairline edge
 * and, for floating surfaces, a faint light along the top and a soft shadow.
 * No blur — it looks the same on every phone and costs nothing to draw.
 * Motion comes from the components that use it (springs, fades), not from here.
 */
export const Surface = memo(function Surface({ children, style, radius = 28, tone = 'overlay', tint, border, pointerEvents }: SurfaceProps) {
  const colors = useColors();
  const bg = tone === 'overlay' ? colors.chrome : tone === 'bar' ? colors.bar : tone === 'scrim' ? colors.scrimSurface : colors.surface;
  const edge = border ?? tone !== 'bar';
  return (
    <View
      pointerEvents={pointerEvents}
      style={[
        { borderRadius: radius, overflow: 'hidden', backgroundColor: bg },
        edge && { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: tone === 'scrim' ? 'rgba(255,255,255,0.18)' : colors.chromeBorder },
        tone === 'overlay' && styles.lift,
        style,
      ]}
    >
      {tint ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} /> : null}
      {tone === 'overlay' ? (
        <LinearGradient pointerEvents="none" colors={[colors.chromeSheen, 'transparent']} locations={[0, 0.55]} style={StyleSheet.absoluteFill} />
      ) : null}
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  lift: {
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
});
