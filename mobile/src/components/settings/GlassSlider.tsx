import { LinearGradient } from 'expo-linear-gradient';
import { memo, useState } from 'react';
import { type AccessibilityActionEvent, StyleSheet, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { GLASS_STAGES, glassLevel, setGlassDragging, stageOf } from '@/lib/glass';
import { haptic } from '@/lib/haptics';
import { useSettings } from '@/settings/store';
import { fonts, makeStyles, spring, useColors } from '@/theme';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';

const THUMB = 30;
const TRACK_H = 12;
const DETENTS = GLASS_STAGES.map((s) => s.at);
const SNAP = 0.035;

const clamp01 = (x: number) => {
  'worklet';
  return Math.min(1, Math.max(0, x));
};

function commit(v: number) {
  useSettings.getState().setGlass(v);
  setGlassDragging(false);
}

function beginDrag() {
  setGlassDragging(true);
}

/** Animate to a value (tap, label, accessibility) and persist it. */
export function setGlassAnimated(v: number) {
  setGlassDragging(true);
  glassLevel.value = withSpring(v, spring.smooth, (done) => {
    if (done) scheduleOnRN(commit, v);
  });
  haptic.tap();
}

/**
 * The glass material slider: Liquid Glass ↔ Frosted ↔ Opaque, continuous,
 * with soft magnetic detents at the three named materials. Drives the shared
 * `glassLevel` directly on the UI thread, so every glass surface (and the
 * preview) changes live under your finger; the value is saved on release.
 */
export const GlassSlider = memo(function GlassSlider() {
  const colors = useColors();
  const styles = useStyles();
  const [w, setW] = useState(0);
  const range = Math.max(1, w - THUMB);
  const pressed = useSharedValue(0);
  const stretch = useSharedValue(0);
  const lastDetent = useSharedValue(-1);

  const valueAt = (x: number) => {
    'worklet';
    let v = clamp01((x - THUMB / 2) / range);
    // Magnetic detents, with a tick when you land on one.
    let hit = -1;
    for (let i = 0; i < DETENTS.length; i++) {
      if (Math.abs(v - DETENTS[i]!) < SNAP) {
        v = DETENTS[i]!;
        hit = i;
      }
    }
    if (hit !== -1 && hit !== lastDetent.value) scheduleOnRN(haptic.tap);
    lastDetent.value = hit;
    return v;
  };

  const pan = usePanGesture({
    activeOffsetX: [-4, 4],
    failOffsetY: [-12, 12],
    onActivate: (e) => {
      'worklet';
      scheduleOnRN(beginDrag);
      pressed.value = withSpring(1, spring.snappy);
      glassLevel.value = valueAt(e.x);
    },
    onUpdate: (e) => {
      'worklet';
      glassLevel.value = valueAt(e.x);
      // Liquid stretch in the direction of travel, like the tab lens.
      stretch.value = Math.min(0.28, Math.abs(e.velocityX) / 2800);
    },
    onDeactivate: () => {
      'worklet';
      pressed.value = withSpring(0, spring.snappy);
      stretch.value = withSpring(0, spring.liquid);
      scheduleOnRN(commit, glassLevel.value);
    },
  });
  const tap = useTapGesture({
    onActivate: (e) => {
      'worklet';
      const v = clamp01((e.x - THUMB / 2) / range);
      // Taps land on the nearest named material when close to it.
      let target = v;
      for (const d of DETENTS) if (Math.abs(v - d) < 0.08) target = d;
      scheduleOnRN(setGlassAnimated, target);
    },
  });
  const gesture = useCompetingGestures(pan, tap);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: glassLevel.value * range },
      { scaleX: 1 + pressed.value * 0.16 + stretch.value },
      { scaleY: 1 + pressed.value * 0.16 - stretch.value * 0.35 },
    ],
  }));
  const fillStyle = useAnimatedStyle(() => ({ width: THUMB / 2 + glassLevel.value * range }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: withTiming(pressed.value > 0.5 ? 1 : 0, { duration: 160 }), transform: [{ translateX: glassLevel.value * range }] }));

  const onAction = (e: AccessibilityActionEvent) => {
    const cur = useSettings.getState().glass;
    const step = e.nativeEvent.actionName === 'increment' ? 0.1 : e.nativeEvent.actionName === 'decrement' ? -0.1 : 0;
    if (step) setGlassAnimated(Math.round(clamp01(cur + step) * 10) / 10);
  };
  const glass = useSettings((s) => s.glass);
  const stageLabel = GLASS_STAGES.find((s) => s.key === stageOf(glass))!.label;

  return (
    <View>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.hit}
          onLayout={(e) => setW(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Glass material"
          accessibilityValue={{ text: `${stageLabel}, ${Math.round(glass * 100)} percent opaque` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={onAction}
        >
          <View style={styles.track}>
            {/* the track itself shows the material ramp: clear → frosted → solid */}
            <LinearGradient
              colors={colors.scheme === 'dark' ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0.34)'] : ['rgba(10,10,20,0.04)', 'rgba(10,10,20,0.12)', 'rgba(10,10,20,0.3)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <Animated.View style={[styles.fill, fillStyle]}>
              <LinearGradient colors={[`${colors.accent}55`, colors.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
            {DETENTS.map((d) => (
              <View key={d} style={[styles.tick, { left: THUMB / 2 + d * range - 2 }]} />
            ))}
          </View>
          <Animated.View pointerEvents="none" style={[styles.halo, haloStyle]} />
          <Animated.View pointerEvents="none" style={[styles.thumb, thumbStyle]}>
            <LinearGradient colors={['#FFFFFF', '#E9E9EF']} style={[StyleSheet.absoluteFill, { borderRadius: THUMB / 2 }]} />
            <View style={styles.thumbLip} />
          </Animated.View>
        </View>
      </GestureDetector>
      <View style={styles.labels}>
        {GLASS_STAGES.map((s, i) => (
          <StageLabel key={s.key} index={i} label={s.label} at={s.at} />
        ))}
      </View>
    </View>
  );
});

const StageLabel = memo(function StageLabel({ label, at, index }: { label: string; at: number; index: number }) {
  const colors = useColors();
  const style = useAnimatedStyle(() => {
    const d = Math.abs(glassLevel.value - at);
    return { opacity: interpolate(d, [0, 0.25, 0.5], [1, 0.55, 0.38], 'clamp'), transform: [{ scale: interpolate(d, [0, 0.25], [1, 0.96], 'clamp') }] };
  });
  return (
    <PressableScale onPress={() => setGlassAnimated(at)} scaleTo={0.94} accessibilityRole="button" accessibilityLabel={`Use ${label}`} style={{ flex: 1, alignItems: index === 0 ? 'flex-start' : index === 2 ? 'flex-end' : 'center' }}>
      <Animated.View style={style}>
        <Text variant="footnote" style={{ fontFamily: fonts.semibold }} color={colors.text}>
          {label}
        </Text>
      </Animated.View>
    </PressableScale>
  );
});

const useStyles = makeStyles((colors) => ({
  hit: { height: 44, justifyContent: 'center' },
  track: { height: TRACK_H, borderRadius: TRACK_H / 2, overflow: 'hidden', backgroundColor: colors.fill },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: TRACK_H / 2, overflow: 'hidden' },
  tick: { position: 'absolute', top: 3, bottom: 3, width: 4, borderRadius: 2, backgroundColor: colors.scheme === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(10,10,20,0.35)' },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  thumbLip: { position: 'absolute', top: 3, left: 8, right: 8, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.9)' },
  halo: { position: 'absolute', left: -7, width: THUMB + 14, height: THUMB + 14, borderRadius: (THUMB + 14) / 2, backgroundColor: `${colors.accent}33` },
  labels: { flexDirection: 'row', marginTop: 6 },
}));
