import { router } from 'expo-router';
import { ChevronLeft, Headphones, Minus, Plus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type DspState, getDspState, getOutputInfo } from '../../modules/aura-audio-route';
import { type ReplayGainMode, useSound } from '@/audio/sound';
import { Group, Row, Separator, Toggle } from '@/components/settings/Rows';
import { EqBands, EqCurve } from '@/components/sound/EqEditor';
import { openHeadphoneSheet } from '@/components/sound/HeadphoneSheet';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics';
import { fonts, GUTTER, makeStyles, radius, useColors } from '@/theme';

const fmtDb = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} dB`;

function Stepper({ label, hint, value, onChange, min = -12, max = 12, step = 0.5, disabled }: { label: string; hint?: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; disabled?: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const bump = (d: number) => {
    haptic.tap();
    onChange(Math.max(min, Math.min(max, Math.round((value + d) * 10) / 10)));
  };
  return (
    <View style={[styles.row, disabled && { opacity: 0.45 }]} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: fmtDb(value) }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={(e) => bump(e.nativeEvent.actionName === 'increment' ? step : -step)}>
      <View style={{ flex: 1 }}>
        <Text variant="body">{label}</Text>
        {hint ? (
          <Text variant="footnote" tone="tertiary">
            {hint}
          </Text>
        ) : null}
      </View>
      <View style={styles.stepper}>
        <PressableScale disabled={disabled || value <= min} onPress={() => bump(-step)} style={styles.stepBtn} accessibilityLabel={`Lower ${label}`}>
          <Minus size={16} color={colors.text} />
        </PressableScale>
        <Text variant="callout" style={{ minWidth: 64, textAlign: 'center', fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] }}>
          {fmtDb(value)}
        </Text>
        <PressableScale disabled={disabled || value >= max} onPress={() => bump(step)} style={styles.stepBtn} accessibilityLabel={`Raise ${label}`}>
          <Plus size={16} color={colors.text} />
        </PressableScale>
      </View>
    </View>
  );
}

const RG_MODES: { id: ReplayGainMode; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'track', label: 'Track' },
  { id: 'album', label: 'Album' },
];

function Segmented<T extends string>({ items, value, onChange }: { items: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const styles = useStyles();
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {items.map((it) => (
        <PressableScale key={it.id} onPress={() => onChange(it.id)} hapticOnPress="tap" accessibilityRole="tab" accessibilityState={{ selected: value === it.id }} style={[styles.segItem, value === it.id && styles.segOn]}>
          <Text variant="headline" tone={value === it.id ? 'primary' : 'secondary'}>
            {it.label}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}

/** One-line description of what the output stage is doing for the current song. */
function useLive(): DspState {
  const [s, setS] = useState<DspState>(() => getDspState());
  useEffect(() => {
    const t = setInterval(() => setS(getDspState()), 1500);
    return () => clearInterval(t);
  }, []);
  return s;
}

function LiveCard() {
  const styles = useStyles();
  const colors = useColors();
  const s = useLive();
  if (Platform.OS !== 'android') return null;
  const lines: string[] = [];
  if (!s.hooked) lines.push('Starts with the next song you play.');
  else if (!s.active) lines.push('Waiting for a song…');
  else {
    const bits = s.inputEncoding === 'float' ? 'decoded' : `${s.inputBits}-bit`;
    lines.push(`${bits} → 32-bit float · ${s.sampleRate ? (s.sampleRate / 1000).toFixed(s.sampleRate % 1000 ? 1 : 0) : '?'} kHz`);
    if (s.downmixed) lines.push(`${s.inputChannels} channels → stereo`);
    const rg = s.replayGain;
    if (rg && rg.source !== 'off') lines.push(rg.source === 'none' ? `No ReplayGain tags · ${fmtDb(rg.gainDb)}` : `ReplayGain ${rg.source} · ${fmtDb(rg.gainDb)}`);
    if (s.eqFilters) lines.push(`EQ · ${s.eqFilters} filters`);
    const bp = s.bitPerfect?.state;
    if (bp === 'bit-perfect') lines.push(`USB bit-perfect${s.bitPerfect?.device ? ` · ${s.bitPerfect.device}` : ''}`);
    else if (bp === 'native-rate') lines.push('USB at the song’s own rate (not bit-perfect)');
    else if (bp === 'unsupported-rate') lines.push('USB DAC doesn’t offer this rate bit-perfect');
  }
  return (
    <View style={styles.live}>
      <View style={[styles.dot, { backgroundColor: s.active ? colors.success : colors.textTertiary }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" tone="tertiary">
          Now
        </Text>
        {lines.map((l) => (
          <Text key={l} variant="callout" style={{ fontVariant: ['tabular-nums'] }}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function SoundScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useStyles();
  const s = useSound();
  const out = getOutputInfo();
  const sdk = out.sdk ?? 0;
  const usb = out.device?.type === 'usb';

  return (
    <View style={styles.root}>
      <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
        <IconButton icon={ChevronLeft} label="Back" background={colors.fillStrong} onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))} />
        <Text variant="title1" style={{ flex: 1, marginLeft: 12 }} accessibilityRole="header">
          Sound
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <LiveCard />

        {/* Equalizer */}
        <View style={styles.eqHead}>
          <Text variant="label" tone="tertiary" style={{ flex: 1 }}>
            Equalizer
          </Text>
          <Switch value={s.eqEnabled} onValueChange={() => s.set({ eqEnabled: !s.eqEnabled })} trackColor={{ true: colors.accent, false: colors.fillStrong }} thumbColor="#fff" accessibilityLabel="Equalizer" />
        </View>
        <View style={styles.curveCard}>
          <EqCurve dim={!s.eqEnabled} />
        </View>
        <View style={[styles.group, { marginTop: 12 }]}>
          <Row
            icon={Headphones}
            label={s.headphone ? s.headphone.name : 'Headphone correction'}
            hint={s.headphone ? `AutoEq · ${s.headphone.source}${s.headphone.rig ? ` on ${s.headphone.rig}` : ''}` : 'Make your headphones sound neutral — 8 800 measured models'}
            onPress={openHeadphoneSheet}
            right={<Text tone="tertiary">{s.headphone ? 'Change' : 'Choose'}</Text>}
          />
        </View>
        <View style={{ marginTop: 12 }}>
          <EqBands />
        </View>

        <Group title="ReplayGain" footer="Plays every song at the same loudness using the ReplayGain tags in your files (foobar2000, MusicBrainz Picard, beets, Poweramp can write them). Album mode keeps the loudness differences within an album.">
          <View style={{ padding: 10 }}>
            <Segmented items={RG_MODES} value={s.replayGain} onChange={(replayGain) => s.set({ replayGain })} />
          </View>
          <Separator />
          <Stepper label="Pre-amp" hint="Added to the ReplayGain value" value={s.preampDb} onChange={(preampDb) => s.set({ preampDb })} disabled={s.replayGain === 'off'} />
          <Separator />
          <Stepper label="Songs without tags" hint="Gain for untagged songs and streams" value={s.noTagDb} onChange={(noTagDb) => s.set({ noTagDb })} disabled={s.replayGain === 'off'} />
          <Separator />
          <Toggle label="Prevent clipping" hint="Never boost past the song’s peak" value={s.preventClip} onChange={() => s.set({ preventClip: !s.preventClip })} disabled={s.replayGain === 'off'} />
        </Group>

        <Group title="Output" footer="Aura decodes to 32-bit float, so 24-bit files keep all 24 bits (Android’s default is 16-bit), and processing adds no audible noise.">
          <Toggle label="Mix surround down to stereo" hint="5.1 / 7.1 files, with the standard −3 dB centre and surround levels. Turn off for multichannel DACs (applies from the next song)." value={s.downmix} onChange={() => s.set({ downmix: !s.downmix })} />
          <Separator />
          <Toggle
            label="Bit-perfect USB DAC"
            hint={
              sdk && sdk < 34
                ? 'Needs Android 14 or newer.'
                : `Your DAC gets the song at its own rate with Android’s mixer bypassed. EQ and ReplayGain pause, and the phone’s volume may be fixed at full — use the DAC’s volume.${usb ? '' : ' Plug in a USB DAC to use it.'}`
            }
            value={s.bitPerfect}
            onChange={() => s.set({ bitPerfect: !s.bitPerfect })}
            disabled={!!sdk && sdk < 34}
          />
        </Group>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: GUTTER, paddingBottom: 8 },
  group: { marginHorizontal: GUTTER, borderRadius: radius.lg, backgroundColor: colors.fill, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 54, paddingVertical: 10 },
  eqHead: { flexDirection: 'row', alignItems: 'center', marginTop: 24, marginHorizontal: GUTTER + 4, marginBottom: 8 },
  curveCard: { marginHorizontal: GUTTER, padding: 12, borderRadius: radius.lg, backgroundColor: colors.fill },
  live: { flexDirection: 'row', gap: 12, marginHorizontal: GUTTER, marginTop: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.strokeStrong },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fillStrong },
  segment: { flexDirection: 'row', padding: 3, borderRadius: 14, backgroundColor: colors.fill, gap: 3 },
  segItem: { flex: 1, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.surfaceHigh, shadowColor: '#000', shadowOpacity: colors.scheme === 'dark' ? 0 : 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: colors.scheme === 'dark' ? 0 : 1 },
}));
