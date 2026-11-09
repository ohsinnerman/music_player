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
import { DarkTheme, DefaultTheme, type ErrorBoundaryProps, ThemeProvider as NavThemeProvider, SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
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
import { installGlobalHandlers, logEvent } from '@/lib/diagnostics';
import { startGlassSync } from '@/lib/glass';
import { repairFileNames } from '@/local/import';
import { useDeviceMusic } from '@/local/store';
import { player } from '@/player/engine';
import { useSettings } from '@/settings/store';
import { ThemeProvider, useColors } from '@/theme';
import '@/library/hooks'; // registers guest → account library sync

SplashScreen.preventAutoHideAsync().catch(() => undefined);
installGlobalHandlers();

// Fix file names saved by older versions (encoded document ids), once the library is loaded.
const repair = () => setTimeout(() => void repairFileNames(), 1500);
if (useDeviceMusic.persist.hasHydrated()) repair();
else useDeviceMusic.persist.onFinishHydration(repair);

/** Last-resort screen if rendering crashes: log it, offer a retry. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    logEvent('error', 'render', error.message, error);
  }, [error]);
  return (
    <View style={{ flex: 1, backgroundColor: '#08080B', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>Something went wrong</Text>
      <Text style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>{error.message}</Text>
      <Pressable onPress={retry} style={{ marginTop: 8, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 22, backgroundColor: '#FF5A36' }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>Try again</Text>
      </Pressable>
      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center' }}>Details are saved in Settings → Diagnostics.</Text>
    </View>
  );
}

const subscribeHydration = (cb: () => void) => useSettings.persist.onFinishHydration(cb);
const isHydrated = () => useSettings.persist.hasHydrated();

function useSettingsHydrated() {
  return useSyncExternalStore(subscribeHydration, isHydrated, isHydrated);
}

function Shell() {
  const target = useBlurTarget();
  const colors = useColors();
  const navTheme = useMemo(() => {
    const base = colors.scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { ...base.colors, background: colors.bg, card: colors.bg, primary: colors.accent, text: colors.text, border: colors.stroke },
    };
  }, [colors]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => undefined);
  }, [colors.bg]);

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={colors.scheme === 'dark' ? 'light' : 'dark'} />
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <BlurTargetView ref={target} style={{ flex: 1, backgroundColor: colors.bg }}>
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
    </NavThemeProvider>
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

  useEffect(() => (hydrated ? startGlassSync() : undefined), [hydrated]);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ChromeProvider>
              <Shell />
            </ChromeProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
