import { router } from 'expo-router';
import { Search } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGenres, useHome } from '@/api/queries';
import { useDockGeometry } from '@/components/dock/geometry';
import { ChartList, GenreGrid, Shelf } from '@/components/music/Shelves';
import { PressableScale } from '@/components/ui/PressableScale';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { dockScrollWorklet } from '@/lib/chrome';
import { GUTTER, makeStyles, radius, useColors } from '@/theme';

const AScroll = Animated.createAnimatedComponent(ScrollView);

export default function Explore() {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const g = useDockGeometry();
  const genres = useGenres();
  const home = useHome();
  const last = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => dockScrollWorklet(e.contentOffset.y, last));

  const sections = home.data ?? [];
  const chart = sections.find((s) => s.layout === 'chart');
  const shelves = sections.filter((s) => ['deezer-new', 'deezer-playlists', 'audius-playlists', 'audius-underground', 'jamendo-albums'].includes(s.id));

  return (
    <AScroll style={styles.root} onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: g.contentInset }}>
      <View style={styles.head}>
        <Text variant="largeTitle" accessibilityRole="header">
          Explore
        </Text>
        <Text variant="serifTitle" tone="secondary" style={{ fontSize: 22, lineHeight: 26 }}>
          find your next obsession
        </Text>
      </View>

      <PressableScale onPress={() => router.push('/search')} scaleTo={0.98} style={styles.search} accessibilityLabel="Search songs, artists and albums">
        <Search size={20} color={colors.textInverse} strokeWidth={2.5} />
        <Text variant="headline" color={colors.textInverse} style={{ opacity: 0.7 }}>
          Songs, artists, albums…
        </Text>
      </PressableScale>

      <View style={styles.block}>
        {genres.isLoading ? (
          <View style={styles.genreSkeleton}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} width="48%" height={96} r={radius.md} />
            ))}
          </View>
        ) : genres.error ? (
          <ErrorState error={genres.error} onRetry={genres.refetch} />
        ) : (
          <GenreGrid genres={genres.data ?? []} title="Moods & genres" />
        )}
      </View>

      {chart ? (
        <View style={styles.block}>
          <ChartList section={chart} initial={10} />
        </View>
      ) : null}

      {shelves.map((s) => (
        <View key={s.id} style={styles.block}>
          <Shelf section={s} />
        </View>
      ))}
    </AScroll>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: GUTTER, gap: 2 },
  search: {
    marginHorizontal: GUTTER,
    marginTop: 18,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.text,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  block: { marginTop: 30 },
  genreSkeleton: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: GUTTER, justifyContent: 'space-between' },
}));
