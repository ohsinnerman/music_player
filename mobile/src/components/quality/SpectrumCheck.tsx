import { ScanSearch } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { Track } from '@/api/types';
import { haptic } from '@/lib/haptics';
import { useDeviceMusic } from '@/local/store';
import { GUTTER, makeStyles, radius, useColors } from '@/theme';
import { analyzeSpectrum, type SpectrumResult } from '../../../modules/aura-audio-route';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';

const kHz = (hz: number) => `${(hz / 1000).toFixed(hz % 1000 ? 1 : 0)} kHz`;

export function spectrumText(r: { verdict: string; cutoffHz: number; likelySource?: string | null; padded16?: boolean | null }, sampleRate?: number, bits?: number): { title: string; body: string; tone: 'good' | 'warn' | 'loss' | 'info' } {
  const c = kHz(r.cutoffHz);
  const src = r.likelySource ? `a ${r.likelySource} MP3 / AAC` : 'a lossy encode';
  const padded = r.padded16 && (bits ?? 0) > 16 ? ` Also, only 16 of the ${bits} bits carry sound — it was padded from 16-bit.` : '';
  switch (r.verdict) {
    case 'genuine':
      return (sampleRate ?? 0) > 48000
        ? { title: 'Genuine Hi-Res', body: `Real high-resolution content up to ${c}.${padded}`, tone: padded ? 'warn' : 'good' }
        : { title: 'Looks genuine', body: `Music all the way up to ${c}, as a true lossless file should have.${padded}`, tone: padded ? 'warn' : 'good' };
    case 'lossy':
      return { title: 'Probably from a lossy file', body: `Hard cut-off at ${c}, typical of ${src}. It plays fine, but it holds no more detail than that lossy copy.${padded}`, tone: 'loss' };
    case 'suspect':
      return { title: 'Possibly from a lossy file', body: `Sharp cut-off at ${c}, typical of ${src}. It may also be a master that was filtered — compare with another copy if you can.${padded}`, tone: 'warn' };
    case 'upsampled':
      return { title: 'Upsampled', body: `Nothing above ${c}, so this ${sampleRate ? kHz(sampleRate) : 'Hi-Res'} file was made from a CD-quality source. It sounds the same as the CD, just bigger.${padded}`, tone: 'warn' };
    case 'silent':
      return { title: 'Too quiet to tell', body: 'The parts checked were silent.', tone: 'info' };
    default:
      return { title: 'Can’t tell for sure', body: `Little content above ${c}, with a gentle roll-off — common in older or quiet recordings.${padded}`, tone: 'info' };
  }
}

function Graph({ r }: { r: SpectrumResult }) {
  const colors = useColors();
  const [w, setW] = useState(0);
  const H = 72;
  const n = r.bands.length;
  const min = -110;
  const y = (db: number) => Math.min(H, Math.max(0, (db / min) * H));
  const d = w && n > 1 ? r.bands.map((db, i) => `${i ? 'L' : 'M'}${((i / (n - 1)) * w).toFixed(1)},${y(db).toFixed(1)}`).join(' ') : '';
  const cx = w ? Math.min(w, (r.cutoffHz / (r.sampleRate / 2)) * w) : 0;
  return (
    <View style={{ height: H + 16 }} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityLabel={`Spectrum: content up to ${kHz(r.cutoffHz)}`}>
      {w ? (
        <Svg width={w} height={H}>
          <Rect x={cx} y={0} width={Math.max(0, w - cx)} height={H} fill={colors.danger} opacity={r.verdict === 'genuine' ? 0 : 0.08} />
          <Path d={`${d} L${w},${H} L0,${H} Z`} fill={colors.accent} opacity={0.18} />
          <Path d={d} stroke={colors.accent} strokeWidth={1.8} fill="none" />
          {r.cutoffHz < r.sampleRate / 2 - 1000 ? <Line x1={cx} x2={cx} y1={0} y2={H} stroke={colors.danger} strokeWidth={1.5} strokeDasharray="3 3" /> : null}
        </Svg>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="footnote" tone="tertiary">
          0
        </Text>
        <Text variant="footnote" tone="tertiary">
          {kHz(r.sampleRate / 4)}
        </Text>
        <Text variant="footnote" tone="tertiary">
          {kHz(r.sampleRate / 2)}
        </Text>
      </View>
    </View>
  );
}

/** "Is it really lossless?" for a lossless file on the phone. */
export function SpectrumCheck({ track }: { track: Track }) {
  const colors = useColors();
  const styles = useStyles();
  const l = track.local!;
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<SpectrumResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!analyzeSpectrum) return null;
  const saved = live ?? l.spectrum ?? null;
  const toneColor = (t: string) => (t === 'good' ? colors.success : t === 'warn' ? colors.warning : t === 'loss' ? colors.danger : colors.textSecondary);

  const run = async () => {
    haptic.tap();
    setBusy(true);
    setErr(null);
    try {
      const r = await analyzeSpectrum!(l.uri);
      setLive(r);
      useDeviceMusic.getState().patchTrack(track.id, { local: { ...l, spectrum: { verdict: r.verdict, cutoffHz: r.cutoffHz, likelySource: r.likelySource, padded16: r.padded16, at: new Date().toISOString() } } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Couldn’t analyse this file');
    } finally {
      setBusy(false);
    }
  };

  const v = saved ? spectrumText(saved, l.sampleRate, l.bitsPerSample) : null;
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <ScanSearch size={18} color={v ? toneColor(v.tone) : colors.textSecondary} />
        <Text variant="headline" style={{ flex: 1 }} color={v ? toneColor(v.tone) : undefined}>
          {v ? v.title : 'Is it really lossless?'}
        </Text>
        <PressableScale onPress={run} disabled={busy} style={styles.btn} hapticOnPress="tap">
          {busy ? <ActivityIndicator size="small" color={colors.text} /> : <Text variant="headline">{saved ? 'Check again' : 'Check'}</Text>}
        </PressableScale>
      </View>
      <Text variant="footnote" tone="secondary">
        {v ? v.body : 'Looks at the frequencies in the file to spot a FLAC made from an MP3, a Hi-Res file made from a CD, or 24-bit padded from 16-bit. Takes a few seconds.'}
      </Text>
      {live ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <Graph r={live} />
        </Animated.View>
      ) : null}
      {err ? (
        <Text variant="footnote" color={colors.danger}>
          {err}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { marginTop: 14, padding: 14, gap: 10, borderRadius: radius.lg, backgroundColor: colors.fill },
  btn: { paddingHorizontal: 14, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fillStrong, minWidth: 70 },
  pad: { paddingHorizontal: GUTTER },
}));
