import { LinearGradient } from 'expo-linear-gradient';
import { CircleAlert, CircleCheck, CircleMinus, Info, Lightbulb } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { addRouteListener, type DspState, getDspState, getOutputInfo, type OutputInfo } from '../../../modules/aura-audio-route';
import type { Track } from '@/api/types';
import { formatTime } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { assess, khz, type PathStep, signalPath, specOf, type StepState } from '@/lib/quality';
import { refreshFileInfo } from '@/local/import';
import { useCast } from '@/cast/session';
import { useDeviceMusic } from '@/local/store';
import { usePlayer } from '@/player/store';
import { GUTTER, fonts, makeStyles, radius, useColors } from '@/theme';
import { openSheet } from '../ui/Sheet';
import { Text } from '../ui/Text';
import { HIRES_GOLD, tierColor } from './QualityBadge';
import { SpectrumCheck } from './SpectrumCheck';

/** Open the "Audio quality" sheet for a song (what it is, and how this phone plays it). */
export function openAudioQuality(track: Track) {
  haptic.soft();
  openSheet(() => <AudioQuality trackId={track.id} initial={track} />);
}

function useStateColor() {
  const colors = useColors();
  return (s: StepState) => (s === 'good' ? colors.success : s === 'warn' ? colors.warning : s === 'loss' ? colors.danger : colors.textSecondary);
}

