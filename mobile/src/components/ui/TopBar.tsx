import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles, useColors } from '@/theme';
import { Glass } from './Glass';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

/**
 * Floating top bar for detail pages: a glass back button that's always
 * there, and a frosted bar + title that fade in once you scroll past the hero.
 */
export function TopBar({ scrollY, title, threshold = 260, right }: { scrollY: SharedValue<number>; title: string; threshold?: number; right?: ReactNode }) {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const barStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [threshold - 80, threshold], [0, 1], 'clamp') }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [threshold - 20, threshold + 20], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(scrollY.value, [threshold - 20, threshold + 20], [8, 0], 'clamp') }],
  }));
  const btnBg = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [threshold - 80, threshold], [1, 0], 'clamp') }));

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingTop: insets.top, height: insets.top + 56 }]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, barStyle]}>
        <Glass variant="inline" radius={0} intensity={50} rim={false} style={StyleSheet.absoluteFill} />
        <View style={styles.hairline} />
      </Animated.View>
      <View style={styles.row} pointerEvents="box-none">
        <PressableScale onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} scaleTo={0.88} hapticOnPress="tap" accessibilityLabel="Back" style={styles.back}>
          <Animated.View style={[StyleSheet.absoluteFill, btnBg]}>
            <Glass radius={20} intensity={40} variant="inline" style={StyleSheet.absoluteFill} />
          </Animated.View>
          <View>
            <ChevronLeft size={26} color={colors.text} strokeWidth={2.4} style={{ marginLeft: -2 }} />
          </View>
        </PressableScale>
        <Animated.View style={[styles.title, titleStyle]} pointerEvents="none">
          <Text variant="headline" numberOfLines={1} align="center">
            {title}
          </Text>
        </Animated.View>
        <View style={styles.right}>{right}</View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 10 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, paddingHorizontal: 12 },
  right: { minWidth: 40, alignItems: 'flex-end' },
  hairline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.stroke },
}));
