import { LinearGradient } from 'expo-linear-gradient';
import { Boxes, Cast, Check, RadioReceiver, RefreshCw, SlidersHorizontal, Smartphone, Speaker, Tv, Volume1, Volume2, Wifi } from 'lucide-react-native';
import { memo, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { castAvailable, gcastAvailable, scan, setVolume, useCast, watchGoogleCast } from '@/cast/session';
import type { Renderer } from '@/cast/upnp';
import { haptic } from '@/lib/haptics';
import { outputName } from '@/lib/quality';
import { player } from '@/player/engine';
import { useCurrentTrack } from '@/player/store';
import { GUTTER, makeStyles, radius, useColors } from '@/theme';
import { getOutputInfo } from '../../../modules/aura-audio-route';
import { Artwork } from '../ui/Artwork';
import { Button } from '../ui/Button';
import { PressableScale } from '../ui/PressableScale';
import { openSheet } from '../ui/Sheet';
import { Text } from '../ui/Text';
import { openReceiverSheet } from './ReceiverSheet';

/** "Play on…" — this phone, Google Cast TVs & speakers, or DLNA receivers on the Wi-Fi. */
export function openCastSheet() {
  haptic.soft();
  openSheet((close) => <CastSheet close={close} />);
}

type IconT = typeof Speaker;

/** What a device is, for its icon and subtitle. */
export function deviceLook(d: Renderer): { icon: IconT; kind: string } {
  if (d.kind === 'gcast') {
    if (d.gcKind === 'tv') return { icon: Tv, kind: d.model ? `Google Cast · ${d.model}` : 'Google Cast TV' };
    if (d.gcKind === 'group') return { icon: Boxes, kind: 'Speaker group' };
    return { icon: Speaker, kind: d.model ? `Google Cast · ${d.model}` : 'Google Cast speaker' };
  }
  const brand = d.manufacturer?.replace(/ Corporation$| Inc\.?$/i, '');
  const what = [brand, d.model].filter(Boolean).join(' ') || 'DLNA renderer';
  if (/receiver|rx-|av[- ]?r|^v\d|yamaha|denon|marantz|onkyo|pioneer/i.test(`${d.model ?? ''} ${d.manufacturer ?? ''}`)) return { icon: RadioReceiver, kind: what };
  if (/tv|bravia|samsung|lg |webos|tizen/i.test(`${d.name} ${d.model ?? ''}`)) return { icon: Tv, kind: what };
  return { icon: Speaker, kind: what };
}

function Spinner({ spinning, color }: { spinning: boolean; color: string }) {
  const r = useSharedValue(0);
  useEffect(() => {
    if (spinning) r.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
    else {
      cancelAnimation(r);
      r.value = withTiming(0, { duration: 200 });
    }
  }, [spinning, r]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <Animated.View style={style}>
      <RefreshCw size={19} color={color} strokeWidth={2.2} />
    </Animated.View>
  );
}

/** Three bouncing bars, like Spotify's "playing here". */
function Bars({ playing, color }: { playing: boolean; color: string }) {
  const a = useSharedValue(0.4);
  const b = useSharedValue(0.8);
  const c = useSharedValue(0.6);
  useEffect(() => {
    const go = (v: typeof a, lo: number, hi: number, ms: number) => {
      if (playing) v.value = withRepeat(withSequence(withTiming(hi, { duration: ms }), withTiming(lo, { duration: ms })), -1, true);
      else {
        cancelAnimation(v);
        v.value = withTiming(0.3, { duration: 200 });
      }
    };
    go(a, 0.25, 1, 360);
    go(b, 0.35, 0.9, 280);
    go(c, 0.2, 0.8, 420);
  }, [playing, a, b, c]);
  const s1 = useAnimatedStyle(() => ({ height: 14 * a.value }));
  const s2 = useAnimatedStyle(() => ({ height: 14 * b.value }));
  const s3 = useAnimatedStyle(() => ({ height: 14 * c.value }));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 14 }}>
      {[s1, s2, s3].map((s, i) => (
        <Animated.View key={i} style={[{ width: 3, borderRadius: 1.5, backgroundColor: color }, s]} />
      ))}
    </View>
  );
}

