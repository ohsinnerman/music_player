import { LinearGradient } from 'expo-linear-gradient';
import { AudioWaveform, FilePlus2, FolderOpen, FolderPlus, ImageDown, Smartphone, Sparkles } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import type { Track } from '@/api/types';
import { CollectionScreen } from '@/components/music/CollectionScreen';
import { MediaCard } from '@/components/music/MediaCard';
import { SectionHeader } from '@/components/music/SectionHeader';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { EmptyState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { assess, specOf } from '@/lib/quality';
import { findAllLyrics } from '@/local/identify';
import { importFiles, importFolder } from '@/local/import';
import { albumCard, artistCard, enrichAll, useLibraryInfo, useLocalLibrary } from '@/local/library';
import { openAlbum, openArtist } from '@/lib/nav';
import { type ImportProgress, useDeviceMusic } from '@/local/store';
import { GUTTER, makeStyles, radius, useColors } from '@/theme';

type Sort = 'recent' | 'title' | 'artist' | 'album';
type QualityFilter = 'all' | 'lossless' | 'hires';
const SORTS: { key: Sort; label: string }[] = [
  { key: 'recent', label: 'Recently added' },
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'album', label: 'Album' },
];

const cmp = (a = '', b = '') => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

function sortTracks(list: Track[], by: Sort): Track[] {
  if (by === 'recent') return list;
  const out = list.slice();
  if (by === 'title') out.sort((a, b) => cmp(a.title, b.title));
  else if (by === 'artist') out.sort((a, b) => cmp(a.artists[0]?.name, b.artists[0]?.name) || cmp(a.album?.title, b.album?.title) || (a.local?.tags.trackNo ?? 0) - (b.local?.tags.trackNo ?? 0));
  else out.sort((a, b) => cmp(a.album?.title, b.album?.title) || (a.local?.tags.trackNo ?? 0) - (b.local?.tags.trackNo ?? 0) || cmp(a.title, b.title));
  return out;
}

function Progress({ p, verb }: { p: ImportProgress; verb: string }) {
  const colors = useColors();
  const styles = useStyles();
  const pct = p.total ? p.done / p.total : 0;
  const bar = useAnimatedStyle(() => ({ width: withTiming(`${Math.round(pct * 100)}%`, { duration: 220 }) }));
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.progress}>
      <View style={styles.progressRow}>
        <ActivityIndicator size="small" color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text variant="headline" numberOfLines={1}>
            {p.total ? `${verb} ${p.done} of ${p.total}` : p.label}
          </Text>
          {p.total ? (
            <Text variant="caption" tone="secondary" numberOfLines={1}>
              {p.label}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, bar]} />
      </View>
    </Animated.View>
  );
}

