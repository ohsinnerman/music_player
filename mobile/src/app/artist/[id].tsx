import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { BadgeCheck, Radio, Shuffle } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useArtist } from '@/api/queries';
import type { Album } from '@/api/types';
import { useDockGeometry } from '@/components/dock/geometry';
import { MediaCard } from '@/components/music/MediaCard';
import { SectionHeader } from '@/components/music/SectionHeader';
import { TrackRow } from '@/components/music/TrackRow';
import { PlayPauseIcon } from '@/components/player/Controls';
import { PressableScale } from '@/components/ui/PressableScale';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { endpoints } from '@/api/endpoints';
import { toast } from '@/components/ui/Toast';
import { dockScrollWorklet } from '@/lib/chrome';
import { art, compactNumber } from '@/lib/format';
import { openItem } from '@/lib/nav';
import { player } from '@/player/engine';
import { usePlayer } from '@/player/store';
import { alpha } from '@/lib/palette';
import { GUTTER, makeStyles, radius, useColors } from '@/theme';

function AlbumShelf({ title, albums }: { title: string; albums: Album[] }) {
  if (!albums.length) return null;
  return (
    <View style={{ marginTop: 30 }}>
      <SectionHeader title={title} />
      <FlatList
        data={albums}
        horizontal
        keyExtractor={(a) => a.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}
        renderItem={({ item }) => <MediaCard item={item} size={146} onPress={() => openItem(item)} />}
      />
    </View>
  );
}

export default function ArtistScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width: W } = useWindowDimensions();
  const g = useDockGeometry();
  const { data, isLoading, error, refetch } = useArtist(id);
  const [showAll, setShowAll] = useState(false);
  const HERO = Math.round(W * 1.0);

  const scrollY = useSharedValue(0);
  const last = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
    dockScrollWorklet(e.contentOffset.y, last);
  });
  const heroStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    return {
      transform: [{ translateY: y < 0 ? y : -y * 0.35 }, { scale: y < 0 ? 1 + -y / HERO : 1 }],
      opacity: interpolate(y, [0, HERO * 0.8], [1, 0.2], 'clamp'),
    };
  });
  const nameStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [0, HERO * 0.5], [1, 0], 'clamp') }));

  const tracks = data?.topTracks ?? [];
  const ctx = { type: 'artist' as const, id, title: data?.name ?? 'Artist' };
  const isThisPlaying = usePlayer((s) => s.isPlaying && s.context?.type === 'artist' && s.context.id === id);
  const albums = (data?.albums ?? []).filter((a) => a.albumType === 'album' || a.albumType === 'compilation');
  const singles = (data?.albums ?? []).filter((a) => a.albumType === 'single' || a.albumType === 'ep');
  const heroUri = data?.cover ?? art(data?.image, 'large');

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.hero, { height: HERO }, heroStyle]}>
        {heroUri ? <Image source={{ uri: heroUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} priority="high" cachePolicy="memory-disk" /> : null}
        <LinearGradient colors={[alpha(colors.bg, 0.15), alpha(colors.bg, 0), alpha(colors.bg, 0.6), colors.bg]} locations={[0, 0.3, 0.75, 1]} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: g.contentInset }}>
        <View style={{ height: HERO - 120 }} />
        <Animated.View style={[styles.nameBlock, nameStyle]}>
          {data?.verified ? (
            <View style={styles.verified}>
              <BadgeCheck size={16} color="#fff" fill={colors.accent} />
              <Text variant="footnote" color="#fff">
                Verified artist
              </Text>
            </View>
          ) : null}
          <Text variant="largeTitle" style={styles.name} numberOfLines={2} accessibilityRole="header">
            {data?.name ?? ''}
          </Text>
          {data?.followers ? (
            <Text variant="callout" tone="secondary">
              {compactNumber(data.followers)} fans
            </Text>
          ) : null}
        </Animated.View>

        <View style={styles.body}>
        <View style={styles.actions}>
          <PressableScale
            onPress={async () => {
              const seed = tracks[0];
              if (!seed) return;
              try {
                void player.playTrack(seed, { type: 'radio', id: seed.id, title: `${data?.name} Radio` }, await endpoints.radio(seed.id));
              } catch {
                toast('Radio isn’t available right now', 'error');
              }
            }}
            disabled={!tracks.length}
            style={styles.pill}
            hapticOnPress="tap"
          >
            <Radio size={16} color={colors.text} />
            <Text variant="headline">Radio</Text>
          </PressableScale>
          <View style={{ flex: 1 }} />
          <PressableScale onPress={() => player.playQueue(tracks, 0, ctx, { shuffle: true })} disabled={!tracks.length} scaleTo={0.9} style={styles.shuffle} accessibilityLabel="Shuffle">
            <Shuffle size={20} color={colors.text} />
          </PressableScale>
          <PressableScale
            onPress={() => (isThisPlaying ? player.pause() : player.playQueue(tracks, 0, ctx, { shuffle: false }))}
            disabled={!tracks.length}
            scaleTo={0.9}
            hapticOnPress="medium"
            style={styles.play}
            accessibilityLabel={isThisPlaying ? 'Pause' : 'Play'}
          >
            <PlayPauseIcon playing={isThisPlaying} size={24} color="#fff" />
          </PressableScale>
        </View>

        {isLoading ? <ListSkeleton rows={5} /> : null}
        {error ? <ErrorState error={error} onRetry={refetch} /> : null}

        {tracks.length ? (
          <View style={{ marginTop: 18 }}>
            <SectionHeader title="Popular" onSeeAll={tracks.length > 5 ? () => setShowAll((s) => !s) : undefined} seeAllLabel={showAll ? 'Show less' : 'See more'} />
            {(showAll ? tracks : tracks.slice(0, 5)).map((t, i) => (
              <TrackRow key={t.id} track={t} onPress={() => player.playQueue(tracks, i, ctx, { shuffle: false })} />
            ))}
          </View>
        ) : null}

        <AlbumShelf title="Albums" albums={albums} />
        <AlbumShelf title="Singles & EPs" albums={singles} />

        {data?.bio ? (
          <View style={styles.about}>
            <Text variant="title3">About</Text>
            <Text variant="callout" tone="secondary" numberOfLines={8}>
              {data.bio}
            </Text>
          </View>
        ) : null}
        </View>
      </Animated.ScrollView>

      <TopBar scrollY={scrollY} title={data?.name ?? ''} threshold={HERO - 140} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: colors.surface },
  nameBlock: { paddingHorizontal: GUTTER, gap: 4, paddingBottom: 6 },
  body: { backgroundColor: colors.bg, minHeight: 600 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 44, lineHeight: 48, letterSpacing: -1.6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUTTER, marginTop: 18 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 16, borderRadius: 19, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.strokeStrong },
  shuffle: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.fillStrong, alignItems: 'center', justifyContent: 'center' },
  play: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  about: { marginHorizontal: GUTTER, marginTop: 30, padding: 18, gap: 10, borderRadius: radius.lg, backgroundColor: colors.fill },
}));
