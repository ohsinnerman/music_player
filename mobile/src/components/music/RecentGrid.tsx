import { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import type { Track } from '@/api/types';
import { player } from '@/player/engine';
import { usePlayer } from '@/player/store';
import { colors, GUTTER, radius } from '@/theme';
import { openTrackActions } from '../sheets/TrackActions';
import { Artwork } from '../ui/Artwork';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';
import { Equalizer } from './Equalizer';

const Tile = memo(function Tile({ track, width, onPress }: { track: Track; width: number; onPress: () => void }) {
  const current = usePlayer((s) => s.queue[s.index]?.id === track.id);
  const playing = usePlayer((s) => s.isPlaying && s.queue[s.index]?.id === track.id);
  return (
    <PressableScale onPress={onPress} onLongPress={() => openTrackActions(track)} scaleTo={0.97} style={[styles.tile, { width }]} accessibilityLabel={`Play ${track.title}`}>
      <Artwork artwork={track.artwork} size={52} radius={0} bordered={false} />
      <Text variant="headline" numberOfLines={2} style={styles.title} color={current ? colors.accent : colors.text}>
        {track.title}
      </Text>
      {current ? (
        <View style={{ marginRight: 10 }}>
          <Equalizer playing={playing} size={12} />
        </View>
      ) : null}
    </PressableScale>
  );
});

/** Spotify-style "jump back in" grid of recently played songs. */
export const RecentGrid = memo(function RecentGrid({ tracks }: { tracks: Track[] }) {
  const { width: W } = useWindowDimensions();
  const w = (W - GUTTER * 2 - 10) / 2;
  const list = tracks.slice(0, 6);
  if (list.length < 2) return null;
  return (
    <View style={styles.grid}>
      {list.map((t, i) => (
        <Tile key={t.id} track={t} width={w} onPress={() => player.playQueue(list, i, { type: 'history', title: 'Recently played' })} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: GUTTER },
  tile: { height: 52, borderRadius: radius.xs + 2, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  title: { flex: 1, paddingHorizontal: 10, fontSize: 13, lineHeight: 16 },
});
