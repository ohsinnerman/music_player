import { router } from 'expo-router';
import { ChevronLeft, Clock3, Play, Search as SearchIcon, X } from 'lucide-react-native';
import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGenres, useSearch } from '@/api/queries';
import type { Album, Artist, CatalogItem, Playlist, SearchResults, Track } from '@/api/types';
import { useDockGeometry } from '@/components/dock/geometry';
import { MediaCard } from '@/components/music/MediaCard';
import { SectionHeader } from '@/components/music/SectionHeader';
import { GenreGrid } from '@/components/music/Shelves';
import { TrackRow } from '@/components/music/TrackRow';
import { Artwork } from '@/components/ui/Artwork';
import { Chip } from '@/components/ui/Chip';
import { Glass } from '@/components/ui/Glass';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { dockScrollWorklet } from '@/lib/chrome';
import { artistNames } from '@/lib/format';
import { openItem } from '@/lib/nav';
import { player } from '@/player/engine';
import { useSettings } from '@/settings/store';
import { colors, fonts, GUTTER, radius } from '@/theme';

type Filter = 'all' | 'songs' | 'artists' | 'albums' | 'playlists';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Top' },
  { key: 'songs', label: 'Songs' },
  { key: 'artists', label: 'Artists' },
  { key: 'albums', label: 'Albums' },
  { key: 'playlists', label: 'Playlists' },
];

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function TopResult({ item, tracks, onPick }: { item: CatalogItem; tracks: Track[]; onPick: () => void }) {
  if (item.kind === 'genre') return null;
  const isArtist = item.kind === 'artist';
  const title = isArtist ? item.name : item.title;
  const sub = item.kind === 'artist' ? 'Artist' : item.kind === 'track' ? `Song · ${artistNames(item)}` : item.kind === 'album' ? `Album · ${artistNames(item)}` : 'Playlist';
  const artwork = isArtist ? item.image : item.artwork;
  const play = () => {
    onPick();
    if (item.kind === 'track') void player.playQueue(tracks, Math.max(0, tracks.findIndex((t) => t.id === item.id)), { type: 'search', title: 'Search' });
    else openItem(item);
  };
  return (
    <PressableScale onPress={play} scaleTo={0.98} style={styles.top} accessibilityLabel={`Top result: ${title}, ${sub}`}>
      <Artwork artwork={artwork} size={92} round={isArtist} radius={radius.sm} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="title2" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="callout" tone="secondary" numberOfLines={1}>
          {sub}
        </Text>
      </View>
      {item.kind === 'track' ? (
        <View style={styles.topPlay}>
          <Play size={20} color="#fff" fill="#fff" />
        </View>
      ) : null}
    </PressableScale>
  );
}

