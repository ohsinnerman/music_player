import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import type { Palette } from '@/lib/palette';

/** Web fallback for the Skia living background: CSS-blurred cover, slowly rotating. */
export const LivingBackground = memo(function LivingBackground({ uri, palette, animate }: { uri?: string; palette: Palette; animate: boolean }) {
  const r = useSharedValue(0);
  useEffect(() => {
    if (animate) r.value = withRepeat(withTiming(1, { duration: 60000, easing: Easing.linear }), -1, false);
  }, [animate, r]);
  const a = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value * 360}deg` }, { scale: 1.8 }] }));
  const b = useAnimatedStyle(() => ({ transform: [{ rotate: `${-r.value * 360 + 140}deg` }, { scale: 2.1 }] }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: palette.dark, overflow: 'hidden' }]}>
      <View style={[styles.blob, { backgroundColor: palette.vibrant, top: '-10%', left: '-20%' }]} />
      <View style={[styles.blob, { backgroundColor: palette.dominant, bottom: '-10%', right: '-25%' }]} />
      {uri ? (
        <>
          <Animated.View style={[styles.layer, a]}>
            <Image source={{ uri }} blurRadius={60} style={StyleSheet.absoluteFill} contentFit="cover" />
          </Animated.View>
          <Animated.View style={[styles.layer, { opacity: 0.5 }, b]}>
            <Image source={{ uri }} blurRadius={80} style={StyleSheet.absoluteFill} contentFit="cover" />
          </Animated.View>
        </>
      ) : null}
      <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0.5)']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
    </View>
  );
});

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: '15%', left: '0%', width: '100%', aspectRatio: 1, opacity: 0.85 },
  blob: { position: 'absolute', width: '90%', aspectRatio: 1, borderRadius: 9999, opacity: 0.5 },
});
