import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { glassLevel, material } from '@/lib/glass';
import { useColors } from '@/theme';

const H = 176;

/** Web fallback for the Skia preview: CSS backdrop blur, same material curve. */
export const GlassPreview = memo(function GlassPreview() {
  const colors = useColors();
  const dark = colors.scheme === 'dark';
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: -60 + t.value * 120 }, { translateY: -10 + t.value * 20 }] }));
  const b = useAnimatedStyle(() => ({ transform: [{ translateX: 50 - t.value * 100 }] }));
  const tint = useAnimatedStyle(() => ({ opacity: material(glassLevel.value, true).tint }));
  const sheen = useAnimatedStyle(() => ({ opacity: material(glassLevel.value, true).sheen }));
  const rim = useAnimatedStyle(() => ({ opacity: material(glassLevel.value, true).rim }));
  return (
    <View style={[styles.wrap, { backgroundColor: dark ? '#0E0E14' : '#EEF0F6' }]}>
      {Array.from({ length: 18 }).map((_, i) => (
        <View key={i} style={[styles.stripe, { left: i * 28 - 40, backgroundColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(10,10,30,0.08)' }]} />
      ))}
      <Animated.View style={[styles.blob, { backgroundColor: '#FF5A36', left: '22%', top: 30 }, a]} />
      <Animated.View style={[styles.blob, { backgroundColor: '#2E7CF6', right: '20%', top: 70, width: 100, height: 100, borderRadius: 50 }, b]} />
      <View style={[styles.blob, { backgroundColor: '#F6D68A', left: '48%', top: 14, width: 52, height: 52, borderRadius: 26 }]} />
      <View style={styles.card}>
        <View style={[StyleSheet.absoluteFill, { borderRadius: 30, backdropFilter: 'blur(14px)' } as object]} />
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassBase, borderRadius: 30 }, tint]} />
        <Animated.View style={[StyleSheet.absoluteFill, sheen]}>
          <LinearGradient colors={dark ? ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']} locations={[0, 0.7]} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.rim, rim]} />
        <View style={styles.art} />
        <View style={{ gap: 10 }}>
          <View style={[styles.line, { width: 130, backgroundColor: colors.text }]} />
          <View style={[styles.line, { width: 84, height: 9, backgroundColor: colors.textSecondary }]} />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { height: H, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  stripe: { position: 'absolute', top: -40, bottom: -40, width: 9, borderRadius: 4.5, transform: [{ rotate: '-28deg' }] },
  blob: { position: 'absolute', width: 88, height: 88, borderRadius: 44 },
  card: { width: 300, maxWidth: '86%', height: 96, borderRadius: 30, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16 },
  rim: { borderRadius: 30, borderWidth: 1.2, borderColor: 'rgba(255,255,255,0.5)' },
  art: { width: 60, height: 60, borderRadius: 12, backgroundColor: '#FF2D6B' },
  line: { height: 11, borderRadius: 5.5 },
});
