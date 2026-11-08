// Import each weight directly so unused weights/italics aren't bundled into the APK.
import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif/400Regular';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif/400Regular_Italic';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { QueryClientProvider } from '@tanstack/react-query';
import { BlurTargetView } from 'expo-blur';
import { useFonts } from 'expo-font';
import { DarkTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '@/api/queries';
import { useAuth } from '@/auth/store';
import { GlassDock } from '@/components/dock/GlassDock';
import { PlaybackClock } from '@/components/player/PlaybackClock';
import { PlayerSheet } from '@/components/player/PlayerSheet';
import { SheetHost } from '@/components/ui/Sheet';
import { ToastHost } from '@/components/ui/Toast';
import { ChromeProvider, useBlurTarget } from '@/lib/chrome';
import { player } from '@/player/engine';
import { useSettings } from '@/settings/store';
import { colors } from '@/theme';
import '@/library/hooks'; // registers guest → account library sync

SplashScreen.preventAutoHideAsync().catch(() => undefined);
SystemUI.setBackgroundColorAsync(colors.bg).catch(() => undefined);

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.accent, text: colors.text, border: colors.stroke },
};

function useSettingsHydrated() {
  const [ready, setReady] = useState(() => useSettings.persist.hasHydrated());
  useEffect(() => {
    if (ready) return;
    const unsub = useSettings.persist.onFinishHydration(() => setReady(true));
    if (useSettings.persist.hasHydrated()) setReady(true);
    return unsub;
  }, [ready]);
  return ready;
}

function Shell() {
  const target = useBlurTarget();
  return (
    <View style={styles.root}>
      <BlurTargetView ref={target} style={styles.root}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_right',
            animationDuration: 280,
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        >
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="auth" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="search" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="settings" options={{ animation: 'slide_from_bottom' }} />
        </Stack>
      </BlurTargetView>
      <GlassDock />
      <PlayerSheet />
      <SheetHost />
      <ToastHost />
      <PlaybackClock />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
  });
  const hydrated = useSettingsHydrated();
  const ready = (fontsLoaded || !!fontError) && hydrated;

  useEffect(() => {
    if (!hydrated) return;
    void useAuth.getState().bootstrap();
    void player.restore();
  }, [hydrated]);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={navTheme}>
            <ChromeProvider>
              <StatusBar style="light" />
              <Shell />
            </ChromeProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
