import { CircleCheck, CircleDashed, ExternalLink, MonitorPlay } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, Share, useWindowDimensions, View } from 'react-native';
import { setTvScreenAppId, tvScreenAppId, useCast, watchGoogleCast } from '@/cast/session';
import { haptic } from '@/lib/haptics';
import { useSettings } from '@/settings/store';
import { GUTTER, makeStyles, radius, useColors } from '@/theme';
import { Button } from '../ui/Button';
import { PressableScale } from '../ui/PressableScale';
import { openSheet } from '../ui/Sheet';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { toast } from '../ui/Toast';

/** Aura's own TV screen for Chromecast / Google TV (a Custom Web Receiver) — set-up and App ID. */
export function openTvScreenSheet() {
  haptic.soft();
  openSheet((close) => <TvScreenSheet close={close} />);
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.step}>
      <View style={styles.num}>
        <Text variant="footnote" style={{ fontWeight: '700' }}>
          {n}
        </Text>
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

function TvScreenSheet({ close }: { close: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const { height } = useWindowDimensions();
  const server = useSettings((s) => s.serverUrl).replace(/\/$/, '');
  const receiverUrl = `${server}/cast/receiver`;
  const [current, setCurrent] = useState(() => tvScreenAppId());
  const [id, setId] = useState(current);
  const [busy, setBusy] = useState(false);
  const valid = id.trim() === '' || /^[A-Za-z0-9]{8}$/.test(id.trim());
  const tvs = useCast((s) => s.tvs);
  useEffect(() => {
    void watchGoogleCast(true);
    return () => void watchGoogleCast(false);
  }, []);

  const save = async (value: string) => {
    setBusy(true);
    try {
      const now = await setTvScreenAppId(value);
      setCurrent(now);
      setId(now);
      haptic.success();
      toast(now ? 'Aura’s TV screen is on — cast a song to see it' : 'Using Google’s standard TV screen', 'success');
      if (now) close();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t change the TV screen', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ maxHeight: height * 0.86 }} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 12, gap: 14 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={styles.icon}>
          <MonitorPlay size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="title2">TV screen</Text>
          <Text variant="footnote" tone="secondary">
            {current ? `Aura’s screen · App ID ${current}` : 'Google’s standard screen'}
          </Text>
        </View>
      </View>

      <Text variant="callout" tone="secondary">
        When you cast to a Chromecast or Google TV, Aura can show its own screen: the cover on a background made from its colours, synced lyrics that follow the song, the quality badge and what’s up next.
      </Text>

      <PressableScale onPress={() => void Linking.openURL(`${receiverUrl}?demo=1&lyrics=1`)} style={styles.preview} dim>
        <ExternalLink size={16} color={colors.accent} />
        <Text variant="headline" color={colors.accent} style={{ flex: 1 }}>
          Preview it in your browser
        </Text>
      </PressableScale>

      <Text variant="label" tone="tertiary">
        One-time set-up
      </Text>
      <Step n={1}>
        <Text variant="callout">
          Open the <Text variant="callout" color={colors.accent} onPress={() => void Linking.openURL('https://cast.google.com/publish')}>Google Cast SDK Developer Console</Text> and sign in (one-time US$5 registration).
        </Text>
      </Step>
      <Step n={2}>
        <Text variant="callout">Add New Application → Custom Receiver. Name it “Aura” and use this Receiver URL:</Text>
        <PressableScale onPress={() => void Share.share({ message: receiverUrl })} style={styles.url} dim>
          <Text variant="footnote" selectable numberOfLines={2} style={{ flex: 1, fontFamily: 'monospace' }}>
            {receiverUrl}
          </Text>
          <Text variant="footnote" color={colors.accent}>
            Share
          </Text>
        </PressableScale>
      </Step>
      <Step n={3}>
        <Text variant="callout">Until you publish it: Add New Device with your Chromecast’s serial number (on the back of it), then restart the Chromecast — it takes about 15 minutes to apply.</Text>
      </Step>
      <Step n={4}>
        <Text variant="callout">Paste the 8-character App ID here.</Text>
      </Step>

      <TextField label="Cast App ID" placeholder="e.g. 4F8B3A21" value={id} onChangeText={(v) => setId(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={8} error={valid ? undefined : 'An App ID is 8 letters and numbers'} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {current ? (
          <View style={{ flex: 1 }}>
            <Button title="Use Google’s screen" variant="secondary" onPress={() => void save('')} disabled={busy} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button title={busy ? 'Saving…' : 'Use Aura’s screen'} onPress={() => void save(id)} disabled={busy || !valid || !id.trim() || id.trim() === current} />
        </View>
      </View>
      {current && tvs.length ? (
        <View style={{ gap: 10 }}>
          <Text variant="label" tone="tertiary">
            Your devices
          </Text>
          {tvs.map((d) => {
            const ready = d.gcAuraScreen !== false;
            return (
              <View key={d.udn} style={styles.device}>
                {ready ? <CircleCheck size={20} color={colors.success} /> : <CircleDashed size={20} color={colors.textTertiary} />}
                <View style={{ flex: 1 }}>
                  <Text variant="headline" numberOfLines={1}>
                    {d.name}
                  </Text>
                  <Text variant="footnote" tone="secondary">
                    {ready ? 'Shows Aura’s screen' : 'Not ready yet — shows Google’s screen. Check its serial number in the console, wait 15 minutes, then unplug it for 10 seconds.'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
      <Text variant="footnote" tone="tertiary">
        Changing the screen ends a cast that’s playing. Works on every Chromecast and Google TV, including the first one from 2013; songs above 96 kHz play on DLNA receivers only.
      </Text>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  icon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.fill },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  num: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.fillStrong, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  device: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderRadius: radius.md, backgroundColor: colors.fill },
  url: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, padding: 10, borderRadius: radius.sm, backgroundColor: colors.fill },
}));
