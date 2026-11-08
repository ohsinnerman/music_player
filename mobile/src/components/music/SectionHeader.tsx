import { ChevronRight } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, GUTTER } from '@/theme';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';

export const SectionHeader = memo(function SectionHeader({
  title,
  subtitle,
  onSeeAll,
  seeAllLabel = 'See all',
}: {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
}) {
  return (
    <View style={styles.wrap}>
      <View style={{ flex: 1 }}>
        {subtitle ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1} style={{ marginBottom: 2 }}>
            {subtitle}
          </Text>
        ) : null}
        <Text variant="title2" numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {onSeeAll ? (
        <PressableScale onPress={onSeeAll} hitSlop={10} style={styles.more} accessibilityLabel={`${seeAllLabel}: ${title}`}>
          <Text variant="callout" tone="secondary">
            {seeAllLabel}
          </Text>
          <ChevronRight size={16} color={colors.textSecondary} />
        </PressableScale>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: GUTTER, marginBottom: 14, gap: 12 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 3 },
});
