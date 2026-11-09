import { ChevronLeft, Moon, Power, Volume2, VolumeX } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { mc, openReceiver, refresh, useMusicCast } from '@/cast/musiccast';
import type { Renderer } from '@/cast/upnp';
import type { McZone } from '@/cast/yxc';
import { haptic } from '@/lib/haptics';
import { fonts, GUTTER, makeStyles, radius, useColors } from '@/theme';
import { Chip } from '../ui/Chip';
import { PressableScale } from '../ui/PressableScale';
import { openSheet } from '../ui/Sheet';
import { Text } from '../ui/Text';
import { openCastSheet } from './CastSheet';

/** Yamaha MusicCast remote: power, volume (dB), input, Pure Direct, sound program, zones, sleep. */
export function openReceiverSheet(dev: Renderer) {
  if (!dev.yxc) return;
  haptic.soft();
  void openReceiver(dev.udn, dev.yxc);
  openSheet((close) => <ReceiverSheet dev={dev} close={close} />);
}

function dbOf(zone: McZone, vol: number): string | null {
  if (!zone.db) return null;
  const { min: vmin, max: vmax } = zone.volume;
  const db = zone.db.min + ((vol - vmin) / Math.max(1, vmax - vmin)) * (zone.db.max - zone.db.min);
  const r = Math.round(db / zone.db.step) * zone.db.step;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(1)} dB`;
}

function Volume({ zone, value, db, disabled }: { zone: McZone; value: number; db?: number; disabled: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const [w, setW] = useState(0);
  const { min, max } = zone.volume;
  const f0 = (value - min) / Math.max(1, max - min);
  const v = useSharedValue(f0);
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => {
    if (drag === null) v.set(f0);
  }, [f0, v, drag]);
  const send = (f: number) => {
    setDrag(null);
    void mc.volume(min + f * (max - min));
  };
  const show = (f: number) => setDrag(min + f * (max - min));
  const at = (x: number, commit: boolean) => {
    'worklet';
    const f = Math.min(1, Math.max(0, (x - 14) / Math.max(1, w - 28)));
    v.set(f);
    scheduleOnRN(commit ? send : show, f);
  };
  const pan = usePanGesture({ enabled: !disabled, activeOffsetX: [-4, 4], failOffsetY: [-12, 12], onUpdate: (e) => at(e.x, false), onDeactivate: (e) => at(e.x, true) });
  const tap = useTapGesture({ enabled: !disabled, onActivate: (e) => at(e.x, true) });
  const gesture = useCompetingGestures(pan, tap);
  const fill = useAnimatedStyle(() => ({ width: 14 + v.value * Math.max(1, w - 28) }));
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: v.value * Math.max(1, w - 28) }] }));
  const shown = drag ?? value;
  const label = drag !== null ? dbOf(zone, drag) : db !== undefined ? `${db > 0 ? '+' : db < 0 ? '−' : ''}${Math.abs(db).toFixed(1)} dB` : dbOf(zone, value);
  return (
    <View style={{ gap: 8, opacity: disabled ? 0.45 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text variant="label" tone="tertiary">
          Volume
        </Text>
        <Text variant="title2" style={{ fontFamily: fonts.bold, fontVariant: ['tabular-nums'] }}>
          {label ?? Math.round(shown)}
        </Text>
      </View>
      <GestureDetector gesture={gesture}>
        <View style={styles.volHit} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityRole="adjustable" accessibilityLabel="Receiver volume" accessibilityValue={{ min, max, now: Math.round(value), text: label ?? undefined }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={(e) => void mc.volume(Math.max(min, Math.min(max, value + (e.nativeEvent.actionName === 'increment' ? 4 : -4))))}>
          <View style={styles.volTrack}>
            <Animated.View style={[styles.volFill, { backgroundColor: colors.accent }, fill]} />
          </View>
          <Animated.View style={[styles.volThumb, thumb]} />
        </View>
      </GestureDetector>
    </View>
  );
}

function ReceiverSheet({ dev, close }: { dev: Renderer; close: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const { height } = useWindowDimensions();
  const info = useMusicCast((s) => s.info);
  const zoneId = useMusicCast((s) => s.zone);
  const st = useMusicCast((s) => s.status[s.zone]);
  const loading = useMusicCast((s) => s.loading);
  const error = useMusicCast((s) => s.error);

  useEffect(() => {
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, []);

  const zone = info?.zones.find((z) => z.id === zoneId) ?? info?.zones[0];
  const on = st?.power === 'on';
  const has = (f: string) => !!zone?.funcs.includes(f);

  return (
    <ScrollView style={{ maxHeight: height * 0.85 }} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 12, gap: 16 }} showsVerticalScrollIndicator={false}>
      <View style={styles.head}>
        <PressableScale onPress={openCastSheet} style={styles.back} accessibilityLabel="Back to Play on">
          <ChevronLeft size={20} color={colors.text} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text variant="title2" numberOfLines={1}>
            {dev.name}
          </Text>
          <Text variant="footnote" tone="secondary">
            {info?.model ?? dev.model ?? 'Yamaha MusicCast'} · MusicCast
          </Text>
        </View>
        {zone && has('power') ? (
          <PressableScale onPress={() => void mc.power(!on)} hapticOnPress="tap" style={[styles.power, on && { backgroundColor: colors.accent }]} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel="Power">
            <Power size={22} color={on ? '#fff' : colors.text} strokeWidth={2.4} />
          </PressableScale>
        ) : null}
      </View>

      {loading && !info ? <ActivityIndicator color={colors.textSecondary} style={{ marginVertical: 24 }} /> : null}
      {error ? (
        <Text variant="callout" color={colors.danger}>
          {error}
        </Text>
      ) : null}

      {info && info.zones.length > 1 ? (
        <View style={styles.segment}>
          {info.zones.map((z) => (
            <PressableScale key={z.id} onPress={() => mc.setZone(z.id)} hapticOnPress="tap" style={[styles.segItem, z.id === zoneId && styles.segOn]} accessibilityRole="tab" accessibilityState={{ selected: z.id === zoneId }}>
              <Text variant="headline" tone={z.id === zoneId ? 'primary' : 'secondary'}>
                {z.name}
              </Text>
            </PressableScale>
          ))}
        </View>
      ) : null}

      {zone && st ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: 16 }}>
          {!on ? (
            <Text variant="callout" tone="secondary">
              {zone.name} is in standby. Tap the power button to turn it on — or just play something, it wakes up by itself.
            </Text>
          ) : null}
          <View style={styles.card}>
            <Volume zone={zone} value={st.volume} db={zoneId === 'main' ? st.db : undefined} disabled={!on} />
            {has('mute') ? (
              <PressableScale onPress={() => void mc.mute(!st.mute)} hapticOnPress="tap" style={[styles.mute, st.mute && { backgroundColor: colors.danger }]} disabled={!on} accessibilityRole="switch" accessibilityState={{ checked: st.mute }} accessibilityLabel="Mute">
                {st.mute ? <VolumeX size={18} color="#fff" /> : <Volume2 size={18} color={colors.text} />}
                <Text variant="headline" color={st.mute ? '#fff' : undefined}>
                  {st.mute ? 'Muted' : 'Mute'}
                </Text>
              </PressableScale>
            ) : null}
          </View>

          {has('pure_direct') || has('direct') ? (
            <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text variant="headline">{has('pure_direct') ? 'Pure Direct' : 'Direct'}</Text>
                <Text variant="footnote" tone="tertiary">
                  {has('pure_direct') ? 'Shortest signal path: skips DSP, tone and the display — best for lossless.' : 'Skips tone controls and DSP.'}
                </Text>
              </View>
              <Switch
                value={has('pure_direct') ? !!st.pureDirect : !!st.direct}
                disabled={!on}
                onValueChange={(v) => void (has('pure_direct') ? mc.pureDirect(v) : mc.direct(v))}
                trackColor={{ true: colors.accent, false: colors.fillStrong }}
                thumbColor="#fff"
                accessibilityLabel="Pure Direct"
              />
            </View>
          ) : null}

          {zone.inputs.length ? (
            <View style={{ gap: 8 }}>
              <Text variant="label" tone="tertiary">
                Input
              </Text>
              <View style={styles.chips}>
                {zone.inputs.map((i) => (
                  <Chip key={i.id} label={i.name} active={st.input === i.id} onPress={on ? () => void mc.input(i.id) : undefined} />
                ))}
              </View>
            </View>
          ) : null}

          {has('sound_program') && zone.programs.length ? (
            <View style={{ gap: 8, opacity: st.pureDirect ? 0.45 : 1 }}>
              <Text variant="label" tone="tertiary">
                Sound program{st.pureDirect ? ' · off in Pure Direct' : ''}
              </Text>
              <View style={styles.chips}>
                {zone.programs.map((p) => (
                  <Chip key={p.id} label={p.name} active={st.soundProgram === p.id} onPress={on && !st.pureDirect ? () => void mc.program(p.id) : undefined} />
                ))}
              </View>
            </View>
          ) : null}

          {has('enhancer') ? (
            <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text variant="headline">Compressed Music Enhancer</Text>
                <Text variant="footnote" tone="tertiary">
                  Restores some of what lossy files lose. Leave off for lossless.
                </Text>
              </View>
              <Switch value={!!st.enhancer} disabled={!on || !!st.pureDirect} onValueChange={(v) => void mc.enhancer(v)} trackColor={{ true: colors.accent, false: colors.fillStrong }} thumbColor="#fff" accessibilityLabel="Enhancer" />
            </View>
          ) : null}

          {has('sleep') ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Moon size={14} color={colors.textTertiary} />
                <Text variant="label" tone="tertiary">
                  Sleep
                </Text>
              </View>
              <View style={styles.chips}>
                {[0, 30, 60, 90, 120].map((m) => (
                  <Chip key={m} label={m ? `${m} min` : 'Off'} active={(st.sleep ?? 0) === m} onPress={on ? () => void mc.sleep(m) : undefined} />
                ))}
              </View>
            </View>
          ) : null}
        </Animated.View>
      ) : null}

      <PressableScale onPress={close} style={{ alignSelf: 'center', padding: 8 }}>
        <Text variant="headline" tone="secondary">
          Done
        </Text>
      </PressableScale>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.fillStrong, alignItems: 'center', justifyContent: 'center' },
  power: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.fillStrong, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 14, borderRadius: radius.lg, backgroundColor: colors.fill, gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mute: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 21, backgroundColor: colors.fillStrong },
  volHit: { height: 40, justifyContent: 'center' },
  volTrack: { height: 8, borderRadius: 4, backgroundColor: colors.fillStrong, overflow: 'hidden' },
  volFill: { height: '100%', borderRadius: 4 },
  volThumb: { position: 'absolute', left: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.strokeStrong, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  segment: { flexDirection: 'row', padding: 3, borderRadius: 14, backgroundColor: colors.fill, gap: 3 },
  segItem: { flex: 1, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.surfaceHigh },
}));
