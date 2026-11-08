import type { LucideIcon } from 'lucide-react-native';
import { memo } from 'react';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import { useColors } from '@/theme';
import { PressableScale } from './PressableScale';

export interface IconButtonProps {
  icon: LucideIcon;
  onPress?: () => void;
  onLongPress?: () => void;
  label: string;
  size?: number;
  iconSize?: number;
  color?: string;
  fill?: string;
  background?: string;
  active?: boolean;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  haptic?: 'tap' | 'soft' | 'medium' | false;
}

/** Icon-only control with a 44dp+ touch target. */
export const IconButton = memo(function IconButton({
  icon: Icon,
  onPress,
  onLongPress,
  label,
  size = 44,
  iconSize = 22,
  color,
  fill,
  background,
  active,
  strokeWidth = 2,
  style,
  disabled,
  haptic = 'tap',
}: IconButtonProps) {
  const colors = useColors();
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      hapticOnPress={haptic}
      scaleTo={0.88}
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      hitSlop={Math.max(0, (44 - size) / 2)}
      style={[styles.base, { width: size, height: size, borderRadius: size / 2, backgroundColor: background, opacity: disabled ? 0.4 : 1 }, style]}
    >
      <Icon size={iconSize} color={active ? colors.accent : (color ?? colors.text)} fill={fill ?? 'transparent'} strokeWidth={strokeWidth} />
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
