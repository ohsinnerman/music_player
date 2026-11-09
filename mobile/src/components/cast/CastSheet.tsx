import { Cast, Check, RefreshCw, Smartphone, Speaker, Volume1, Volume2, Wifi } from 'lucide-react-native';
import { memo, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { castAvailable, scan, setVolume, useCast } from '@/cast/session';
import type { Renderer } from '@/cast/upnp';
import { haptic } from '@/lib/haptics';
import { outputName } from '@/lib/quality';
import { player } from '@/player/engine';
import { GUTTER, makeStyles, radius, useColors } from '@/theme';
import { getOutputInfo } from '../../../modules/aura-audio-route';
import { Button } from '../ui/Button';
import { PressableScale } from '../ui/PressableScale';
import { openSheet } from '../ui/Sheet';
import { Text } from '../ui/Text';

/** "Play on…" — pick this phone or a DLNA receiver / speaker on the Wi-Fi. */
export function openCastSheet() {
  haptic.soft();
  openSheet((close) => <CastSheet close={close} />);
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

const Row = memo(function Row({
  icon,
  title,
  subtitle,
  active,
  busy,
  onPress,
}: {
  icon: typeof Speaker;
  title: string;
  subtitle?: string;
  active: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const Icon = icon;
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} dim style={[styles.row, active && styles.rowActive]} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${title}${subtitle ? `, ${subtitle}` : ''}`}>
      <View style={[styles.iconBox, active && { backgroundColor: colors.accent }]}>
        <Icon size={22} color={active ? '#fff' : colors.text} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="headline" numberOfLines={1}>
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
  );
});

/** Receiver volume (0–100), sent to its RenderingControl service. */
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
        <View style={styles.volHit} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityRole="adjustable" accessibilityLabel="Receiver volume" accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={(e) => setVolume(value + (e.nativeEvent.actionName === 'increment' ? 5 : -5))}>
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

function CastSheet({ close }: { close: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const devices = useCast((s) => s.devices);
  const scanning = useCast((s) => s.scanning);
  const scanError = useCast((s) => s.scanError);
  const active = useCast((s) => s.active);
  const status = useCast((s) => s.status);
  const volume = useCast((s) => s.volume);
  const error = useCast((s) => s.error);
  const lastUdn = useCast((s) => s.lastUdn);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    if (castAvailable) void scan();
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
  const sorted = [...devices].sort((a, b) => (a.udn === lastUdn ? -1 : b.udn === lastUdn ? 1 : 0));

  return (
    <View style={{ paddingHorizontal: GUTTER, paddingBottom: 8 }}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text variant="title2">Play on</Text>
          <Text variant="footnote" tone="secondary">
            Sends the original file over Wi-Fi, no transcoding
          </Text>
        </View>
        {castAvailable ? (
          <PressableScale onPress={() => void scan()} disabled={scanning} scaleTo={0.9} hapticOnPress="tap" accessibilityLabel="Search again" style={styles.refresh}>
            <Spinner spinning={scanning} color={colors.text} />
          </PressableScale>
        ) : null}
      </View>

      <Row icon={Smartphone} title="This phone" subtitle={phoneOut.available ? outputName(phoneOut.device) : undefined} active={!active} onPress={toPhone} />

      {!castAvailable ? (
        <Text variant="callout" tone="secondary" style={styles.note}>
          Playing on Wi-Fi speakers and receivers needs the latest Android app.
        </Text>
      ) : null}

      {sorted.map((d) => (
        <Animated.View key={d.udn} entering={FadeIn.duration(220)}>
          <Row
            icon={Speaker}
            title={d.name}
            subtitle={[d.manufacturer?.replace(/ Corporation$/, ''), d.model].filter(Boolean).join(' ') || 'DLNA renderer'}
            active={active?.udn === d.udn}
            busy={connecting === d.udn || (active?.udn === d.udn && (status === 'connecting' || status === 'buffering'))}
            onPress={() => void pick(d)}
          />
        </Animated.View>
      ))}

      {castAvailable && !devices.length ? (
        <View style={styles.empty}>
          {scanning ? (
            <>
              <Wifi size={22} color={colors.textTertiary} />
              <Text variant="callout" tone="secondary" align="center">
                Looking for receivers and speakers on your Wi-Fi…
              </Text>
            </>
          ) : (
            <>
              <Cast size={22} color={colors.textTertiary} />
              <Text variant="callout" tone="secondary" align="center">
                {scanError ?? 'Nothing found yet.'}
              </Text>
              <Text variant="footnote" tone="tertiary" align="center">
                Make sure the receiver is on (or in network standby), on the same Wi-Fi as this phone, and has DLNA / network playback enabled.
              </Text>
            </>
          )}
        </View>
      ) : null}

      {active ? (
        <Animated.View entering={FadeIn.duration(200)} style={styles.activeCard}>
          <Text variant="label" tone="tertiary">
            {status === 'playing' ? 'Playing on' : status === 'paused' ? 'Paused on' : status === 'buffering' || status === 'connecting' ? 'Connecting to' : 'Connected to'} {active.name}
          </Text>
          {volume !== null ? <VolumeSlider value={volume} /> : null}
          {error ? (
            <Text variant="footnote" color={colors.danger}>
              {error}
            </Text>
          ) : null}
          <Button title="Play on this phone instead" variant="secondary" onPress={toPhone} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14, marginTop: 4 },
  refresh: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.fillStrong, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 10, borderRadius: radius.md, marginBottom: 4 },
  rowActive: { backgroundColor: colors.fill },
  iconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.fillStrong, alignItems: 'center', justifyContent: 'center' },
  note: { marginVertical: 10 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 22, paddingHorizontal: 12 },
  activeCard: { marginTop: 10, padding: 14, borderRadius: radius.lg, backgroundColor: colors.fill, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.strokeStrong },
  volRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  volHit: { flex: 1, height: 36, justifyContent: 'center' },
  volTrack: { height: 6, borderRadius: 3, backgroundColor: colors.fillStrong, overflow: 'hidden' },
  volFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 3 },
  volThumb: { position: 'absolute', left: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
}));

