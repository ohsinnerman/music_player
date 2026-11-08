import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import { type ComponentRef, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, type TextInput, View } from 'react-native';

type InputRef = ComponentRef<typeof TextInput>;
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/store';
import { Button } from '@/components/ui/Button';
import { Glass } from '@/components/ui/Glass';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { toast } from '@/components/ui/Toast';
import { haptic } from '@/lib/haptics';
import { colors, GUTTER, radius, spring } from '@/theme';

type Mode = 'signup' | 'signin';

function Segmented({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const x = useSharedValue(mode === 'signup' ? 0 : 1);
  const [w, setW] = useState(0);
  const lens = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * (w / 2) }], width: w / 2 - 4 }));
  const pick = (m: Mode) => {
    x.value = withSpring(m === 'signup' ? 0 : 1, spring.liquid);
    onChange(m);
  };
  return (
    <View style={styles.seg} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.segLens, lens]} />
      {(['signup', 'signin'] as const).map((m) => (
        <PressableScale key={m} onPress={() => pick(m)} style={styles.segBtn} accessibilityRole="tab" accessibilityState={{ selected: mode === m }}>
          <Text variant="headline" color={mode === m ? colors.text : colors.textSecondary}>
            {m === 'signup' ? 'Create account' : 'Sign in'}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const emailRef = useRef<InputRef>(null);
  const pwRef = useRef<InputRef>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    if (mode === 'signup' && !name.trim()) e.displayName = 'Tell us what to call you';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Enter a valid email';
    if (mode === 'signup' && password.length < 8) e.password = 'Use at least 8 characters';
    if (mode === 'signin' && !password) e.password = 'Enter your password';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setFormError(null);
    if (!validate()) return haptic.error();
    setBusy(true);
    try {
      if (mode === 'signup') await signUp(email, password, name);
      else await signIn(email, password);
      haptic.success();
      toast(mode === 'signup' ? `Welcome to Aura, ${name.trim().split(' ')[0]}` : 'Welcome back', 'success');
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (err) {
      haptic.error();
      if (err instanceof ApiError) {
        const fieldErrs: Record<string, string> = {};
        for (const d of err.details ?? []) if (d.path) fieldErrs[d.path] = d.message;
        setErrors(fieldErrs);
        setFormError(Object.keys(fieldErrs).length ? null : err.message);
      } else setFormError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#2A1410', '#160B12', colors.bg]} locations={[0, 0.4, 0.8]} style={StyleSheet.absoluteFill} />
      <View style={[styles.glow, { top: -120 }]} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, paddingHorizontal: GUTTER }}>
          <View style={{ alignItems: 'flex-end' }}>
            <IconButton icon={X} label="Close" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} background="rgba(255,255,255,0.08)" />
          </View>
          <Text variant="display" style={{ marginTop: 20 }}>
            {mode === 'signup' ? 'Hello there.' : 'Welcome back.'}
          </Text>
          <Text variant="body" tone="secondary" style={{ marginTop: 6, marginBottom: 26 }}>
            {mode === 'signup' ? 'One account for your likes, playlists and history — on every device.' : 'Sign in to pick up where you left off.'}
          </Text>

          <Glass variant="inline" radius={radius.xl} style={styles.card}>
            <View style={{ padding: 18, gap: 16 }}>
              <Segmented
                mode={mode}
                onChange={(m) => {
                  setMode(m);
                  setErrors({});
                  setFormError(null);
                }}
              />
              {mode === 'signup' ? (
                <TextField label="Name" placeholder="Akki" value={name} onChangeText={setName} autoComplete="name" textContentType="name" returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} error={errors.displayName} maxLength={40} />
              ) : null}
              <TextField
                ref={emailRef}
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => pwRef.current?.focus()}
                error={errors.email}
                maxLength={254}
              />
              <TextField
                ref={pwRef}
                label="Password"
                placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                value={password}
                onChangeText={setPassword}
                secure
                autoCapitalize="none"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                returnKeyType="go"
                onSubmitEditing={submit}
                error={errors.password}
                maxLength={128}
              />
              {formError ? (
                <Text variant="callout" color={colors.danger} accessibilityLiveRegion="assertive">
                  {formError}
                </Text>
              ) : null}
              <Button title={mode === 'signup' ? 'Create account' : 'Sign in'} size="lg" onPress={submit} loading={busy} style={{ marginTop: 4 }} />
            </View>
          </Glass>

          <Text variant="footnote" tone="tertiary" align="center" style={{ marginTop: 20 }}>
            Passwords are hashed with Argon2id on your server and never stored in the app.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  glow: { position: 'absolute', alignSelf: 'center', width: 420, height: 420, borderRadius: 210, backgroundColor: 'rgba(255,90,54,0.18)' },
  card: {},
  seg: { flexDirection: 'row', height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.06)', padding: 2 },
  segLens: { position: 'absolute', top: 2, left: 2, bottom: 2, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)' },
  segBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
