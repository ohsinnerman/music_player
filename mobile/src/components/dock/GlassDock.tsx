import { router, usePathname } from 'expo-router';
import { Compass, House, Library, type LucideIcon, Search } from 'lucide-react-native';
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { create } from 'zustand';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { chrome } from '@/lib/chrome';
import { goTab } from '@/lib/nav';
import { fonts, makeStyles, spring, useColors } from '@/theme';
import { Glass } from '../ui/Glass';
import { PressableScale } from '../ui/PressableScale';
import { useDockGeometry } from './geometry';

const TABS: { key: 'index' | 'explore' | 'library'; label: string; icon: LucideIcon; path: string }[] = [
  { key: 'index', label: 'Home', icon: House, path: '/' },
  { key: 'explore', label: 'Explore', icon: Compass, path: '/explore' },
  { key: 'library', label: 'Library', icon: Library, path: '/library' },
];

const HIDDEN_ON = ['/onboarding', '/auth', '/settings'];

/** The tab to highlight while a detail page (album, artist…) is on top. */
const useLastTab = create<{ index: number }>()(() => ({ index: 0 }));

function tabIndexFor(path: string): number | null {
  if (path === '/' || path === '/index') return 0;
  if (path.startsWith('/explore')) return 1;
  if (path.startsWith('/library')) return 2;
  return null;
}

const TabButton = memo(function TabButton({ i, active, onPress, width }: { i: number; active: boolean; onPress: () => void; width: number }) {
  const colors = useColors();
  const styles = useStyles();
  const t = TABS[i]!;
  const Icon = t.icon;
  const style = useAnimatedStyle(() => {
    const c = chrome.dockCollapsed.value;
    // Collapsed: only the active tab stays, centred in the circle.
    return { opacity: active ? 1 : 1 - Math.min(1, c * 2.5) };
  });
  const labelStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, chrome.dockCollapsed.value * 3),
    height: interpolate(chrome.dockCollapsed.value, [0, 1], [14, 0], 'clamp'),
  }));
  return (
    <Animated.View style={[{ width }, style]}>
      <PressableScale onPress={onPress} scaleTo={0.9} hapticOnPress="tap" accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: active }} style={styles.tab}>
        <Icon size={23} color={active ? colors.text : colors.textSecondary} strokeWidth={active ? 2.4 : 2} />
        <Animated.Text numberOfLines={1} style={[styles.tabLabel, { color: active ? colors.text : colors.textSecondary }, labelStyle]}>
          {t.label}
        </Animated.Text>
      </PressableScale>
    </Animated.View>
  );
});

/**
 * Floating Liquid-Glass dock (iOS 26 style): a tab pill with a sliding
 * glass lens, a separate search button, and room above for the mini player.
 * Scrolling down shrinks the pill to a single circle and the mini player
 * slides down beside it.
 */
export function GlassDock() {
  const colors = useColors();
  const styles = useStyles();
  const g = useDockGeometry();
  const path = usePathname();
  const current = tabIndexFor(path);
  const lastTab = useLastTab((st) => st.index);
  useEffect(() => {
    if (current !== null) useLastTab.setState({ index: current });
  }, [current]);
  const active = current ?? lastTab;
  const hidden = HIDDEN_ON.some((p) => path.startsWith(p));

  const lensX = useSharedValue(active);
  const stretch = useSharedValue(0);
  useEffect(() => {
    lensX.value = withSpring(active, spring.liquid);
    // A brief horizontal stretch while the lens travels: the "liquid" part.
    stretch.value = withSequence(withTiming(1, { duration: 110 }), withSpring(0, spring.liquid));
    chrome.dockCollapsed.value = withSpring(0, spring.smooth);
  }, [active, lensX, stretch, path]);

  const tabW = (g.pillW - 8) / 3;

  const wrapStyle = useAnimatedStyle(() => {
    const p = chrome.playerProgress.value;
    return {
      opacity: hidden ? 0 : 1 - Math.min(1, p * 1.6),
      transform: [{ translateY: hidden ? 140 : p * 120 }],
    };
  });

  const pillStyle = useAnimatedStyle(() => {
    const c = chrome.dockCollapsed.value;
    return { width: interpolate(c, [0, 1], [g.pillW, g.circle], 'clamp') };
  });

  // Inner row slides so the active tab ends up centred in the circle when collapsed.
  const rowStyle = useAnimatedStyle(() => {
    const c = chrome.dockCollapsed.value;
    const activeCenter = 4 + lensX.value * tabW + tabW / 2;
    return { transform: [{ translateX: interpolate(c, [0, 1], [0, g.circle / 2 - activeCenter], 'clamp') }] };
  });

  const lensStyle = useAnimatedStyle(() => {
    const c = chrome.dockCollapsed.value;
    const w = interpolate(c, [0, 1], [tabW, g.circle - 8], 'clamp');
    const x = interpolate(c, [0, 1], [4 + lensX.value * tabW, 4], 'clamp');
    return {
      width: w,
      transform: [{ translateX: x }, { scaleX: 1 + stretch.value * 0.14 }, { scaleY: 1 - stretch.value * 0.06 }],
    };
  });

  const searchStyle = useAnimatedStyle(() => {
    const c = chrome.dockCollapsed.value;
    return { opacity: 1 - Math.min(1, c * 2), transform: [{ scale: 1 - c * 0.4 }] };
  });

  return (
    <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[StyleSheet.absoluteFill, wrapStyle]}>
      <Animated.View style={[styles.pillWrap, { left: g.M, top: g.tabY, height: g.TAB_H }, pillStyle]}>
        <Glass radius={g.TAB_H / 2} intensity={45} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: g.TAB_H / 2 }]}>
          <Animated.View style={[styles.lens, { height: g.TAB_H - 8 }, lensStyle]} />
          <Animated.View style={[styles.row, rowStyle]}>
            {TABS.map((t, i) => (
              <TabButton
                key={t.key}
                i={i}
                width={tabW}
                active={i === active}
                onPress={() => {
                  if (chrome.dockCollapsed.value > 0.5 && i === active) {
                    chrome.dockCollapsed.value = withSpring(0, spring.smooth);
                    return;
                  }
                  goTab(t.key);
                }}
              />
            ))}
          </Animated.View>
        </View>
      </Animated.View>

      <Animated.View style={[styles.searchWrap, { left: g.W - g.M - g.circle, top: g.tabY, width: g.circle, height: g.circle }, searchStyle]}>
        <PressableScale onPress={() => router.push('/search')} scaleTo={0.9} hapticOnPress="tap" accessibilityLabel="Search" style={StyleSheet.absoluteFill}>
          <Glass radius={g.circle / 2} intensity={45} style={[StyleSheet.absoluteFill, styles.center]}>
            <View>
              <Search size={23} color={path.startsWith('/search') ? colors.text : colors.textSecondary} strokeWidth={2.2} />
            </View>
          </Glass>
        </PressableScale>
      </Animated.View>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  pillWrap: { position: 'absolute', borderRadius: 999 },
  row: { flexDirection: 'row', paddingHorizontal: 4, height: '100%', alignItems: 'center' },
  lens: {
    position: 'absolute',
    top: 4,
    left: 0,
    borderRadius: 999,
    backgroundColor: colors.fillStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineLight,
  },
  tab: { alignItems: 'center', justifyContent: 'center', height: 54, gap: 3 },
  tabLabel: { fontFamily: fonts.semibold, fontSize: 10.5, letterSpacing: 0.1 },
  searchWrap: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center' },
}));
