import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, memo } from 'react';
import { Platform, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useBlurTarget } from '@/lib/chrome';
import { BLUR_OFF_AT, glassLevel, lens, material } from '@/lib/glass';
import { usePlayerUi } from '@/player/ui';
import { useSettings } from '@/settings/store';
import { useColors } from '@/theme';
import { LiquidGlassNativeView } from '../../../modules/aura-liquid-glass';

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
  /** Minimum material opacity, for text-heavy surfaces (sheets, toasts) that must stay legible. */
  minTint?: number;
}

/**
 * Liquid-glass surface, modelled on liquid-glass-js's layer stack:
 *   blur → material tint → bottom refraction glow → top sheen → edge rim + lip.
 *
 * The material is continuous (Settings → Glass): every layer's strength comes
 * from `material(level)`, read on the UI thread from the `glassLevel` shared
 * value, so dragging the slider re-tints every surface live with no re-renders.
 * The blur itself only remounts when the setting is committed.
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
  minTint = 0,
}: GlassProps) {
  const colors = useColors();
  const target = useBlurTarget();
  // Quantised so tiny slider moves don't re-render every glass surface.
  const level = useSettings((s) => Math.round(s.glass * 20) / 20);
  // The full-screen player lives outside the blur target, so an overlay opened on top of it
  // (sheet, toast) would blur the page *behind* the player. Use a frosted fill instead.
  const playerOpen = usePlayerUi((s) => s.isOpen);
  const android = Platform.OS === 'android';
  const canBlur = !android || (variant === 'overlay' && !!target && !playerOpen);
  // Android 12+: our GPU lens (blur → AGSL refraction/dispersion/specular on 13+) over the
  // same recorded page content expo-blur uses. Otherwise expo-blur, else a frosted fill.
  const nativeLens = android && !!LiquidGlassNativeView && canBlur && level < BLUR_OFF_AT;
  const realBlur = canBlur && level < BLUR_OFF_AT;
  const optics = nativeLens ? lens(level, intensity) : null;
  const dark = colors.scheme === 'dark';

  const tintStyle = useAnimatedStyle(() => ({ opacity: Math.max(minTint, material(glassLevel.value, realBlur, nativeLens).tint) }));
  const sheenStyle = useAnimatedStyle(() => ({ opacity: material(glassLevel.value, realBlur, nativeLens).sheen }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: material(glassLevel.value, realBlur, nativeLens).glow }));
  const rimStyle = useAnimatedStyle(() => ({ opacity: material(glassLevel.value, realBlur, nativeLens).rim }));
  const lipStyle = useAnimatedStyle(() => ({ opacity: material(glassLevel.value, realBlur, nativeLens).lip }));

  return (
    <View pointerEvents={pointerEvents} style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
      {nativeLens && LiquidGlassNativeView && optics ? (
        <LiquidGlassNativeView
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          cornerRadius={radius}
          blur={optics.blur}
          refraction={optics.refraction}
          dispersion={optics.dispersion}
          specular={optics.specular}
        />
      ) : realBlur ? (
        <BlurView
          style={StyleSheet.absoluteFill}
          intensity={Math.min(100, Math.round(intensity * material(level, true).blur))}
          tint={colors.blurTint}
          blurMethod={android ? 'dimezisBlurViewSdk31Plus' : 'none'}
          blurReductionFactor={android ? 3 : undefined}
          blurTarget={android ? target : undefined}
        />
      ) : null}
      {/* material: solid colour whose opacity sweeps liquid → frosted → opaque */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassBase }, tintStyle]} />
      {tint ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} /> : null}
      {rim ? (
        <>
          {/* light bouncing off the lower edge: the "liquid" look, gone by frosted */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, glowStyle]}>
            <LinearGradient
              colors={dark ? ['rgba(255,255,255,0)', 'rgba(255,255,255,0.07)'] : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)']}
              locations={[0.55, 1]}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          {/* top specular sheen */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, sheenStyle]}>
            <LinearGradient
              colors={dark ? ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.025)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.6)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']}
              locations={[0, 0.35, 0.7]}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          {/* edge rim + bright lip along the top edge */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.rim, { borderRadius: radius, borderColor: colors.glassBorder }, rimStyle]} />
          <Animated.View pointerEvents="none" style={[styles.lip, { left: radius * 0.55, right: radius * 0.55 }, lipStyle]}>
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
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
