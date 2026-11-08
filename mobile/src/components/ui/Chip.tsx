import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { colors, radius } from '@/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export const Chip = memo(function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      hapticOnPress="tap"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active ? styles.active : styles.idle]}
    >
      <Text variant="callout" color={active ? '#0B0B0F' : colors.text} style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}>
        {label}
      </Text>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  chip: { height: 36, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  idle: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.strokeStrong },
  active: { backgroundColor: colors.text },
});
