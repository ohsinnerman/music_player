import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { useColors } from '@/theme';

function Bar({ delay, playing, color, height }: { delay: number; playing: boolean; color: string; height: number }) {
  const v = useSharedValue(0.35);
  useEffect(() => {
    if (playing) {
      v.value = withDelay(delay, withRepeat(withTiming(1, { duration: 380 + delay, easing: Easing.inOut(Easing.sin) }), -1, true));
    } else {
      cancelAnimation(v);
      v.value = withTiming(0.3, { duration: 200 });
    }
    return () => cancelAnimation(v);
  }, [playing, delay, v]);
  const s = useAnimatedStyle(() => ({ transform: [{ scaleY: v.value }] }));
  return <Animated.View style={[styles.bar, { height, backgroundColor: color }, s]} />;
}

/** The little "now playing" bars. */
export const Equalizer = memo(function Equalizer({ playing, color: colorProp, size = 14 }: { playing: boolean; color?: string; size?: number }) {
  const c = useColors();
  const color = colorProp ?? c.accent;
  return (
    <View style={[styles.row, { height: size }]} accessibilityLabel={playing ? 'Now playing' : 'Paused'}>
      <Bar delay={0} playing={playing} color={color} height={size} />
      <Bar delay={140} playing={playing} color={color} height={size} />
      <Bar delay={70} playing={playing} color={color} height={size} />
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 3, borderRadius: 2 },
});