/** Five-bar meter, filled by tier. */
function Meter({ bars, color }: { bars: number; color: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 24 }} accessibilityLabel={`${bars} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={{ width: 5, height: 6 + i * 3.6, borderRadius: 2, backgroundColor: i <= bars ? color : colors.fillStrong }} />
      ))}
    </View>
  );
}

function StepIcon({ state, size = 18 }: { state: StepState; size?: number }) {
  const color = useStateColor()(state);
  const Icon = state === 'good' ? CircleCheck : state === 'warn' ? CircleMinus : state === 'loss' ? CircleAlert : Info;
  return <Icon size={size} color={color} strokeWidth={2.2} />;
}

function Step({ step, last }: { step: PathStep; last: boolean }) {
  const styles = useStyles();
  const stateColor = useStateColor();
  return (
    <View style={styles.step} accessible accessibilityLabel={`${step.title}: ${step.value}. ${step.detail}`}>
      <View style={styles.rail}>
        <View style={[styles.dot, { borderColor: stateColor(step.state) }]}>
          <StepIcon state={step.state} size={15} />
        </View>
        {last ? null : <View style={styles.line} />}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : 16, gap: 2 }}>
        <View style={styles.stepHead}>
          <Text variant="label" tone="tertiary">
            {step.title}
          </Text>
          <Text variant="headline" style={{ flexShrink: 1, textAlign: 'right' }} numberOfLines={1}>
            {step.value}
          </Text>
        </View>
        <Text variant="footnote" tone="secondary">
          {step.detail}
        </Text>
      </View>
    </View>
  );
}

function Detail({ k, v }: { k: string; v?: string | number | null }) {
  const styles = useStyles();
  if (v === undefined || v === null || v === '') return null;
  return (
    <View style={styles.detail}>
      <Text variant="footnote" tone="tertiary">
        {k}
      </Text>
      <Text variant="callout" numberOfLines={2} style={{ fontFamily: fonts.semibold }}>
        {v}
      </Text>
    </View>
  );
}

const channelsLabel = (n?: number) => (!n ? undefined : n === 1 ? 'Mono' : n === 2 ? 'Stereo' : `${n} channels`);

function AudioQuality({ trackId, initial }: { trackId: string; initial: Track }) {
  const colors = useColors();
  const styles = useStyles();
  const { height } = useWindowDimensions();
  const stateColor = useStateColor();
  // Live track (device library updates after a re-scan; catalog tracks are static).
  const fromLibrary = useDeviceMusic((s) => s.tracks.find((t) => t.id === trackId));
  const fromQueue = usePlayer((s) => s.queue.find((t) => t.id === trackId));
  const track = fromLibrary ?? fromQueue ?? initial;
  const [out, setOut] = useState<OutputInfo>(() => getOutputInfo());
  const [dsp, setDsp] = useState<DspState>(() => getDspState());
  const [missing, setMissing] = useState(false);

  // Follow headphones being plugged in / Bluetooth connecting while the sheet is open.
  useEffect(() => {
    const off = addRouteListener(setOut);
    const poll = setInterval(() => {
      setOut(getOutputInfo());
      setDsp(getDspState());
    }, 2000);
    return () => {
      off();
      clearInterval(poll);
    };
  }, []);

  // Re-read the file so older imports get bit depth, encoder, etc.
  useEffect(() => {
    if (!initial.local) return;
    refreshFileInfo(initial).catch(() => setMissing(true));
  }, [initial]);

  const spec = useMemo(() => specOf(track), [track]);
  const a = assess(spec);
  const castTo = useCast((s) => s.active);
  // The live output stage describes the song that's playing, not necessarily this one.
  const playing = usePlayer((s) => s.queue[s.index]?.id === trackId);
  const path = useMemo(
    () => signalPath(spec, out.available ? out : null, castTo ? { name: castTo.name, model: castTo.model } : null, dsp.hooked ? (playing ? dsp : { hooked: true }) : null),
    [spec, out, castTo, dsp, playing],
  );
  const tc = tierColor(a.tier, colors);
  const l = track.local;

  return (
    <ScrollView style={{ maxHeight: height * 0.82 }} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
      {/* Hero: tier + meter */}
      <Animated.View entering={FadeIn.duration(220)} style={styles.hero}>
        {a.tier === 'hires' ? (
          <LinearGradient colors={[`${HIRES_GOLD[0]}30`, `${HIRES_GOLD[1]}08`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" tone="tertiary">
            Audio quality
          </Text>
          <Text variant="title2" color={tc}>
            {a.label}
          </Text>
          <Text variant="callout" tone="secondary" style={{ fontVariant: ['tabular-nums'] }}>
            {[spec.codec, a.spec.replace(`${spec.codec} · `, ''), channelsLabel(spec.channels)].filter((x, i, arr) => x && arr.indexOf(x) === i).join(' · ')}
          </Text>
        </View>
        <Meter bars={a.bars} color={tc} />
      </Animated.View>
      <Text variant="callout" tone="secondary" style={{ marginTop: 10 }}>
        {a.blurb}
        {spec.approximate ? ' Numbers are typical for this source, not measured from this exact stream.' : ''}
      </Text>

      {l && spec.lossless && !missing ? <SpectrumCheck track={track} /> : null}

      {missing ? (
        <View style={[styles.verdict, { borderColor: colors.danger }]}>
          <StepIcon state="loss" />
          <Text variant="callout" style={{ flex: 1 }}>
            This file can’t be opened any more — it may have been moved or deleted.
          </Text>
        </View>
      ) : null}

      {/* Signal path */}
      <View style={styles.sectionHead}>
        <Text variant="title3">How it’s playing</Text>
        <View style={[styles.effective, { borderColor: stateColor(path.state) }]}>
          <StepIcon state={path.state} size={13} />
          <Text variant="footnote" style={{ fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
            {path.effective}
          </Text>
        </View>
      </View>
      <View style={styles.card}>
        {path.steps.map((s, i) => (
          <Step key={s.key} step={s} last={i === path.steps.length - 1} />
        ))}
      </View>

      <View style={[styles.verdict, { borderColor: stateColor(path.state) }]}>
        <StepIcon state={path.state} />
        <Text variant="callout" style={{ flex: 1 }}>
          {path.verdict}
        </Text>
      </View>
      {path.tips.map((t) => (
        <View key={t} style={styles.tip}>
          <Lightbulb size={15} color={colors.textTertiary} />
          <Text variant="footnote" tone="secondary" style={{ flex: 1 }}>
            {t}
          </Text>
        </View>
      ))}

      {/* Details */}
      <Text variant="title3" style={{ marginTop: 22, marginBottom: 10 }}>
        {l ? 'File' : 'Stream'}
      </Text>
      <View style={styles.grid}>
        <Detail k="Format" v={l ? l.format.toUpperCase() : spec.note} />
        <Detail k="Codec" v={spec.codec + (spec.lossless ? ' (lossless)' : ' (lossy)')} />
        <Detail k="Bit depth" v={spec.bitsPerSample ? `${spec.bitsPerSample}-bit` : spec.lossless ? undefined : '— (lossy)'} />
        <Detail k="Sample rate" v={spec.sampleRate ? `${khz(spec.sampleRate)} kHz` : undefined} />
        <Detail k="Channels" v={channelsLabel(spec.channels)} />
        <Detail k={spec.lossless ? 'Average bitrate' : 'Bitrate'} v={spec.bitrateKbps ? `${spec.approximate ? '~' : ''}${spec.bitrateKbps} kbps${spec.vbr ? ' VBR' : spec.lossless || spec.approximate ? '' : ' CBR'}` : undefined} />
        <Detail k="Encoder" v={spec.encoder} />
        <Detail k="Duration" v={track.durationMs ? formatTime(track.durationMs / 1000) : undefined} />
        <Detail k="Size" v={l?.sizeBytes ? `${(l.sizeBytes / 1048576).toFixed(1)} MB` : undefined} />
        <Detail k="Output" v={out.available ? `${out.device ? (out.device.name ?? out.device.type) : 'Unknown'} · mixer ${khz(out.mixerSampleRate ?? undefined)} kHz` : undefined} />
      </View>
      {l ? (
        <Text variant="footnote" tone="tertiary" style={{ marginTop: 10 }} numberOfLines={2}>
          {l.fileName}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    marginTop: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.strokeStrong,
    overflow: 'hidden',
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 22, marginBottom: 10 },
  effective: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, height: 26, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, flexShrink: 1 },
  card: { padding: 14, borderRadius: radius.lg, backgroundColor: colors.fill },
  step: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 26 },
  dot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  line: { flex: 1, width: 2, borderRadius: 1, backgroundColor: colors.stroke, marginVertical: 3 },
  stepHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 26 },
  verdict: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 12, padding: 14, borderRadius: radius.md, borderWidth: 1, backgroundColor: colors.fill },
  tip: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 10, paddingHorizontal: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: radius.lg, backgroundColor: colors.fill, paddingVertical: 6 },
  detail: { width: '50%', paddingHorizontal: 14, paddingVertical: 8, gap: 1 },
}));
