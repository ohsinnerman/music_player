import { Redirect, Tabs } from 'expo-router';
import { useSettings } from '@/settings/store';
import { useColors } from '@/theme';

/**
 * Tabs keep each tab's scroll position and state alive. The visible tab bar
 * is the custom <GlassDock/> rendered in the root layout, so it can float
 * over detail screens too and blur everything beneath it.
 */
export default function TabsLayout() {
  const colors = useColors();
  const onboarded = useSettings((s) => s.onboarded);
  if (!onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      tabBar={() => null}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg }, animation: 'fade', lazy: true }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
    </Tabs>
  );
}
