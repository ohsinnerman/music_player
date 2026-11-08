import type { LucideIcon } from 'lucide-react-native';
import { memo } from 'react';
import { ActivityIndicator, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { type ColorTokens, radius, useColors } from '@/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'light' | 'danger';
  size?: 'md' | 'lg';
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export const Button = memo(function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading,
  disabled,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const v = variants(useColors())[variant];
  const h = size === 'lg' ? 54 : 46;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      hapticOnPress="tap"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={[styles.base, { height: h, backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.45 : 1 }, style]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.row}>
          {Icon ? <Icon size={18} color={v.fg} strokeWidth={2.4} /> : null}
          <Text variant="headline" color={v.fg} style={{ fontSize: size === 'lg' ? 16 : 15 }}>
            {title}
          </Text>
        </View>
      )}
    </PressableScale>
  );
});

const variants = (colors: ColorTokens) => ({
  primary: { bg: colors.accent, fg: colors.onAccent, border: 'transparent' },
  light: { bg: colors.text, fg: colors.textInverse, border: 'transparent' },
  secondary: { bg: colors.fillStrong, fg: colors.text, border: colors.strokeStrong },
  ghost: { bg: 'transparent', fg: colors.text, border: 'transparent' },
  danger: { bg: colors.accentSoft, fg: colors.danger, border: colors.strokeStrong },
});

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
