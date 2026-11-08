import { memo } from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { colors, type TypeVariant, type } from '@/theme';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: string;
  tone?: 'primary' | 'secondary' | 'tertiary' | 'accent';
  align?: 'left' | 'center' | 'right';
}

const toneColor = {
  primary: colors.text,
  secondary: colors.textSecondary,
  tertiary: colors.textTertiary,
  accent: colors.accent,
} as const;

export const Text = memo(function Text({ variant = 'body', color, tone = 'primary', align, style, ...rest }: AppTextProps) {
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={1.35}
      {...rest}
      style={[type[variant], { color: color ?? toneColor[tone] }, align ? { textAlign: align } : null, style]}
    />
  );
});
