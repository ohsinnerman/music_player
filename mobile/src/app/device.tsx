import { LinearGradient } from 'expo-linear-gradient';
import { FilePlus2, FolderOpen, FolderPlus, Smartphone, Sparkles } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import type { Track } from '@/api/types';
import { CollectionScreen } from '@/components/music/CollectionScreen';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { EmptyState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { findAllLyrics } from '@/local/identify';
import { importFiles, importFolder } from '@/local/import';
import { type ImportProgress, useDeviceMusic } from '@/local/store';
import { GUTTER, makeStyles, radius, useColors } from '@/theme';

type Sort = 'recent' | 'title' | 'artist' | 'album';
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
  const [sort, setSort] = useState<Sort>('recent');
  const sorted = useMemo(() => sortTracks(tracks, sort), [tracks, sort]);

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
          {tracks.length ? <IconButton icon={Sparkles} label={batch ? 'Stop finding lyrics' : 'Find lyrics for all songs'} active={!!batch} background={colors.fillStrong} onPress={findAll} /> : null}
        </>
      }
      headerExtra={
        <View style={{ alignSelf: 'stretch' }}>
          {importing ? <Progress p={importing} verb="Reading" /> : null}
          {batch && !importing ? <Progress p={batch} verb="Finding lyrics" /> : null}
          {tracks.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sorts}>
              {SORTS.map((s) => (
                <Chip key={s.key} label={s.label} active={sort === s.key} onPress={() => setSort(s.key)} />
              ))}
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
  progress: { marginHorizontal: GUTTER, marginBottom: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.strokeStrong, gap: 10 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.fillStrong, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },
}));
