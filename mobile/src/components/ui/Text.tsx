import { memo } from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { type, type TypeVariant, useColors } from '@/theme';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: string;
  tone?: 'primary' | 'secondary' | 'tertiary' | 'accent';
  align?: 'left' | 'center' | 'right';
}

export const Text = memo(function Text({ variant = 'body', color, tone = 'primary', align, style, ...rest }: AppTextProps) {
  const c = useColors();
  const toneColor = { primary: c.text, secondary: c.textSecondary, tertiary: c.textTertiary, accent: c.accent } as const;
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={1.35}
      {...rest}
      style={[type[variant], { color: color ?? toneColor[tone] }, align ? { textAlign: align } : null, style]}
    />
  );
});
