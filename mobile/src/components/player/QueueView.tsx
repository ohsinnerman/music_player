import { FlashList } from '@shopify/flash-list';
import { ArrowUpToLine, X } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Track } from '@/api/types';
import { artistNames } from '@/lib/format';
import { player } from '@/player/engine';
import { usePlayer } from '@/player/store';
import { GUTTER, radius, useColors } from '@/theme';
import { Artwork } from '../ui/Artwork';
import { IconButton } from '../ui/IconButton';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';

type Row = { type: 'header'; title: string; action?: { label: string; onPress: () => void } } | { type: 'track'; track: Track; index: number; current: boolean };

const QueueRow = memo(function QueueRow({ track, index, current, currentIndex }: { track: Track; index: number; current: boolean; currentIndex: number }) {
  const colors = useColors();
  return (
    <PressableScale onPress={() => player.skipTo(index)} dim scaleTo={0.985} style={styles.row} accessibilityLabel={`Play ${track.title}`}>
      <Artwork artwork={track.artwork} size={44} radius={radius.xs} />
      <View style={{ flex: 1 }}>
        <Text variant="headline" numberOfLines={1} color={current ? colors.accent : colors.text}>
          {track.title}
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {artistNames(track)}
        </Text>
      </View>
      {!current && index > currentIndex + 1 ? (
        <IconButton icon={ArrowUpToLine} label="Play next" size={36} iconSize={18} color={colors.textSecondary} onPress={() => player.moveToNext(index)} />
      ) : null}
      {!current ? <IconButton icon={X} label="Remove from queue" size={36} iconSize={18} color={colors.textSecondary} onPress={() => player.removeAt(index)} /> : null}
    </PressableScale>
  );
});

export const QueueView = memo(function QueueView() {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const context = usePlayer((s) => s.context);

  const rows = useMemo<Row[]>(() => {
    // The current song is already shown in the player header above the list.
    const out: Row[] = [];
    const upNext = queue.slice(index + 1);
    if (upNext.length) {
      out.push({ type: 'header', title: context ? `Next from ${context.title}` : 'Up next', action: { label: 'Clear', onPress: player.clearUpNext } });
      upNext.forEach((t, k) => out.push({ type: 'track', track: t, index: index + 1 + k, current: false }));
    } else {
      out.push({ type: 'header', title: 'Nothing up next' });
    }
    return out;
  }, [queue, index, context]);

  return (
    <FlashList
      data={rows}
      keyExtractor={(r, i) => (r.type === 'header' ? `h-${r.title}` : `${r.track.id}-${r.index}-${i}`)}
      getItemType={(r) => r.type}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) =>
        item.type === 'header' ? (
          <View style={styles.header}>
            <Text variant="title3">{item.title}</Text>
            {item.action ? (
              <PressableScale onPress={item.action.onPress} hitSlop={10}>
                <Text variant="callout" tone="secondary">
                  {item.action.label}
                </Text>
              </PressableScale>
            ) : null}
          </View>
        ) : (
          <QueueRow track={item.track} index={item.index} current={item.current} currentIndex={index} />
        )
      }
    />
  );
});

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, paddingTop: 18, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUTTER, height: 60 },
});
