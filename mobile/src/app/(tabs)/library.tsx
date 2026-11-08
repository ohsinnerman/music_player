import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Clock3, Heart, ListMusic, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/store';
import { useDockGeometry } from '@/components/dock/geometry';
import { MediaCard } from '@/components/music/MediaCard';
import { openCreatePlaylist } from '@/components/sheets/TrackActions';
import { Artwork } from '@/components/ui/Artwork';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { EmptyState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { type LibraryPlaylist, useLikedTracks, usePlaylists, useRecentlyPlayed } from '@/library/hooks';
import { dockScrollWorklet } from '@/lib/chrome';
import { openItem } from '@/lib/nav';
import { player } from '@/player/engine';
import { colors, GUTTER, radius } from '@/theme';

type Filter = 'all' | 'playlists' | 'recent';

function LikedTile() {
  const { tracks } = useLikedTracks();
  return (
    <PressableScale onPress={() => router.push('/liked')} scaleTo={0.98} accessibilityLabel={`Liked Songs, ${tracks.length} songs`}>
      <LinearGradient colors={['#FF5A36', '#FF2D6B', '#7A1E3A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.liked}>
        <Heart size={30} color="#fff" fill="#fff" />
        <View style={{ flex: 1 }}>
          <Text variant="title2" color="#fff">
            Liked Songs
          </Text>
          <Text variant="callout" color="rgba(255,255,255,0.8)">
            {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
          </Text>
        </View>
        <Text style={styles.likedGlyph}>♥</Text>
      </LinearGradient>
    </PressableScale>
  );
}

function PlaylistRow({ p }: { p: LibraryPlaylist }) {
  return (
    <PressableScale onPress={() => openItem(p)} dim scaleTo={0.985} style={styles.row} accessibilityLabel={`${p.title}, playlist`}>
      {p.artwork?.small || p.artwork?.medium ? (
        <Artwork artwork={p.artwork} size={60} radius={radius.sm} />
      ) : (
        <View style={styles.emptyArt}>
          <ListMusic size={24} color={colors.textTertiary} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline" numberOfLines={1}>
          {p.title}
        </Text>
        <Text variant="caption" tone="secondary">
          Playlist · {p.trackCount ?? 0} songs
        </Text>
      </View>
    </PressableScale>
  );
}

export default function Library() {
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const g = useDockGeometry();
  const authed = useAuth((s) => s.status === 'authed');
  const { playlists } = usePlaylists();
  const recent = useRecentlyPlayed(30);
  const [filter, setFilter] = useState<Filter>('all');
  const last = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => dockScrollWorklet(e.contentOffset.y, last));
  const sorted = useMemo(() => [...playlists].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')), [playlists]);

  return (
    <Animated.ScrollView style={styles.root} onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: g.contentInset }}>
      <View style={styles.head}>
        <Text variant="largeTitle" style={{ flex: 1 }} accessibilityRole="header">
          Library
        </Text>
        <IconButton icon={Plus} label="New playlist" background="rgba(255,255,255,0.08)" onPress={() => openCreatePlaylist()} />
      </View>

      <View style={styles.chips}>
        <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Playlists" active={filter === 'playlists'} onPress={() => setFilter('playlists')} />
        <Chip label="Recently played" active={filter === 'recent'} onPress={() => setFilter('recent')} />
      </View>

      {!authed ? (
        <PressableScale onPress={() => router.push('/auth')} scaleTo={0.98} style={styles.syncCard}>
          <Text variant="headline">Keep your library everywhere</Text>
          <Text variant="caption" tone="secondary">
            Your likes and playlists live on this phone. Sign in to sync them to your account.
          </Text>
        </PressableScale>
      ) : null}

      {filter !== 'recent' ? (
        <View style={{ paddingHorizontal: GUTTER, marginTop: 18 }}>
          <LikedTile />
        </View>
      ) : null}

      {filter !== 'playlists' && recent.length ? (
        <View style={{ marginTop: 28 }}>
          <View style={styles.sectionHead}>
            <Clock3 size={18} color={colors.textSecondary} />
            <Text variant="title3">Recently played</Text>
          </View>
          {filter === 'recent' ? (
            <View style={styles.recentGrid}>
              {recent.map((t, i) => (
                <MediaCard key={t.id} item={t} size={(W - GUTTER * 2 - 14) / 2} onPress={() => player.playQueue(recent, i, { type: 'history', title: 'Recently played' })} />
              ))}
            </View>
          ) : (
            <FlatList
              data={recent.slice(0, 12)}
              horizontal
              keyExtractor={(t) => t.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}
              renderItem={({ item, index }) => <MediaCard item={item} size={128} onPress={() => player.playQueue(recent, index, { type: 'history', title: 'Recently played' })} />}
            />
          )}
        </View>
      ) : null}

      {filter !== 'recent' ? (
        <View style={{ marginTop: 28 }}>
          <View style={styles.sectionHead}>
            <ListMusic size={18} color={colors.textSecondary} />
            <Text variant="title3">Playlists</Text>
          </View>
          {sorted.length ? (
            sorted.map((p) => <PlaylistRow key={p.id} p={p} />)
          ) : (
            <EmptyState icon={ListMusic} title="No playlists yet" body="Long-press any song to add it to a new playlist." action={{ label: 'Create playlist', onPress: () => openCreatePlaylist() }} />
          )}
        </View>
      ) : null}

      {filter === 'recent' && !recent.length ? <EmptyState icon={Clock3} title="Nothing played yet" body="Songs you play show up here." /> : null}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: GUTTER },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: GUTTER, marginTop: 14 },
  syncCard: { marginHorizontal: GUTTER, marginTop: 16, padding: 16, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.strokeStrong, gap: 4 },
  liked: { height: 96, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, overflow: 'hidden' },
  likedGlyph: { position: 'absolute', right: -8, bottom: -38, fontSize: 130, color: 'rgba(255,255,255,0.12)' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: GUTTER, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: GUTTER, paddingVertical: 7 },
  emptyArt: { width: 60, height: 60, borderRadius: radius.sm, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  recentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: GUTTER },
});
