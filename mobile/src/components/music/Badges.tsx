import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme';
import { Text } from '../ui/Text';

export const ExplicitBadge = memo(function ExplicitBadge() {
  return (
    <View style={styles.e} accessibilityLabel="Explicit">
      <Text variant="label" style={styles.eText} color="#0B0B0F">
        E
      </Text>
    </View>
  );
});

/** Marks 30-second previews so nobody wonders why a song stopped. */
export const PreviewBadge = memo(function PreviewBadge() {
  return (
    <View style={styles.p} accessibilityLabel="30 second preview">
      <Text variant="label" style={styles.pText} tone="secondary">
        Preview
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  e: { width: 15, height: 15, borderRadius: 3, backgroundColor: 'rgba(245,245,247,0.6)', alignItems: 'center', justifyContent: 'center' },
  eText: { fontSize: 9, lineHeight: 11, letterSpacing: 0 },
  p: { paddingHorizontal: 5, height: 15, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.strokeStrong, justifyContent: 'center' },
  pText: { fontSize: 8.5, lineHeight: 11, letterSpacing: 0.6 },
});
