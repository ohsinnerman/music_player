import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ServerCog } from 'lucide-react-native';
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHome } from '@/api/queries';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { art } from '@/lib/format';
import { checkServerUrl, getServerUrl, useSettings } from '@/settings/store';
import { alpha } from '@/lib/palette';
import { GUTTER, fonts, makeStyles, radius, useColors } from '@/theme';

const FALLBACK = [
  ['#FF5A36', '#FFB13B'],
  ['#0F6FFF', '#00C2FF'],
  ['#0B8457', '#3DDC97'],
  ['#FF3D7F', '#FF8FB1'],
  ['#A0522D', '#E9B872'],
  ['#14505C', '#5FB7C9'],
] as const;

const Column = memo(function Column({ items, size, speed, offset, reverse }: { items: (string | readonly [string, string])[]; size: number; speed: number; offset: number; reverse?: boolean }) {
  const reduce = useReducedMotion();
  const y = useSharedValue(0);
  const total = items.length * (size + 12);
  useEffect(() => {
    if (reduce) return;
    y.value = withRepeat(withTiming(1, { duration: speed, easing: Easing.linear }), -1, false);
  }, [reduce, speed, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: (reverse ? -1 + y.value : -y.value) * total + offset }] }));
  const doubled = [...items, ...items];
  return (
    <Animated.View style={[{ gap: 12 }, style]}>
      {doubled.map((it, i) =>
        typeof it === 'string' ? (
          <Image key={i} source={{ uri: it }} style={{ width: size, height: size, borderRadius: radius.md }} contentFit="cover" transition={400} />
        ) : (
          <LinearGradient key={i} colors={it} style={{ width: size, height: size, borderRadius: radius.md }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        ),
      )}
    </Animated.View>
  );
});

export default function Onboarding() {
  const colors = useColors();
  const styles = useStyles();
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const setOnboarded = useSettings((s) => s.setOnboarded);
  const serverUrl = useSettings((s) => s.serverUrl);
  const hasServer = !checkServerUrl(serverUrl || getServerUrl()).problem;
  const home = useHome();

  const covers = useMemo(() => {
    const urls: string[] = [];
    for (const s of home.data ?? []) {
      for (const it of s.items) {
        const u = it.kind === 'artist' ? art(it.image, 'medium') : it.kind === 'genre' ? undefined : art(it.artwork, 'medium');
        if (u && !urls.includes(u)) urls.push(u);
      }
    }
    return urls.slice(0, 18);
  }, [home.data]);
  const pool: (string | readonly [string, string])[] = covers.length >= 9 ? covers : [...FALLBACK, ...FALLBACK];
  const cols = [pool.filter((_, i) => i % 3 === 0), pool.filter((_, i) => i % 3 === 1), pool.filter((_, i) => i % 3 === 2)];
  const size = W * 0.36;

  const finish = (to: '/' | '/auth') => {
    setOnboarded(true);
    if (to === '/auth') {
      router.replace('/');
      setTimeout(() => router.push('/auth'), 50);
    } else router.replace('/');
  };

  return (
    <View style={styles.root}>
      <View style={[styles.wall, { width: W * 1.4, left: -W * 0.2, top: -H * 0.08, height: H * 0.85 }]} pointerEvents="none">
        {cols.map((c, i) => (
          <Column key={i} items={c} size={size} speed={38000 + i * 9000} offset={i === 1 ? -size / 2 : 0} reverse={i === 1} />
        ))}
      </View>
      <LinearGradient pointerEvents="none" colors={[alpha(colors.bg, 0.2), alpha(colors.bg, 0.55), colors.bg, colors.bg]} locations={[0, 0.38, 0.62, 1]} style={StyleSheet.absoluteFill} />

      <View style={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Animated.View entering={FadeInDown.duration(600).delay(100)}>
          <Text style={styles.brand}>aura</Text>
          <Text variant="display" style={{ fontSize: 52, lineHeight: 54 }}>
            Music,
          </Text>
          <Text variant="largeTitle" style={{ fontSize: 40, lineHeight: 44, letterSpacing: -1.6 }}>
            that moves with you.
          </Text>
          <Text variant="body" tone="secondary" style={{ marginTop: 14, maxWidth: 340 }}>
            Full tracks from independent artists, previews of the charts, and lyrics that follow every word.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(600).delay(260)} style={{ gap: 12, marginTop: 30 }}>
          <Button title="Create a free account" size="lg" onPress={() => finish('/auth')} />
          <Button title="Continue as guest" size="lg" variant="secondary" onPress={() => finish('/')} />
          {!hasServer ? (
            <PressableScale onPress={() => router.push('/settings')} style={styles.server}>
              <ServerCog size={16} color={colors.warning} />
              <Text variant="callout" color={colors.warning}>
                Connect your Aura server first
              </Text>
            </PressableScale>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  wall: { position: 'absolute', flexDirection: 'row', gap: 12, justifyContent: 'center', transform: [{ rotate: '-10deg' }], opacity: 0.9 },
  content: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: GUTTER + 4 },
  brand: { fontFamily: fonts.extrabold, fontSize: 15, letterSpacing: 6, color: colors.accent, textTransform: 'uppercase', marginBottom: 14 },
  server: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },
}));
