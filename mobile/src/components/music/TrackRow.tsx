import { Ellipsis } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Track } from '@/api/types';
import { artistNames, formatTime } from '@/lib/format';
import { usePlayer } from '@/player/store';
import { GUTTER, fonts, radius, useColors } from '@/theme';
import { type TrackActionExtra, openTrackActions } from '../sheets/TrackActions';
import { Artwork } from '../ui/Artwork';
import { IconButton } from '../ui/IconButton';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';
import { ExplicitBadge, PreviewBadge } from './Badges';
import { Equalizer } from './Equalizer';

export interface TrackRowProps {
  track: Track;
  onPress: () => void;
  /** Show a rank / track number instead of artwork. */
  number?: number;
  showArtwork?: boolean;
  showDuration?: boolean;
  extraActions?: TrackActionExtra[];
  gutter?: number;
}

export const TrackRow = memo(function TrackRow({ track, onPress, number, showArtwork = true, showDuration = false, extraActions, gutter = GUTTER }: TrackRowProps) {
  const colors = useColors();
  const isCurrent = usePlayer((s) => s.queue[s.index]?.id === track.id);
  const playing = usePlayer((s) => s.isPlaying && s.queue[s.index]?.id === track.id);

  return (
    <PressableScale
      onPress={onPress}
      onLongPress={() => openTrackActions(track, extraActions)}
      delayLongPress={320}
      dim
      scaleTo={0.985}
      accessibilityLabel={`${track.title} by ${artistNames(track)}`}
      accessibilityHint="Plays the song. Long press for more options."
      style={[styles.row, { paddingHorizontal: gutter }]}
    >
      {number !== undefined && !showArtwork ? (
        <View style={styles.num}>
          {isCurrent ? (
            <Equalizer playing={playing} />
          ) : (
            <Text variant="callout" tone="tertiary" style={{ fontFamily: fonts.semibold }}>
              {number}
            </Text>
          )}
        </View>
      ) : null}
      {showArtwork ? (
        <View>
          <Artwork artwork={track.artwork} size={50} radius={radius.xs} />
          {isCurrent ? (
            <View style={styles.eqOverlay}>
              <Equalizer playing={playing} color="#fff" size={13} />
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.text}>
        <Text variant="headline" numberOfLines={1} color={isCurrent ? colors.accent : colors.text}>
          {track.title}
        </Text>
        <View style={styles.meta}>
          {track.explicit ? <ExplicitBadge /> : null}
          {track.streamKind === 'preview' ? <PreviewBadge /> : null}
          <Text variant="caption" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
            {artistNames(track)}
          </Text>
        </View>
      </View>
      {showDuration ? (
        <Text variant="caption" tone="tertiary" style={{ fontVariant: ['tabular-nums'] }}>
          {formatTime(track.durationMs / 1000)}
        </Text>
      ) : null}
      <IconButton icon={Ellipsis} label="More options" size={36} iconSize={20} color={colors.textSecondary} onPress={() => openTrackActions(track, extraActions)} haptic={false} />
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 66 },
  num: { width: 22, alignItems: 'center' },
  text: { flex: 1, gap: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eqOverlay: { ...StyleSheet.absoluteFill, borderRadius: radius.xs, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
});
