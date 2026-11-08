import { router } from 'expo-router';
import { Settings2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHome } from '@/api/queries';
import type { Section } from '@/api/types';
import { useAuth } from '@/auth/store';
import { useDockGeometry } from '@/components/dock/geometry';
import { RecentGrid } from '@/components/music/RecentGrid';
import { SectionView } from '@/components/music/Shelves';
import { PressableScale } from '@/components/ui/PressableScale';
import { HomeSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useRecentlyPlayed } from '@/library/hooks';
import { dockScrollWorklet } from '@/lib/chrome';
import { greeting } from '@/lib/format';
import { GUTTER, fonts, makeStyles, useColors } from '@/theme';

function Avatar() {
  const colors = useColors();
  const styles = useStyles();
  const user = useAuth((s) => s.user);
  const initial = user?.displayName?.trim().charAt(0).toUpperCase();
  return (
    <PressableScale onPress={() => router.push('/settings')} scaleTo={0.9} hapticOnPress="tap" accessibilityLabel="Profile and settings" style={styles.avatar}>
      {initial ? (
        <Text variant="title3" style={{ fontFamily: fonts.extrabold }}>
          {initial}
        </Text>
      ) : (
        <Settings2 size={20} color={colors.text} />
      )}
    </PressableScale>
  );
}

function Header() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const name = useAuth((s) => s.user?.displayName?.split(' ')[0]);
  return (
    <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
      <View style={{ flex: 1 }}>
        <Text variant="display" style={{ fontSize: 40, lineHeight: 44 }}>
          {greeting()}
          {name ? ',' : ''}
        </Text>
        {name ? (
          <Text variant="largeTitle" style={{ marginTop: -2 }}>
            {name}
          </Text>
        ) : null}
      </View>
      <Avatar />
    </View>
  );
}

type Row = { type: 'section'; section: Section } | { type: 'recent' };

export default function Home() {
  const colors = useColors();
  const styles = useStyles();
  const { data, isLoading, error, refetch } = useHome();
  const recent = useRecentlyPlayed(6);
  const g = useDockGeometry();
  const [refreshing, setRefreshing] = useState(false);
  const last = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => dockScrollWorklet(e.contentOffset.y, last));

  const rows: Row[] = [];
  (data ?? []).forEach((s, i) => {
    rows.push({ type: 'section', section: s });
    // "Jump back in" goes right after the hero.
    if (i === 0 && recent.length >= 2) rows.push({ type: 'recent' });
  });
  if (!data?.length && recent.length >= 2) rows.unshift({ type: 'recent' });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <Animated.FlatList
      style={styles.root}
      data={rows}
      keyExtractor={(r) => (r.type === 'recent' ? 'recent' : r.section.id)}
      renderItem={({ item }) => (
        <Animated.View entering={FadeIn.duration(260)} style={styles.section}>
          {item.type === 'recent' ? <RecentGrid tracks={recent} /> : <SectionView section={item.section} />}
        </Animated.View>
      )}
      ListHeaderComponent={<Header />}
      ListEmptyComponent={isLoading ? <HomeSkeleton /> : error ? <ErrorState error={error} onRetry={refetch} /> : undefined}
      ListFooterComponent={<View style={{ height: g.contentInset }} />}
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      initialNumToRender={3}
      windowSize={7}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} colors={[colors.accent]} progressBackgroundColor={colors.surfaceHigh} />}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: GUTTER, paddingBottom: 18 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginTop: 6,
    backgroundColor: colors.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.strokeStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { marginBottom: 34 },
}));
