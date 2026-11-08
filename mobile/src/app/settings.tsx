import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { CircleCheck, CircleX, LogOut, type LucideIcon, Moon, ShieldCheck, Smartphone, Sun, Trash2, UserRound, X } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endpoints } from '@/api/endpoints';
import { queryClient } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { openSheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { toast } from '@/components/ui/Toast';
import { useLocalLibrary } from '@/library/store';
import { ALLOW_CLEARTEXT, type ThemeMode, checkServerUrl, useSettings } from '@/settings/store';
import { GUTTER, fonts, makeStyles, radius, useColors } from '@/theme';

function Group({ title, children, footer }: { title: string; children: ReactNode; footer?: string }) {
  const styles = useStyles();
  return (
    <View style={{ marginTop: 28 }}>
      <Text variant="label" tone="tertiary" style={{ marginLeft: GUTTER + 4, marginBottom: 8 }}>
        {title}
      </Text>
      <View style={styles.group}>{children}</View>
      {footer ? (
        <Text variant="footnote" tone="tertiary" style={{ marginHorizontal: GUTTER + 4, marginTop: 8 }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

function Row({ icon: Icon, label, onPress, color: colorProp, right }: { icon?: LucideIcon; label: string; onPress?: () => void; color?: string; right?: ReactNode }) {
  const colors = useColors();
  const color = colorProp ?? colors.text;
  const styles = useStyles();
  return (
    <PressableScale onPress={onPress} disabled={!onPress} dim scaleTo={0.99} style={styles.row}>
      {Icon ? <Icon size={20} color={color} strokeWidth={2} /> : null}
      <Text variant="body" color={color} style={{ flex: 1 }}>
        {label}
      </Text>
      {right}
    </PressableScale>
  );
}

function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: () => void; hint?: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text variant="body">{label}</Text>
        {hint ? (
          <Text variant="footnote" tone="tertiary">
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.fillStrong }} thumbColor="#fff" accessibilityLabel={label} />
    </View>
  );
}

const MODES: { mode: ThemeMode; label: string; icon: LucideIcon }[] = [
  { mode: 'system', label: 'System', icon: Smartphone },
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
];

function Appearance() {
  const colors = useColors();
  const styles = useStyles();
  const mode = useSettings((x) => x.themeMode);
  const setMode = useSettings((x) => x.setThemeMode);
  return (
    <View style={{ padding: 16, gap: 10 }}>
      <Text variant="body">Appearance</Text>
      <View style={styles.segment} accessibilityRole="radiogroup">
        {MODES.map(({ mode: m, label, icon: Icon }) => {
          const on = m === mode;
          return (
            <PressableScale
              key={m}
              onPress={() => setMode(m)}
              scaleTo={0.96}
              hapticOnPress="tap"
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${label} appearance`}
              style={[styles.segItem, on && styles.segOn]}
            >
              <Icon size={17} color={on ? colors.text : colors.textSecondary} strokeWidth={on ? 2.4 : 2} />
              <Text variant="callout" color={on ? colors.text : colors.textSecondary} style={{ fontFamily: on ? fonts.bold : fonts.medium }}>
                {label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

async function testServer(url: string): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${url}/v1/config`, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return `Server answered ${res.status}`;
    const json = (await res.json()) as { data?: { providers?: { label: string }[] } };
    if (!json.data?.providers) return 'That doesn’t look like an Aura server';
    return null;
  } catch {
    return 'Couldn’t reach that address';
  } finally {
    clearTimeout(t);
  }
}

function ServerBlock() {
  const colors = useColors();
  const styles = useStyles();
  const { serverUrl, setServerUrl } = useSettings();
  const [value, setValue] = useState(serverUrl);
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    const { url, problem } = checkServerUrl(value);
    if (problem) {
      setStatus('fail');
      setMessage(problem === 'insecure' ? 'This build only allows https:// addresses' : problem === 'empty' ? 'Enter your server address' : 'That address doesn’t look right');
      return;
    }
    setStatus('testing');
    setMessage(null);
    const err = await testServer(url);
    if (err) {
      setStatus('fail');
      setMessage(err);
      return;
    }
    setStatus('ok');
    setValue(url);
    setServerUrl(url);
    queryClient.clear();
    toast('Connected to your server', 'success');
  };

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <TextField
        label="Server address"
        placeholder="https://aura-api.example.com"
        value={value}
        onChangeText={(v) => {
          setValue(v);
          setStatus('idle');
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        onSubmitEditing={save}
        error={status === 'fail' ? message : null}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Button title="Test & save" onPress={save} loading={status === 'testing'} />
        {status === 'ok' ? (
          <View style={styles.inline}>
            <CircleCheck size={18} color={colors.success} />
            <Text variant="callout" color={colors.success}>
              Connected
            </Text>
          </View>
        ) : status === 'fail' ? (
          <CircleX size={18} color={colors.danger} />
        ) : null}
      </View>
    </View>
  );
}

function ChangePassword({ close }: { close: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={{ paddingHorizontal: GUTTER, gap: 14 }}>
      <Text variant="title2">Change password</Text>
      <TextField label="Current password" secure value={current} onChangeText={setCurrent} autoCapitalize="none" />
      <TextField label="New password" secure value={next} onChangeText={setNext} autoCapitalize="none" error={error} />
      <Button
        title="Update password"
        size="lg"
        loading={busy}
        disabled={!current || next.length < 8}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            const tokens = await endpoints.changePassword(current, next);
            await useAuth.getState().adoptTokens(tokens);
            close();
            toast('Password updated. Other devices were signed out.', 'success');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Couldn’t update password');
          } finally {
            setBusy(false);
          }
        }}
      />
    </View>
  );
}

function DeleteAccount({ close }: { close: () => void }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={{ paddingHorizontal: GUTTER, gap: 14 }}>
      <Text variant="title2">Delete your account?</Text>
      <Text variant="callout" tone="secondary">
        This permanently deletes your account, likes, playlists and history from the server. It can’t be undone.
      </Text>
      <TextField label="Confirm with your password" secure value={pw} onChangeText={setPw} autoCapitalize="none" error={error} />
      <Button
        title="Delete forever"
        variant="danger"
        size="lg"
        loading={busy}
        disabled={!pw}
        onPress={async () => {
          setBusy(true);
          try {
            await endpoints.deleteAccount(pw);
            await useAuth.getState().signOut();
            close();
            toast('Your account was deleted');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Couldn’t delete account');
          } finally {
            setBusy(false);
          }
        }}
      />
    </View>
  );
}

export default function Settings() {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { status, user, signOut } = useAuth();
  const s = useSettings();
  const clearHistory = useLocalLibrary((x) => x.clearHistory);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <View style={styles.root}>
      <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
        <Text variant="title1" style={{ flex: 1 }} accessibilityRole="header">
          Settings
        </Text>
        <IconButton icon={X} label="Close" background={colors.fillStrong} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        <View style={styles.profile}>
          <View style={styles.avatar}>
            {user ? (
              <Text variant="title1" style={{ fontFamily: fonts.extrabold }}>
                {user.displayName.charAt(0).toUpperCase()}
              </Text>
            ) : (
              <UserRound size={28} color={colors.textSecondary} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="title3">{user?.displayName ?? (status === 'authed' ? 'Signed in' : 'Listening as guest')}</Text>
            <Text variant="callout" tone="secondary" numberOfLines={1}>
              {user?.email ?? 'Sign in to sync your library'}
            </Text>
          </View>
          {status !== 'authed' ? <Button title="Sign in" onPress={() => router.push('/auth')} /> : null}
        </View>

        <Group title="Server" footer={`Your Aura backend. ${ALLOW_CLEARTEXT ? 'This build allows http:// for LAN testing.' : 'Must be https:// (secure).'}`}>
          <ServerBlock />
        </Group>

        <Group title="Look & feel">
          <Appearance />
          <View style={styles.sep} />
          <Toggle label="Living artwork" hint="Animated, blurred cover behind the player" value={s.livingBackground} onChange={() => s.toggle('livingBackground')} />
          <View style={styles.sep} />
          <Toggle label="Reduce transparency" hint="Solid surfaces instead of glass" value={s.reduceTransparency} onChange={() => s.toggle('reduceTransparency')} />
          <View style={styles.sep} />
          <Toggle label="Haptics" value={s.haptics} onChange={() => s.toggle('haptics')} />
        </Group>

        <Group title="Storage">
          <Row
            label="Clear image cache"
            onPress={async () => {
              await Promise.all([Image.clearDiskCache(), Image.clearMemoryCache()]);
              toast('Image cache cleared', 'success');
            }}
          />
          <View style={styles.sep} />
          <Row
            label="Clear search history"
            onPress={() => {
              s.clearRecentSearches();
              toast('Search history cleared', 'success');
            }}
          />
          <View style={styles.sep} />
          <Row
            label="Clear recently played"
            onPress={() => {
              clearHistory();
              toast('Listening history cleared on this device', 'success');
            }}
          />
        </Group>

        {status === 'authed' ? (
          <Group title="Account & security">
            <Row icon={ShieldCheck} label="Change password" onPress={() => openSheet((close) => <ChangePassword close={close} />)} />
            <View style={styles.sep} />
            <Row
              icon={LogOut}
              label="Sign out of all devices"
              onPress={() =>
                Alert.alert('Sign out everywhere?', 'You’ll need to sign in again on every device, including this one.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Sign out',
                    style: 'destructive',
                    onPress: async () => {
                      await endpoints.logoutAll().catch(() => undefined);
                      await signOut();
                    },
                  },
                ])
              }
            />
            <View style={styles.sep} />
            <Row icon={LogOut} label="Sign out" onPress={() => signOut().then(() => toast('Signed out'))} />
            <View style={styles.sep} />
            <Row icon={Trash2} label="Delete account" color={colors.danger} onPress={() => openSheet((close) => <DeleteAccount close={close} />)} />
          </Group>
        ) : null}

        <Group title="About">
          <Row label="Version" right={<Text tone="tertiary">{version}</Text>} />
          <View style={styles.sep} />
          <Row label="Source code" onPress={() => Linking.openURL('https://github.com/ohsinnerman/music_player')} />
          <View style={styles.sep} />
          <View style={{ padding: 16 }}>
            <Text variant="footnote" tone="tertiary">
              Full-length music streamed from Audius (artist-owned, free). Chart previews from Deezer. Synced lyrics from LRCLIB. Artwork © the respective artists and labels.
            </Text>
          </View>
        </Group>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: GUTTER, paddingBottom: 8 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: GUTTER, marginTop: 14, padding: 16, borderRadius: radius.lg, backgroundColor: colors.fill },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  group: { marginHorizontal: GUTTER, borderRadius: radius.lg, backgroundColor: colors.fill, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 54, paddingVertical: 10 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.stroke, marginLeft: 16 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  segment: { flexDirection: 'row', padding: 3, borderRadius: 14, backgroundColor: colors.fill, gap: 3 },
  segItem: { flex: 1, height: 40, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  segOn: { backgroundColor: colors.surfaceHigh, shadowColor: '#000', shadowOpacity: colors.scheme === 'dark' ? 0 : 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: colors.scheme === 'dark' ? 0 : 1 },
}));
