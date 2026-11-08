import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { makeStyles, radius, useColors } from '@/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export const Chip = memo(function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <PressableScale
      onPress={onPress}
      hapticOnPress="tap"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active ? styles.active : styles.idle]}
    >
      <Text variant="callout" color={active ? colors.textInverse : colors.text} style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}>
        {label}
      </Text>
    </PressableScale>
  );
});

const useStyles = makeStyles((colors) => ({
  chip: { height: 36, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  idle: { backgroundColor: colors.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.strokeStrong },
  active: { backgroundColor: colors.text },
}));
