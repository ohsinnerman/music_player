import { StyleSheet, TextInput, type TextStyle } from 'react-native';
import Animated, { type SharedValue, useAnimatedProps } from 'react-native-reanimated';
import { colors, type TypeVariant, type } from '@/theme';

const ATextInput = Animated.createAnimatedComponent(TextInput);

/**
 * Text driven by a shared value on the UI thread (no React re-renders).
 * Used for the scrubber's running clock.
 */
export function ReText({ text, variant = 'footnote', color = colors.textSecondary, style }: { text: SharedValue<string>; variant?: TypeVariant; color?: string; style?: TextStyle }) {
  const props = useAnimatedProps(() => ({ text: text.value, defaultValue: text.value }) as never);
  return (
    <ATextInput
      underlineColorAndroid="transparent"
      editable={false}
      pointerEvents="none"
      animatedProps={props}
      style={[type[variant], styles.base, { color, fontVariant: ['tabular-nums'] }, style]}
    />
  );
}

const styles = StyleSheet.create({
  base: { padding: 0, margin: 0 },
});
