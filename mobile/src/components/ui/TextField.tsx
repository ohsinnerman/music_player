import { Eye, EyeOff } from 'lucide-react-native';
import { type ComponentRef, forwardRef, useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, fonts, radius } from '@/theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  secure?: boolean;
}

export const TextField = forwardRef<ComponentRef<typeof TextInput>, TextFieldProps>(function TextField({ label, error, secure, style, onFocus, onBlur, ...rest }, ref) {
  const [hidden, setHidden] = useState(!!secure);
  const focus = useSharedValue(0);
  const ring = useAnimatedStyle(() => ({
    borderColor: error ? colors.danger : focus.value ? 'rgba(255,255,255,0.32)' : colors.strokeStrong,
    backgroundColor: focus.value ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.05)',
  }));

  return (
    <View style={{ gap: 6 }}>
      <Text variant="footnote" tone="secondary" style={{ marginLeft: 4 }}>
        {label}
      </Text>
      <Animated.View style={[styles.box, ring]}>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          secureTextEntry={hidden}
          accessibilityLabel={label}
          onFocus={(e) => {
            focus.value = withTiming(1, { duration: 140 });
            onFocus?.(e);
          }}
          onBlur={(e) => {
            focus.value = withTiming(0, { duration: 160 });
            onBlur?.(e);
          }}
          {...rest}
          style={[styles.input, style]}
        />
        {secure ? (
          <IconButton icon={hidden ? Eye : EyeOff} label={hidden ? 'Show password' : 'Hide password'} size={40} iconSize={18} color={colors.textSecondary} onPress={() => setHidden((h) => !h)} />
        ) : null}
      </Animated.View>
      {error ? (
        <Text variant="footnote" color={colors.danger} style={{ marginLeft: 4 }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingLeft: 16,
    paddingRight: 4,
    minHeight: 52,
  },
  input: { flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 16, paddingVertical: 12, outlineWidth: 0 },
});