const Row = memo(function Row({
  icon,
  title,
  subtitle,
  active,
  busy,
  onPress,
  onControls,
}: {
  icon: IconT;
  title: string;
  subtitle?: string;
  active: boolean;
  busy?: boolean;
  onPress: () => void;
  onControls?: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const Icon = icon;
  return (
    <View style={[styles.row, active && styles.rowActive]}>
      <PressableScale onPress={onPress} scaleTo={0.98} dim style={styles.rowMain} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${title}${subtitle ? `, ${subtitle}` : ''}`}>
        <View style={[styles.iconBox, active && { backgroundColor: colors.accent }]}>
          <Icon size={22} color={active ? '#fff' : colors.text} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="headline" numberOfLines={1} color={active ? colors.accent : undefined}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" tone="secondary" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {busy ? <ActivityIndicator color={colors.accent} /> : active ? <Check size={20} color={colors.accent} strokeWidth={2.6} /> : null}
      </PressableScale>
      {onControls ? (
        <PressableScale onPress={onControls} scaleTo={0.9} hapticOnPress="tap" style={styles.ctl} accessibilityLabel={`${title} controls`}>
          <SlidersHorizontal size={18} color={colors.text} />
        </PressableScale>
      ) : null}
    </View>
  );
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text variant="label" tone="tertiary" style={{ marginLeft: 10, marginBottom: 6 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Device volume (0–100). */
function VolumeSlider({ value }: { value: number }) {
  const colors = useColors();
  const styles = useStyles();
  const [w, setW] = useState(0);
  const v = useSharedValue(value / 100);
  useEffect(() => {
    v.set(value / 100);
  }, [value, v]);
  const set = (x: number) => {
    'worklet';
    const f = Math.min(1, Math.max(0, (x - 11) / Math.max(1, w - 22)));
    v.set(f);
    scheduleOnRN(setVolume, f * 100);
  };
  const pan = usePanGesture({ activeOffsetX: [-4, 4], failOffsetY: [-12, 12], onActivate: (e) => set(e.x), onUpdate: (e) => set(e.x) });
  const tap = useTapGesture({ onActivate: (e) => set(e.x) });
  const gesture = useCompetingGestures(pan, tap);
  const fill = useAnimatedStyle(() => ({ width: 11 + v.value * Math.max(1, w - 22) }));
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: v.value * Math.max(1, w - 22) }] }));
  return (
    <View style={styles.volRow}>
      <Volume1 size={18} color={colors.textSecondary} />
      <GestureDetector gesture={gesture}>
        <View style={styles.volHit} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityRole="adjustable" accessibilityLabel="Device volume" accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={(e) => setVolume(value + (e.nativeEvent.actionName === 'increment' ? 5 : -5))}>
          <View style={styles.volTrack}>
            <Animated.View style={[styles.volFill, fill]} />
          </View>
          <Animated.View style={[styles.volThumb, thumb]} />
        </View>
      </GestureDetector>
      <Volume2 size={18} color={colors.textSecondary} />
    </View>
  );
}

/** The device that's playing: big icon, what's on, volume, controls. */
function NowPlayingOn({ dev, onPhone }: { dev: Renderer; onPhone: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const status = useCast((s) => s.status);
  const volume = useCast((s) => s.volume);
  const error = useCast((s) => s.error);
  const track = useCurrentTrack();
  const look = deviceLook(dev);
  const Icon = look.icon;
  const playing = status === 'playing';
  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.hero}>
      <LinearGradient colors={[`${colors.accent}33`, `${colors.accent}05`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={styles.heroIcon}>
          <Icon size={28} color="#fff" strokeWidth={2} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Bars playing={playing} color={colors.accent} />
            <Text variant="label" color={colors.accent}>
              {playing ? 'Playing on' : status === 'paused' ? 'Paused on' : status === 'buffering' || status === 'connecting' ? 'Connecting to' : 'Connected to'}
            </Text>
          </View>
          <Text variant="title3" numberOfLines={1}>
            {dev.name}
          </Text>
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {look.kind} · {dev.kind === 'gcast' ? 'original file' : 'original file, no transcoding'}
          </Text>
        </View>
      </View>
      {track ? (
        <View style={styles.track}>
          <Artwork artwork={track.artwork} size={44} radius={8} />
          <View style={{ flex: 1 }}>
            <Text variant="headline" numberOfLines={1}>
              {track.title}
            </Text>
            <Text variant="footnote" tone="secondary" numberOfLines={1}>
              {track.artists.map((a) => a.name).join(', ')}
            </Text>
          </View>
        </View>
      ) : null}
      {volume !== null ? <VolumeSlider value={volume} /> : null}
      {error ? (
        <Text variant="footnote" color={colors.danger}>
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {dev.yxc ? (
          <View style={{ flex: 1 }}>
            <Button title="Receiver" variant="secondary" onPress={() => openReceiverSheet(dev)} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button title="Use this phone" variant="secondary" onPress={onPhone} />
        </View>
      </View>
    </Animated.View>
  );
}

function CastSheet({ close }: { close: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const { height } = useWindowDimensions();
  const devices = useCast((s) => s.devices);
  const tvs = useCast((s) => s.tvs);
  const scanning = useCast((s) => s.scanning);
  const scanError = useCast((s) => s.scanError);
  const active = useCast((s) => s.active);
  const status = useCast((s) => s.status);
  const lastUdn = useCast((s) => s.lastUdn);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    if (castAvailable) void scan();
    void watchGoogleCast(true);
    return () => void watchGoogleCast(false);
  }, []);

  const phoneOut = getOutputInfo();
  const pick = async (d: Renderer) => {
    if (active?.udn === d.udn) return;
    setConnecting(d.udn);
    haptic.tap();
    await player.castTo(d);
    setConnecting(null);
  };
  const toPhone = async () => {
    if (!active) return close();
    haptic.tap();
    await player.stopCasting();
  };
  const byLast = (a: Renderer, b: Renderer) => (a.udn === lastUdn ? -1 : b.udn === lastUdn ? 1 : 0);
  const dlna = [...devices].sort(byLast);
  const cast = [...tvs].sort(byLast);
  const nothing = !dlna.length && !cast.length;

  const row = (d: Renderer) => {
    const look = deviceLook(d);
    return (
      <Animated.View key={d.udn} entering={FadeIn.duration(220)}>
        <Row
          icon={look.icon}
          title={d.name}
          subtitle={look.kind}
          active={active?.udn === d.udn}
          busy={connecting === d.udn || (active?.udn === d.udn && (status === 'connecting' || status === 'buffering'))}
          onPress={() => void pick(d)}
          onControls={d.yxc ? () => openReceiverSheet(d) : undefined}
        />
      </Animated.View>
    );
  };

  return (
    <ScrollView style={{ maxHeight: height * 0.85 }} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text variant="title2">Play on</Text>
          <Text variant="footnote" tone="secondary">
            TVs, speakers and receivers on your Wi-Fi
          </Text>
        </View>
        {castAvailable ? (
          <PressableScale onPress={() => void scan()} disabled={scanning} scaleTo={0.9} hapticOnPress="tap" accessibilityLabel="Search again" style={styles.refresh}>
            <Spinner spinning={scanning} color={colors.text} />
          </PressableScale>
        ) : null}
      </View>

      {active ? <NowPlayingOn dev={active} onPhone={toPhone} /> : null}

      <Row icon={Smartphone} title="This phone" subtitle={phoneOut.available ? outputName(phoneOut.device) : undefined} active={!active} onPress={toPhone} />

      {!castAvailable ? (
        <Text variant="callout" tone="secondary" style={styles.note}>
          {Platform.OS === 'ios' ? 'Playing on TVs, speakers and receivers is in the Android app for now. Use AirPlay from Control Center to play on Apple TV / AirPlay speakers.' : 'Playing on TVs, speakers and receivers needs the latest Android app.'}
        </Text>
      ) : null}

      {cast.length ? <Section title="Google Cast">{cast.map(row)}</Section> : null}
      {dlna.length ? <Section title="Speakers & receivers · DLNA">{dlna.map(row)}</Section> : null}

      {castAvailable && nothing ? (
        <View style={styles.empty}>
          {scanning ? (
            <>
              <Wifi size={22} color={colors.textTertiary} />
              <Text variant="callout" tone="secondary" align="center">
                Looking for TVs, speakers and receivers…
              </Text>
            </>
          ) : (
            <>
              <Cast size={22} color={colors.textTertiary} />
              <Text variant="callout" tone="secondary" align="center">
                {scanError ?? 'Nothing found yet.'}
              </Text>
              <Text variant="footnote" tone="tertiary" align="center">
                Make sure the device is on (or in network standby) and on the same Wi-Fi as this phone. {gcastAvailable ? 'Chromecasts and Google TVs show up here too.' : ''}
              </Text>
            </>
          )}
        </View>
      ) : null}

      <Text variant="footnote" tone="tertiary" style={{ marginTop: 14, marginHorizontal: 10 }}>
        Aura sends the original file — FLAC stays FLAC. Google Cast devices play up to 24-bit / 96 kHz; DLNA receivers decode it themselves, bypassing the phone’s mixer.
      </Text>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14, marginTop: 4 },
  refresh: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.fillStrong, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 6, borderRadius: radius.md, marginBottom: 4 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 10 },
  rowActive: { backgroundColor: colors.fill },
  ctl: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.fillStrong, alignItems: 'center', justifyContent: 'center' },
  iconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.fillStrong, alignItems: 'center', justifyContent: 'center' },
  note: { marginVertical: 10 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 22, paddingHorizontal: 12 },
  hero: { marginBottom: 12, padding: 16, borderRadius: radius.lg, backgroundColor: colors.fill, gap: 14, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.strokeStrong },
  heroIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  track: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: radius.md, backgroundColor: colors.fill },
  volRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  volHit: { flex: 1, height: 36, justifyContent: 'center' },
  volTrack: { height: 6, borderRadius: 3, backgroundColor: colors.fillStrong, overflow: 'hidden' },
  volFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 3 },
  volThumb: { position: 'absolute', left: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
}));
