import { type ReactNode, memo } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import { PRESS_SCALE, spring } from '@/theme';

const APressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  /** Dim slightly while pressed, in addition to scaling. */
  dim?: boolean;
  hapticOnPress?: 'tap' | 'soft' | 'medium' | false;
}

/**
 * The one press interaction used everywhere: a quick spring down to ~96.5%
 * and back. Runs entirely on the UI thread.
 */
export const PressableScale = memo(function PressableScale({
  children,
  style,
  scaleTo = PRESS_SCALE,
  dim = false,
  hapticOnPress = false,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: PressableScaleProps) {
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scaleTo) * pressed.value }],
    opacity: dim ? 1 - pressed.value * 0.25 : 1,
  }));

  return (
    <APressable
      accessibilityRole="button"
      {...rest}
      onPressIn={(e) => {
        pressed.value = withSpring(1, spring.snappy);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withSpring(0, spring.snappy);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (hapticOnPress) haptic[hapticOnPress]();
        onPress?.(e);
      }}
      style={[style, animated]}
    >
      {children}
    </APressable>
  );
});
