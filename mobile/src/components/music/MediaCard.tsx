import { BadgeCheck } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Album, Artist, Playlist, Track } from '@/api/types';
import { artistNames, compactNumber, year } from '@/lib/format';
import { radius, useColors } from '@/theme';
import { Artwork } from '../ui/Artwork';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';

type CardItem = Album | Playlist | Track | Artist;

function subtitle(item: CardItem): string {
  switch (item.kind) {
    case 'album':
      return [item.albumType === 'single' ? 'Single' : item.albumType === 'ep' ? 'EP' : year(item.releaseDate), artistNames(item)].filter(Boolean).join(' · ');
    case 'playlist':
      return item.owner?.name ? `Playlist · ${item.owner.name}` : `${item.trackCount ?? 0} songs`;
    case 'track':
      return artistNames(item);
    case 'artist':
      return item.followers ? `${compactNumber(item.followers)} fans` : 'Artist';
  }
}

export const MediaCard = memo(function MediaCard({ item, size = 150, onPress, onLongPress }: { item: CardItem; size?: number; onPress: () => void; onLongPress?: () => void }) {
  const colors = useColors();
  const title = item.kind === 'artist' ? item.name : item.title;
  const artwork = item.kind === 'artist' ? item.image : item.artwork;
  const round = item.kind === 'artist';
  return (
    <PressableScale onPress={onPress} onLongPress={onLongPress} style={{ width: size }} accessibilityLabel={`${title}, ${subtitle(item)}`}>
      <Artwork artwork={artwork} size={size} radius={round ? 999 : radius.md} round={round} style={round ? undefined : styles.shadow} />
      <View style={[styles.text, round && { alignItems: 'center' }]}>
        <View style={styles.titleRow}>
          <Text variant="headline" numberOfLines={1} style={{ flexShrink: 1 }} align={round ? 'center' : 'left'}>
            {title}
          </Text>
          {item.kind === 'artist' && item.verified ? <BadgeCheck size={14} color={colors.accent} fill={colors.accentSoft} /> : null}
        </View>
        <Text variant="caption" tone="secondary" numberOfLines={1} align={round ? 'center' : 'left'}>
          {subtitle(item)}
        </Text>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  text: { marginTop: 10, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shadow: {},
});