function Results({ data, filter, onPick }: { data: SearchResults; filter: Filter; onPick: () => void }) {
  const { width: W } = useWindowDimensions();
  const ctx = { type: 'search' as const, title: `“${data.query}”` };
  const playAt = (i: number) => {
    onPick();
    void player.playQueue(data.tracks, i, ctx);
  };
  const half = (W - GUTTER * 2 - 14) / 2;
  const grid = (items: (Album | Playlist)[]) => (
    <View style={styles.grid}>
      {items.map((a) => (
        <MediaCard
          key={a.id}
          item={a}
          size={half}
          onPress={() => {
            onPick();
            openItem(a);
          }}
        />
      ))}
    </View>
  );
  const nothing = !data.tracks.length && !data.artists.length && !data.albums.length && !data.playlists.length;
  if (nothing) return <EmptyState icon={SearchIcon} title={`No results for “${data.query}”`} body="Check the spelling, or try fewer words." />;

  if (filter === 'songs') return <>{data.tracks.map((t, i) => <TrackRow key={t.id} track={t} onPress={() => playAt(i)} />)}</>;
  if (filter === 'artists')
    return (
      <>
        {data.artists.map((a: Artist) => (
          <PressableScale
            key={a.id}
            onPress={() => {
              onPick();
              openItem(a);
            }}
            dim
            scaleTo={0.985}
            style={styles.artistRow}
          >
            <Artwork artwork={a.image} size={56} round />
            <Text variant="headline" style={{ flex: 1 }} numberOfLines={1}>
              {a.name}
            </Text>
          </PressableScale>
        ))}
      </>
    );
  if (filter === 'albums') return grid(data.albums);
  if (filter === 'playlists') return grid(data.playlists);

  return (
    <View style={{ gap: 26 }}>
      {data.top ? <TopResult item={data.top} tracks={data.tracks} onPick={onPick} /> : null}
      {data.tracks.length ? (
        <View>
          <SectionHeader title="Songs" />
          {data.tracks.slice(0, 5).map((t, i) => (
            <TrackRow key={t.id} track={t} onPress={() => playAt(i)} />
          ))}
        </View>
      ) : null}
      {data.artists.length ? (
        <View>
          <SectionHeader title="Artists" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 16 }}>
            {data.artists.map((a) => (
              <MediaCard
                key={a.id}
                item={a}
                size={104}
                onPress={() => {
                  onPick();
                  openItem(a);
                }}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
      {data.albums.length ? (
        <View>
          <SectionHeader title="Albums" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}>
            {data.albums.map((a) => (
              <MediaCard
                key={a.id}
                item={a}
                size={140}
                onPress={() => {
                  onPick();
                  openItem(a);
                }}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
      {data.playlists.length ? (
        <View>
          <SectionHeader title="Playlists" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}>
            {data.playlists.map((a) => (
              <MediaCard
                key={a.id}
                item={a}
                size={140}
                onPress={() => {
                  onPick();
                  openItem(a);
                }}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const g = useDockGeometry();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const q = useDebounced(text, 280);
  const search = useSearch(q);
  const genres = useGenres();
  const { recentSearches, pushRecentSearch, clearRecentSearches } = useSettings();
  const last = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => dockScrollWorklet(e.contentOffset.y, last));

  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const showResults = q.trim().length > 0;
  const onPick = useMemo(() => () => pushRecentSearch(q), [q, pushRecentSearch]);

  return (
    <View style={styles.root}>
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <IconButton icon={ChevronLeft} label="Back" iconSize={26} onPress={() => router.back()} />
        <Glass radius={radius.pill} variant="inline" style={styles.field}>
          <View style={styles.fieldRow}>
            <SearchIcon size={19} color={colors.textSecondary} strokeWidth={2.4} />
            <TextInput
              ref={input}
              value={text}
              onChangeText={setText}
              placeholder="What do you want to hear?"
              placeholderTextColor={colors.textTertiary}
              selectionColor={colors.accent}
              cursorColor={colors.accent}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              maxLength={100}
              onSubmitEditing={() => {
                pushRecentSearch(text);
                Keyboard.dismiss();
              }}
              style={styles.input}
              accessibilityLabel="Search"
            />
            {search.isFetching && showResults ? <ActivityIndicator size="small" color={colors.textSecondary} /> : null}
            {text ? <IconButton icon={X} label="Clear search" size={32} iconSize={16} background="rgba(255,255,255,0.12)" onPress={() => setText('')} /> : null}
          </View>
        </Glass>
      </View>

      {showResults ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsWrap} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          {FILTERS.map((f) => (
            <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </ScrollView>
      ) : null}

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 10, paddingBottom: g.contentInset }}
      >
        {showResults ? (
          search.isLoading ? (
            <ListSkeleton />
          ) : search.error ? (
            <ErrorState error={search.error} onRetry={search.refetch} />
          ) : search.data ? (
            <Animated.View entering={FadeIn.duration(180)} key={`${q}-${filter}`}>
              <Results data={search.data} filter={filter} onPick={onPick} />
            </Animated.View>
          ) : null
        ) : (
          <View style={{ gap: 28 }}>
            {recentSearches.length ? (
              <View>
                <SectionHeader title="Recent searches" onSeeAll={clearRecentSearches} seeAllLabel="Clear" />
                {recentSearches.map((r) => (
                  <PressableScale key={r} onPress={() => setText(r)} dim scaleTo={0.99} style={styles.recent}>
                    <Clock3 size={18} color={colors.textTertiary} />
                    <Text variant="body" style={{ flex: 1, fontFamily: fonts.semibold }} numberOfLines={1}>
                      {r}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            ) : null}
            {genres.data ? <GenreGrid genres={genres.data} title="Browse all" /> : null}
          </View>
        )}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingRight: GUTTER, gap: 4 },
  field: { flex: 1, height: 48 },
  fieldRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 8 },
  input: { flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 16, paddingVertical: 0, outlineWidth: 0 },
  chipsWrap: { flexGrow: 0, flexShrink: 0, height: 52, marginTop: 6 },
  chips: { paddingHorizontal: GUTTER, gap: 8, alignItems: 'center' },
  top: { marginHorizontal: GUTTER, padding: 16, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', alignItems: 'center', gap: 16 },
  topPlay: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: GUTTER, rowGap: 20 },
  artistRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: GUTTER, paddingVertical: 8 },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: GUTTER, height: 48 },
});
