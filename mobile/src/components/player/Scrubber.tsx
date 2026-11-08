import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useDerivedValue, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { formatTime } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { player } from '@/player/engine';
import { clock } from '@/player/store';
import { spring } from '@/theme';
import { ReText } from '../ui/ReText';

/**
 * Apple-style scrubber: no thumb, the bar thickens and brightens while you
 * drag, and the time labels track your finger. All on the UI thread.
 */
export const Scrubber = memo(function Scrubber({ width, accent = '#fff' }: { width: number; accent?: string }) {
  const active = useSharedValue(0);
  const scrub = useSharedValue(0); // 0..1 while dragging

  const fraction = useDerivedValue(() => {
    const d = clock.duration.value;
    if (clock.scrubbing.value) return scrub.value;
    return d > 0 ? Math.min(1, clock.position.value / d) : 0;
  });

  const begin = (x: number) => {
    'worklet';
    clock.scrubbing.value = true;
    scrub.value = Math.min(1, Math.max(0, x / width));
    active.value = withSpring(1, spring.snappy);
  };
  const finish = () => {
    'worklet';
    const target = scrub.value * clock.duration.value;
    clock.base.value = target;
    clock.position.value = target;
    clock.at.value = Date.now();
    clock.scrubbing.value = false;
    active.value = withTiming(0, { duration: 220 });
    scheduleOnRN(player.seek, target);
    scheduleOnRN(haptic.tap);
  };

  const pan = usePanGesture({
    minDistance: 0,
    hitSlop: { top: 18, bottom: 18 },
    onActivate: (e) => {
      'worklet';
      begin(e.x);
    },
    onUpdate: (e) => {
      'worklet';
      scrub.value = Math.min(1, Math.max(0, e.x / width));
    },
    onDeactivate: () => {
      'worklet';
      finish();
    },
  });
  const tap = useTapGesture({
    hitSlop: { top: 18, bottom: 18 },
    onActivate: (e) => {
      'worklet';
      begin(e.x);
      finish();
    },
  });
  const gesture = useSimultaneousGestures(pan, tap);

  const track = useAnimatedStyle(() => ({
    height: interpolate(active.value, [0, 1], [5, 10]),
    borderRadius: 5,
    backgroundColor: `rgba(255,255,255,${interpolate(active.value, [0, 1], [0.22, 0.3])})`,
  }));
  const fill = useAnimatedStyle(() => ({ width: fraction.value * width, opacity: interpolate(active.value, [0, 1], [0.86, 1]) }));
  const wrap = useAnimatedStyle(() => ({ transform: [{ scaleX: interpolate(active.value, [0, 1], [1, 1.02]) }] }));

  const elapsed = useDerivedValue(() => formatTime(fraction.value * clock.duration.value));
  const remaining = useDerivedValue(() => `-${formatTime(Math.max(0, clock.duration.value - fraction.value * clock.duration.value))}`);
  const labels = useAnimatedStyle(() => ({ transform: [{ translateY: active.value * 4 }] }));

  return (
    <View style={{ width }}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.hit, wrap]} accessibilityRole="adjustable" accessibilityLabel="Playback position">
          <Animated.View style={[styles.track, track]}>
            <Animated.View style={[styles.fill, { backgroundColor: accent }, fill]} />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      <Animated.View style={[styles.times, labels]}>
        <ReText text={elapsed} />
        <ReText text={remaining} style={{ textAlign: 'right' }} />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  hit: { height: 28, justifyContent: 'center' },
  track: { width: '100%', overflow: 'hidden' },
  fill: { height: '100%' },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
});
