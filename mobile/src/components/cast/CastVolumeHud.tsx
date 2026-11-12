import { Volume1, Volume2, VolumeX } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCast } from '@/cast/session';
import { useColors } from '@/theme';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';

/**
 * Shown for a moment when the phone's volume buttons change the Cast device's
 * volume (Android's own volume panel doesn't appear for it).
 */
export function CastVolumeHud() {
  const at = useCast((s) => s.volumeHudAt ?? 0);
  const volume = useCast((s) => s.volume);
  const name = useCast((s) => s.active?.name);
  const insets = useSafeAreaInsets();
  const colors = useColors();
  // Visible from a press until 1.5 s after the last one.
  const [hiddenFor, setHiddenFor] = useState(0);
  useEffect(() => {
    if (!at) return;
    const t = setTimeout(() => setHiddenFor(at), 1500);
    return () => clearTimeout(t);
  }, [at]);
  const shown = at > 0 && hiddenFor !== at;

  const v = Math.max(0, Math.min(100, volume ?? 0));
  const fill = useAnimatedStyle(() => ({ width: withTiming(`${v}%`, { duration: 120 }) }), [v]);
  if (!shown || volume === null || !name) return null;
  const Icon = v === 0 ? VolumeX : v < 50 ? Volume1 : Volume2;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top + 8, alignItems: 'center' }]}>
      <Animated.View entering={FadeInUp.springify().damping(18)} exiting={FadeOutUp.duration(180)}>
        <Surface radius={22} style={styles.pill}>
          <View style={styles.row} accessibilityLiveRegion="polite" accessibilityLabel={`${name} volume ${v}%`}>
            <Icon size={18} color={colors.text} strokeWidth={2.4} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={styles.head}>
                <Text variant="footnote" numberOfLines={1} style={{ flex: 1, fontWeight: '600' }}>
                  {name}
                </Text>
                <Text variant="footnote" tone="secondary" style={{ fontVariant: ['tabular-nums'] }}>
                  {v}%
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: colors.fillStrong }]}>
                <Animated.View style={[styles.fill, { backgroundColor: colors.accent }, fill]} />
              </View>
            </View>
          </View>
        </Surface>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { width: 280, minHeight: 56, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});
