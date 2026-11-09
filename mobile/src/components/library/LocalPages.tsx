import { Image } from 'expo-image';
import { ExternalLink, Info, RefreshCw, UserRound } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, StyleSheet, View } from 'react-native';
import { CollectionScreen } from '@/components/music/CollectionScreen';
import { MediaCard } from '@/components/music/MediaCard';
import { SectionHeader } from '@/components/music/SectionHeader';
import { IconButton } from '@/components/ui/IconButton';
import { EmptyState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { openAlbum, openArtist } from '@/lib/nav';
import { albumCard, loadAlbumInfo, loadArtistInfo, useLibraryInfo, useLocalLibrary } from '@/local/library';
import { GUTTER, makeStyles, radius, useColors } from '@/theme';

const hours = (ms: number) => {
  const min = Math.round(ms / 60000);
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
};

function About({ summary, source, facts, sources, loading }: { summary?: string; source?: { name: string; url: string }; facts: string[]; sources: string[]; loading: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  if (!summary && !facts.length && !loading) return null;
  return (
    <View style={styles.about}>
      {facts.length ? (
        <Text variant="callout" tone="secondary">
          {facts.join(' · ')}
        </Text>
      ) : null}
      {summary ? (
        <Text variant="body" style={{ lineHeight: 22 }}>
          {summary}
        </Text>
      ) : loading ? (
        <Text variant="callout" tone="tertiary">
          Looking up details…
        </Text>
      ) : null}
      {source ? (
        <Text variant="footnote" color={colors.accent} onPress={() => void Linking.openURL(source.url)} accessibilityRole="link">
          Read more on {source.name} <ExternalLink size={11} color={colors.accent} />
        </Text>
      ) : null}
      {sources.length ? (
        <Text variant="footnote" tone="tertiary">
          Details from {sources.join(', ')}
        </Text>
      ) : null}
    </View>
  );
}

/** An album made of songs on the phone, with cover / year / label / summary from the web. */
export function LocalAlbumPage({ id }: { id: string }) {
  const colors = useColors();
  const { albums } = useLocalLibrary();
  const album = albums.find((a) => a.id === id);
  const cached = useLibraryInfo((s) => s.albums[id]);
  const info = cached?.data ?? null;
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (!album) return;
    let on = true;
    void loadAlbumInfo(album).finally(() => on && setLoading(false));
    return () => {
      on = false;
    };
    // Only when the album changes identity, not on every track edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album?.id]);

  if (!album) {
    return (
      <CollectionScreen title="Album" kindLabel="Album" tracks={[]} context={{ type: 'local', id, title: 'Album' }} empty={<EmptyState icon={Info} title="Not on this phone any more" body="The songs from this album were removed." />} />
    );
  }

  const year = info?.year ?? album.year;
  const artwork = album.artwork.large || album.artwork.medium ? album.artwork : info?.cover ? { small: info.cover, medium: info.cover, large: info.cover } : album.artwork;
  const facts = [
    year,
    info?.label,
    info?.genres.length ? info.genres.join(', ') : album.genre,
    `${album.tracks.length} ${album.tracks.length === 1 ? 'song' : 'songs'}${info?.trackCount && info.trackCount > album.tracks.length ? ` of ${info.trackCount}` : ''}`,
    hours(album.durationMs),
  ].filter((x): x is string => !!x);

  return (
    <CollectionScreen
      title={album.title}
      kindLabel={['Album', year, album.quality].filter(Boolean).join(' · ')}
      subtitle={album.artist.name}
      onSubtitlePress={album.artist.id !== 'local-artist:various' ? () => openArtist(album.artist.id) : undefined}
      artwork={artwork}
      tracks={album.tracks}
      numbered
      context={{ type: 'local', id, title: album.title }}
      actions={
        <IconButton
          icon={RefreshCw}
          label="Refresh details from the web"
          color={colors.textSecondary}
          onPress={() => {
            setLoading(true);
            void loadAlbumInfo(album, true).finally(() => setLoading(false));
          }}
        />
      }
      footer={<About summary={info?.summary} source={info?.summarySource} facts={facts} sources={info?.sources ?? []} loading={loading} />}
    />
  );
}

/** An artist on the phone: photo and bio from the web, their albums and songs. */
export function LocalArtistPage({ id }: { id: string }) {
  const colors = useColors();
  const styles = useStyles();
  const { artists } = useLocalLibrary();
  const artist = artists.find((a) => a.id === id);
  const cached = useLibraryInfo((s) => s.artists[id]);
  const albumInfo = useLibraryInfo((s) => s.albums);
  const info = cached?.data ?? null;
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (!artist) return;
    let on = true;
    void loadArtistInfo(artist).finally(() => on && setLoading(false));
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artist?.id]);

  const tracks = useMemo(() => {
    if (!artist) return [];
    const order = new Map(artist.albums.map((a, i) => [a.id, i]));
    return artist.tracks.slice().sort((a, b) => (order.get(a.album?.id ?? '') ?? 999) - (order.get(b.album?.id ?? '') ?? 999) || (a.local?.tags.trackNo ?? 0) - (b.local?.tags.trackNo ?? 0));
  }, [artist]);

  if (!artist) {
    return <CollectionScreen title="Artist" kindLabel="Artist" tracks={[]} context={{ type: 'local', id, title: 'Artist' }} empty={<EmptyState icon={Info} title="Not on this phone any more" body="This artist’s songs were removed." />} />;
  }

  const photo = info?.image ?? artist.artwork.large ?? artist.artwork.medium;
  const total = artist.tracks.reduce((s, t) => s + (t.durationMs || 0), 0);
  const facts = [info?.fans ? `${Intl.NumberFormat(undefined, { notation: 'compact' }).format(info.fans)} fans on Deezer` : undefined, `${artist.tracks.length} songs on this phone`, hours(total)].filter((x): x is string => !!x);

  return (
    <CollectionScreen
      title={artist.name}
      kindLabel="Artist · on this phone"
      customArt={
        <View style={styles.photo}>
          {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <UserRound size={84} color={colors.textTertiary} strokeWidth={1.5} />}
        </View>
      }
      tracks={tracks}
      context={{ type: 'local', id, title: artist.name }}
      headerExtra={
        artist.albums.length ? (
          <View style={{ alignSelf: 'stretch', marginBottom: 8 }}>
            <SectionHeader title="Albums" />
            <FlatList
              data={artist.albums}
              horizontal
              keyExtractor={(a) => a.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14, paddingBottom: 8 }}
              renderItem={({ item }) => <MediaCard item={albumCard(item, albumInfo[item.id]?.data)} size={140} onPress={() => openAlbum(item.id)} />}
            />
            <SectionHeader title="Songs" />
          </View>
        ) : null
      }
      actions={
        <IconButton
          icon={RefreshCw}
          label="Refresh details from the web"
          color={colors.textSecondary}
          onPress={() => {
            setLoading(true);
            void loadArtistInfo(artist, true).finally(() => setLoading(false));
          }}
        />
      }
      footer={<About summary={info?.summary} source={info?.summarySource} facts={facts} sources={info?.sources ?? []} loading={loading} />}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  about: { marginHorizontal: GUTTER, marginTop: 22, padding: 16, borderRadius: radius.lg, backgroundColor: colors.fill, gap: 10 },
  photo: { width: 230, height: 230, borderRadius: 115, overflow: 'hidden', backgroundColor: colors.fillStrong, alignItems: 'center', justifyContent: 'center' },
}));
