import { type ReactNode, useCallback, useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { create } from 'zustand';
import { colors, spring } from '@/theme';
import { Glass } from './Glass';

type Render = (close: () => void) => ReactNode;
const useSheetStore = create<{ render: Render | null; open: boolean; id: number }>()(() => ({ render: null, open: false, id: 0 }));

/** Open a bottom sheet. Only one sheet at a time; opening replaces the current one. */
export function openSheet(render: Render) {
  useSheetStore.setState((s) => ({ render, open: true, id: s.id + 1 }));
}
export function closeSheet() {
  useSheetStore.setState({ open: false });
}

export function SheetHost() {
  const { render, open, id } = useSheetStore();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const y = useSharedValue(height);
  const shown = useSharedValue(0);

  const clear = useCallback(() => useSheetStore.setState({ render: null }), []);

  useEffect(() => {
    if (open && render) {
      y.value = height;
      y.value = withSpring(0, spring.sheet);
      shown.value = withTiming(1, { duration: 220 });
    } else if (render) {
      shown.value = withTiming(0, { duration: 200 });
      y.value = withTiming(height, { duration: 240 }, (done) => {
        if (done) scheduleOnRN(clear);
      });
    }
  }, [open, id, render, height, y, shown, clear]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeSheet();
      return true;
    });
    return () => sub.remove();
  }, [open]);

  const pan = usePanGesture({
    activeOffsetY: 8,
    onUpdate: (e) => {
      'worklet';
      y.value = Math.max(0, e.translationY);
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 900) {
        scheduleOnRN(closeSheet);
      } else {
        y.value = withSpring(0, spring.sheet);
      }
    },
  });

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: shown.value * interpolate(y.value, [0, 400], [1, 0.3], 'clamp') }));

  if (!render) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} accessibilityLabel="Close" />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.panelWrap, panelStyle]}>
          <Glass radius={32} intensity={70} style={[styles.panel, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.handle} />
            {render(closeSheet)}
          </Glass>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.5)' },
  panelWrap: { position: 'absolute', left: 8, right: 8, bottom: 8 },
  panel: { paddingTop: 10, backgroundColor: 'rgba(16,16,21,0.6)' },
  handle: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: colors.strokeStrong, marginBottom: 8 },
});
