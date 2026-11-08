import { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import type { AppTextProps } from './Text';
import { Text } from './Text';

/** Single-line text that gently scrolls when it doesn't fit (like Apple Music's now-playing title). */
export const Marquee = memo(function Marquee({ children, ...textProps }: AppTextProps & { children: string }) {
  const [box, setBox] = useState(0);
  const [content, setContent] = useState(0);
  const x = useSharedValue(0);
  const overflow = content - box;

  useEffect(() => {
    cancelAnimation(x);
    x.value = 0;
    if (box > 0 && overflow > 4) {
      const distance = content + 32;
      const duration = distance * 32;
      x.value = withDelay(
        1800,
        withRepeat(
          withSequence(withTiming(-distance, { duration, easing: Easing.linear }), withDelay(1800, withTiming(0, { duration: 0 }))),
          -1,
          false,
        ),
      );
    }
    return () => cancelAnimation(x);
  }, [overflow, box, content, children, x]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={styles.clip} onLayout={(e) => setBox(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.row, style]}>
        <Text {...textProps} numberOfLines={1} onLayout={(e) => setContent(e.nativeEvent.layout.width)} style={[textProps.style, styles.nowrap]}>
          {children}
        </Text>
        {overflow > 4 ? (
          <Text {...textProps} numberOfLines={1} style={[textProps.style, styles.nowrap, { marginLeft: 32 }]} accessibilityElementsHidden importantForAccessibility="no">
            {children}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', width: '100%' },
  row: { flexDirection: 'row', width: 4000 },
  nowrap: { flexShrink: 0 },
});
