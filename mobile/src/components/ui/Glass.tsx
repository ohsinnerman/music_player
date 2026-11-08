import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, memo } from 'react';
import { Platform, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { useBlurTarget } from '@/lib/chrome';
import { usePlayerUi } from '@/player/ui';
import { useSettings } from '@/settings/store';
import { useColors } from '@/theme';

export interface GlassProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  intensity?: number;
  /** Extra colour wash over the blur (e.g. album colour). */
  tint?: string;
  /**
   * 'overlay' = floats above page content (dock, sheets, toasts): real blur on Android too.
   * 'inline'  = lives inside scrolling content (sticky headers): blur on iOS, frosted fill on Android.
   */
  variant?: 'overlay' | 'inline';
  /** Show the specular rim + top highlight. */
  rim?: boolean;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}

/**
 * Liquid-glass surface, modelled on liquid-glass-js's layer stack:
 *   blur (base) → tint → edge rim (bright at the top, fading down) → top specular sheen.
 * Kept cheap: one native blur, two gradients, no per-frame work.
 */
export const Glass = memo(function Glass({
  children,
  style,
  radius = 28,
  intensity = 40,
  tint,
  variant = 'overlay',
  rim = true,
  pointerEvents,
}: GlassProps) {
  const colors = useColors();
  const target = useBlurTarget();
  const reduce = useSettings((s) => s.reduceTransparency);
  // The full-screen player lives outside the blur target, so an overlay opened on top of it
  // (sheet, toast) would blur the page *behind* the player. Use a frosted fill instead.
  const playerOpen = usePlayerUi((s) => s.isOpen);
  const android = Platform.OS === 'android';
  const realBlur = !reduce && (!android || (variant === 'overlay' && !!target && !playerOpen));
  const frosted = colors.scheme === 'dark' ? 'rgba(24,24,30,0.9)' : 'rgba(250,250,252,0.92)';

  return (
    <View pointerEvents={pointerEvents} style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
      {realBlur ? (
        <BlurView
          style={StyleSheet.absoluteFill}
          intensity={intensity}
          tint={colors.blurTint}
          blurMethod={android ? 'dimezisBlurViewSdk31Plus' : 'none'}
          blurReductionFactor={android ? 3 : undefined}
          blurTarget={android ? target : undefined}
        />
      ) : null}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: realBlur ? colors.glassTint : reduce ? colors.glassTintSolid : frosted },
        ]}
      />
      {tint ? <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} /> : null}
      {rim ? (
        <>
          {/* top specular sheen */}
          <LinearGradient
            pointerEvents="none"
            colors={colors.scheme === 'dark' ? ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']}
            locations={[0, 0.35, 0.7]}
            style={StyleSheet.absoluteFill}
          />
          {/* edge rim: brighter top edge fading to a faint bottom edge */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.rim, { borderRadius: radius, borderColor: colors.glassBorder }]} />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.42)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.lip, { left: radius * 0.55, right: radius * 0.55 }]}
          />
        </>
      ) : null}
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  rim: {
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  lip: {
    position: 'absolute',
    top: 0,
    height: 1,
  },
});