export default function DeviceMusicScreen() {
  const colors = useColors();
  const styles = useStyles();
  const tracks = useDeviceMusic((s) => s.tracks);
  const importing = useDeviceMusic((s) => s.importing);
  const batch = useDeviceMusic((s) => s.lyricsBatch);
  const { albums, artists } = useLocalLibrary();
  const albumInfo = useLibraryInfo((s) => s.albums);
  const artistInfo = useLibraryInfo((s) => s.artists);
  const infoBatch = useLibraryInfo((s) => s.batch);
  const [sort, setSort] = useState<Sort>('recent');
  const [qf, setQf] = useState<QualityFilter>('all');
  const tiers = useMemo(() => new Map(tracks.map((t) => [t.id, assess(specOf(t)).tier])), [tracks]);
  const counts = useMemo(() => {
    let hires = 0;
    let lossless = 0;
    tiers.forEach((t) => {
      if (t === 'hires') hires++;
      else if (t === 'lossless') lossless++;
    });
    return { hires, lossless, lossy: tracks.length - hires - lossless };
  }, [tiers, tracks.length]);
  const sorted = useMemo(() => {
    const list = qf === 'all' ? tracks : tracks.filter((t) => (qf === 'hires' ? tiers.get(t.id) === 'hires' : tiers.get(t.id) === 'hires' || tiers.get(t.id) === 'lossless'));
    return sortTracks(list, sort);
  }, [tracks, sort, qf, tiers]);

  const findAll = async () => {
    if (batch) {
      void findAllLyrics(); // second tap cancels
      toast('Stopped looking for lyrics', 'info');
      return;
    }
    toast('Looking up lyrics for your songs in the background…', 'info');
    const r = await findAllLyrics();
    if (r.total) toast(`Found lyrics for ${r.found} of ${r.total} songs`, r.found ? 'success' : 'info');
  };

  const getDetails = async () => {
    if (infoBatch) {
      void enrichAll(); // second tap cancels
      toast('Stopped fetching details', 'info');
      return;
    }
    toast('Getting covers, photos and details from the web…', 'info');
    const r = await enrichAll();
    if (r.albums) toast(r.covers ? `Found ${r.covers} missing ${r.covers === 1 ? 'cover' : 'covers'}` : 'Album and artist details updated', 'success');
  };

  return (
    <CollectionScreen
      title="On this phone"
      kindLabel="Your own files"
      wash={['#2E7CF6', '#0B1E3F']}
      customArt={
        <LinearGradient colors={['#5AA9FF', '#2E7CF6', '#1A2F6B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.art}>
          <Smartphone size={78} color="#fff" strokeWidth={1.6} />
        </LinearGradient>
      }
      tracks={sorted}
      context={{ type: 'local', id: 'device', title: 'On this phone' }}
      actions={
        <>
          <IconButton icon={FilePlus2} label="Add songs" background={colors.fillStrong} onPress={() => void importFiles()} disabled={!!importing} />
          <IconButton icon={FolderPlus} label="Add a folder" background={colors.fillStrong} onPress={() => void importFolder()} disabled={!!importing} />
          {albums.length || artists.length ? <IconButton icon={ImageDown} label={infoBatch ? 'Stop fetching details' : 'Get covers and details from the web'} active={!!infoBatch} background={colors.fillStrong} onPress={getDetails} /> : null}
          {tracks.length ? <IconButton icon={Sparkles} label={batch ? 'Stop finding lyrics' : 'Find lyrics for all songs'} active={!!batch} background={colors.fillStrong} onPress={findAll} /> : null}
        </>
      }
      headerExtra={
        <View style={{ alignSelf: 'stretch' }}>
          {importing ? <Progress p={importing} verb="Reading" /> : null}
          {batch && !importing ? <Progress p={batch} verb="Finding lyrics" /> : null}
          {infoBatch && !importing ? <Progress p={infoBatch} verb="Details for" /> : null}
          {albums.length > 1 ? (
            <View style={{ marginBottom: 10 }}>
              <SectionHeader title="Albums" />
              <FlatList
                data={albums}
                horizontal
                keyExtractor={(a) => a.id}
                showsHorizontalScrollIndicator={false}
                initialNumToRender={6}
                contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}
                renderItem={({ item }) => <MediaCard item={albumCard(item, albumInfo[item.id]?.data)} size={132} onPress={() => openAlbum(item.id)} />}
              />
            </View>
          ) : null}
          {artists.length > 1 ? (
            <View style={{ marginBottom: 10 }}>
              <SectionHeader title="Artists" />
              <FlatList
                data={artists}
                horizontal
                keyExtractor={(a) => a.id}
                showsHorizontalScrollIndicator={false}
                initialNumToRender={6}
                contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}
                renderItem={({ item }) => <MediaCard item={artistCard(item, artistInfo[item.id]?.data)} size={112} onPress={() => openArtist(item.id)} />}
              />
            </View>
          ) : null}
          {albums.length > 1 || artists.length > 1 ? <SectionHeader title="Songs" /> : null}
          {tracks.length ? (
            <View style={styles.summary}>
              <AudioWaveform size={15} color={colors.textTertiary} />
              <Text variant="footnote" tone="secondary">
                {[counts.hires ? `${counts.hires} Hi-Res` : null, counts.lossless ? `${counts.lossless} Lossless` : null, counts.lossy ? `${counts.lossy} lossy` : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ) : null}
          {tracks.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sorts}>
              {SORTS.map((s) => (
                <Chip key={s.key} label={s.label} active={sort === s.key} onPress={() => setSort(s.key)} />
              ))}
              {counts.hires + counts.lossless > 0 && counts.lossy > 0 ? (
                <Chip label="Lossless only" active={qf === 'lossless'} onPress={() => setQf(qf === 'lossless' ? 'all' : 'lossless')} />
              ) : null}
              {counts.hires > 0 && counts.hires < tracks.length ? <Chip label="Hi-Res" active={qf === 'hires'} onPress={() => setQf(qf === 'hires' ? 'all' : 'hires')} /> : null}
            </ScrollView>
          ) : null}
        </View>
      }
      empty={
        importing ? undefined : (
          <EmptyState
            icon={FolderOpen}
            title="Bring your own music"
            body="Add FLAC, WAV, MP3, M4A, OGG or Opus files. Aura reads their tags and cover art, works out which song each one is, and finds synced lyrics."
            action={{ label: 'Choose a folder', onPress: () => void importFolder() }}
          />
        )
      }
    />
  );
}

const useStyles = makeStyles((colors) => ({
  art: { width: 230, height: 230, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  sorts: { gap: 8, paddingHorizontal: GUTTER, paddingVertical: 6 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: GUTTER, marginBottom: 6 },
  progress: { marginHorizontal: GUTTER, marginBottom: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.strokeStrong, gap: 10 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.fillStrong, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },
}));
