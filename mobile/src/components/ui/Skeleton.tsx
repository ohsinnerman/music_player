import { memo, useEffect } from 'react';
import { type DimensionValue, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { GUTTER, radius, useColors } from '@/theme';

/** A soft breathing placeholder (no sweeping shimmer — calmer and cheaper). */
export const Skeleton = memo(function Skeleton({
  width = '100%',
  height = 16,
  r = radius.sm,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  r?: number;
  style?: ViewStyle;
}) {
  const colors = useColors();
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [v]);
  const a = useAnimatedStyle(() => ({ opacity: 0.45 + v.value * 0.35 }));
  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: colors.surfaceHigh }, a, style]} />;
});

export function HomeSkeleton() {
  return (
    <View style={{ paddingHorizontal: GUTTER, gap: 28 }}>
      <Skeleton height={300} r={radius.xl} />
      {[0, 1, 2].map((k) => (
        <View key={k} style={{ gap: 14 }}>
          <Skeleton width={160} height={20} />
          <View style={styles.row}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ gap: 8 }}>
                <Skeleton width={140} height={140} r={radius.md} />
                <Skeleton width={110} height={12} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <View style={{ paddingHorizontal: GUTTER, gap: 14 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={[styles.row, { alignItems: 'center' }]}>
          <Skeleton width={48} height={48} r={radius.xs} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="70%" height={13} />
            <Skeleton width="40%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14 },
});
