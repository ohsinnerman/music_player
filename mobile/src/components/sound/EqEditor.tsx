import { memo, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import { BAND_LABELS, BAND_RANGE, BANDS, chain, freqs, PRESETS, responseDb } from '@/audio/eq';
import { useSound } from '@/audio/sound';
import { haptic } from '@/lib/haptics';
import { fonts, GUTTER, makeStyles, radius, useColors } from '@/theme';
import { Chip } from '../ui/Chip';
import { Text } from '../ui/Text';

const CURVE_H = 132;
const SLIDER_H = 168;
const KNOB = 22;
const F = freqs(120);
const xOf = (f: number, w: number) => (Math.log10(f / 20) / 3) * w;
const yOf = (db: number) => CURVE_H / 2 - (db / (BAND_RANGE + 3)) * (CURVE_H / 2 - 6);

/** The combined frequency response of everything that's on (headphone correction + bands). */
export const EqCurve = memo(function EqCurve({ dim }: { dim?: boolean }) {
  const colors = useColors();
  const bands = useSound((s) => s.bands);
  const headphone = useSound((s) => s.headphone);
  const [w, setW] = useState(0);
  const d = useMemo(() => {
    if (!w) return '';
    const filters = chain(bands, headphone);
    return F.map((f, i) => `${i ? 'L' : 'M'}${xOf(f, w).toFixed(1)},${yOf(responseDb(filters, f)).toFixed(1)}`).join(' ');
  }, [bands, headphone, w]);
  const stroke = dim ? colors.textTertiary : colors.accent;
  return (
    <View style={{ height: CURVE_H }} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityLabel="Equalizer curve">
      {w ? (
        <Svg width={w} height={CURVE_H}>
          <Defs>
            <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity={0.28} />
              <Stop offset="1" stopColor={stroke} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {[100, 1000, 10000].map((f) => (
            <Line key={f} x1={xOf(f, w)} x2={xOf(f, w)} y1={0} y2={CURVE_H} stroke={colors.stroke} strokeWidth={1} />
          ))}
          <Line x1={0} x2={w} y1={yOf(0)} y2={yOf(0)} stroke={colors.strokeStrong} strokeWidth={1} strokeDasharray="4 4" />
          <Path d={`${d} L${w},${CURVE_H} L0,${CURVE_H} Z`} fill="url(#fill)" />
          <Path d={d} stroke={stroke} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
        </Svg>
      ) : null}
      <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 2 }]} pointerEvents="none">
        {['20', '100', '1k', '10k', '20k'].map((l) => (
          <Text key={l} variant="footnote" tone="tertiary">
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
});

function Band({ index, value, disabled }: { index: number; value: number; disabled: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const v = useSharedValue(value);
  useEffect(() => {
    v.set(value);
  }, [value, v]);
  const commit = (db: number) => useSound.getState().setBand(index, db);
  const travel = SLIDER_H - KNOB;
  const at = (y: number) => {
    'worklet';
    const t = Math.min(1, Math.max(0, (y - KNOB / 2) / travel));
    const db = Math.round((BAND_RANGE - t * 2 * BAND_RANGE) * 2) / 2;
    if (db !== v.value) {
      v.set(db);
      scheduleOnRN(commit, db);
    }
  };
  const pan = usePanGesture({ enabled: !disabled, activeOffsetY: [-3, 3], failOffsetX: [-14, 14], onActivate: (e) => at(e.y), onUpdate: (e) => at(e.y), onDeactivate: () => scheduleOnRN(haptic.soft) });
  const tap = useTapGesture({ enabled: !disabled, numberOfTaps: 2, onActivate: () => {
    v.set(0);
    scheduleOnRN(commit, 0);
  } });
  const gesture = useCompetingGestures(pan, tap);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateY: ((BAND_RANGE - v.value) / (2 * BAND_RANGE)) * travel }] }));
  const fill = useAnimatedStyle(() => {
    const mid = travel / 2 + KNOB / 2;
    const y = ((BAND_RANGE - v.value) / (2 * BAND_RANGE)) * travel + KNOB / 2;
    return { top: Math.min(mid, y), height: Math.abs(mid - y) };
  });
  return (
    <View style={{ alignItems: 'center', flex: 1, gap: 6, opacity: disabled ? 0.45 : 1 }}>
      <Text variant="footnote" tone="secondary" style={{ fontVariant: ['tabular-nums'], fontFamily: fonts.semibold }}>
        {value > 0 ? `+${value}` : value}
      </Text>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.hit}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${BAND_LABELS[index]} hertz`}
          accessibilityValue={{ min: -BAND_RANGE, max: BAND_RANGE, now: value, text: `${value} dB` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => commit(Math.max(-BAND_RANGE, Math.min(BAND_RANGE, value + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}
        >
          <View style={styles.track} />
          <Animated.View style={[styles.fill, { backgroundColor: colors.accent }, fill]} />
          <Animated.View style={[styles.knob, knob]} />
        </View>
      </GestureDetector>
      <Text variant="footnote" tone="tertiary">
        {BAND_LABELS[index]}
      </Text>
    </View>
  );
}

/** Preset chips + 10 band sliders. */
export function EqBands() {
  const styles = useStyles();
  const bands = useSound((s) => s.bands);
  const enabled = useSound((s) => s.eqEnabled);
  const presetId = useSound((s) => s.presetId);
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: GUTTER, paddingVertical: 4 }}>
        {PRESETS.map((p) => (
          <Chip key={p.id} label={p.name} active={presetId === p.id} onPress={() => useSound.getState().set({ bands: [...p.bands], presetId: p.id, eqEnabled: true })} />
        ))}
      </ScrollView>
      <View style={styles.bands}>
        {BANDS.map((_, i) => (
          <Band key={i} index={i} value={bands[i] ?? 0} disabled={!enabled} />
        ))}
      </View>
      <Text variant="footnote" tone="tertiary" style={{ marginHorizontal: GUTTER + 4, marginTop: 6 }}>
        Drag a band; double-tap it to reset. Volume is lowered automatically by the biggest boost, so nothing clips.
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  bands: { flexDirection: 'row', marginHorizontal: GUTTER, marginTop: 12, paddingVertical: 12, paddingHorizontal: 6, borderRadius: radius.lg, backgroundColor: colors.fill },
  hit: { width: 30, height: SLIDER_H, alignItems: 'center' },
  track: { position: 'absolute', top: KNOB / 2, bottom: KNOB / 2, width: 4, borderRadius: 2, backgroundColor: colors.fillStrong },
  fill: { position: 'absolute', width: 4, borderRadius: 2 },
  knob: { position: 'absolute', top: 0, width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.strokeStrong, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
}));
