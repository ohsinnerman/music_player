import { LinearGradient } from 'expo-linear-gradient';
import { Play, Shuffle } from 'lucide-react-native';
import { type ReactElement, type ReactNode, useCallback } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Artwork as ArtworkT, PlayContext, Track } from '@/api/types';
import { dockScrollWorklet } from '@/lib/chrome';
import { art, tracksMeta } from '@/lib/format';
import { alpha, usePalette } from '@/lib/palette';
import { player } from '@/player/engine';
import { usePlayer } from '@/player/store';
import { GUTTER, makeStyles, radius, useColors } from '@/theme';
import { useDockGeometry } from '../dock/geometry';
import type { TrackActionExtra } from '../sheets/TrackActions';
import { Artwork } from '../ui/Artwork';
import { PressableScale } from '../ui/PressableScale';
import { ListSkeleton, Skeleton } from '../ui/Skeleton';
import { ErrorState } from '../ui/States';
import { Text } from '../ui/Text';
import { TopBar } from '../ui/TopBar';
import { PlayPauseIcon } from '../player/Controls';
import { TrackRow } from './TrackRow';

export interface CollectionScreenProps {
  title: string;
  kindLabel: string;
  subtitle?: string;
  onSubtitlePress?: () => void;
  artwork?: ArtworkT;
  /** Replaces the cover with custom art (Liked Songs heart, genre gradient). */
  customArt?: ReactNode;
  /** Gradient colours for the page wash when there's no cover to sample. */
  wash?: [string, string];
  tracks: Track[];
  context: PlayContext;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  numbered?: boolean;
  actions?: ReactNode;
  /** Rendered under the play/shuffle row (filters, progress…). */
  headerExtra?: ReactNode;
  footer?: ReactNode;
  empty?: ReactElement;
  trackExtraActions?: (t: Track) => TrackActionExtra[];
}

const AFlatList = Animated.FlatList<Track>;

export function CollectionScreen(props: CollectionScreenProps) {
  const colors = useColors();
  const styles = useStyles();
  const { title, kindLabel, subtitle, onSubtitlePress, artwork, customArt, wash, tracks, context, isLoading, error, onRetry, numbered, actions, headerExtra, footer, empty, trackExtraActions } = props;
  const { width: W } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const g = useDockGeometry();
  const palette = usePalette(art(artwork, 'small'));
  const top = wash?.[0] ?? palette.dominant;
  const coverSize = Math.min(W * 0.62, 260);

  const scrollY = useSharedValue(0);
  const last = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
    dockScrollWorklet(e.contentOffset.y, last);
  });

  // Stretchy, parallax cover.
  const coverStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    return {
      transform: [{ translateY: y < 0 ? y * 0.5 : y * 0.35 }, { scale: y < 0 ? 1 + -y / 500 : interpolate(y, [0, 300], [1, 0.82], 'clamp') }],
      opacity: interpolate(y, [0, 280], [1, 0.15], 'clamp'),
    };
  });
  const washStyle = useAnimatedStyle(() => ({ transform: [{ translateY: Math.min(0, -scrollY.value * 0.5) }] }));

  const isThisPlaying = usePlayer((s) => s.isPlaying && s.context?.type === context.type && s.context?.id === context.id && !!context.id);
  const playAll = useCallback(() => {
    if (isThisPlaying) return player.pause();
    const s = usePlayer.getState();
    if (s.context?.type === context.type && s.context?.id === context.id && context.id && s.index >= 0) return player.play();
    void player.playQueue(tracks, 0, context, { shuffle: false });
  }, [isThisPlaying, tracks, context]);

  const renderItem = useCallback(
    ({ item, index }: { item: Track; index: number }) => (
      <TrackRow
        track={item}
        number={numbered ? index + 1 : undefined}
        showArtwork={!numbered}
        extraActions={trackExtraActions?.(item)}
        onPress={() => player.playQueue(tracks, index, context, { shuffle: false })}
      />
    ),
    [tracks, context, numbered, trackExtraActions],
  );

  const header = (
    <View style={{ paddingTop: insets.top + 56, alignItems: 'center' }}>
      <Animated.View style={[styles.coverShadow, { shadowColor: palette.dark }, coverStyle]}>
        {customArt ?? <Artwork artwork={artwork} size={coverSize} radius={radius.lg} priority="high" />}
      </Animated.View>
      <View style={styles.titles}>
        {isLoading && !title ? (
          <Skeleton width={200} height={24} />
        ) : (
          <Text variant="title1" align="center" numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
        )}
        {subtitle ? (
          <PressableScale onPress={onSubtitlePress} disabled={!onSubtitlePress}>
            <Text variant="headline" color={onSubtitlePress ? colors.text : colors.textSecondary} align="center" numberOfLines={1}>
              {subtitle}
            </Text>
          </PressableScale>
        ) : null}
        <Text variant="caption" tone="tertiary" align="center">
          {[kindLabel, tracks.length ? tracksMeta(tracks) : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={styles.actions}>
        <View style={styles.actionsLeft}>{actions}</View>
        <PressableScale
          onPress={() => player.playQueue(tracks, 0, context, { shuffle: true })}
          disabled={!tracks.length}
          scaleTo={0.9}
          hapticOnPress="tap"
          accessibilityLabel="Shuffle play"
          style={styles.shuffle}
        >
          <Shuffle size={20} color={colors.text} strokeWidth={2.2} />
        </PressableScale>
        <PressableScale onPress={playAll} disabled={!tracks.length} scaleTo={0.9} hapticOnPress="medium" accessibilityLabel={isThisPlaying ? 'Pause' : 'Play'} style={styles.play}>
          {tracks.length ? <PlayPauseIcon playing={isThisPlaying} size={24} color="#fff" /> : <Play size={24} color="#fff" fill="#fff" />}
        </PressableScale>
      </View>
      {headerExtra}
    </View>
  );

  return (
    <View style={styles.root}>
      <Animated.View pointerEvents="none" style={[styles.wash, washStyle]}>
        <LinearGradient colors={[alpha(top, 0.75), alpha(wash?.[1] ?? palette.dark, 0.35), colors.bg]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <AFlatList
        data={isLoading || error ? [] : tracks}
        keyExtractor={(t, i) => `${t.id}-${i}`}
        renderItem={renderItem}
        onScroll={onScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={header}
        ListEmptyComponent={isLoading ? <ListSkeleton /> : error ? <ErrorState error={error} onRetry={onRetry} /> : empty}
        ListFooterComponent={<View style={{ paddingBottom: g.contentInset }}>{footer}</View>}
        showsVerticalScrollIndicator={false}
        initialNumToRender={14}
        windowSize={9}
        removeClippedSubviews
      />
      <TopBar scrollY={scrollY} title={title} threshold={coverSize + 40} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  wash: { position: 'absolute', left: 0, right: 0, top: 0, height: 560 },
  coverShadow: { shadowOpacity: 0.6, shadowRadius: 30, shadowOffset: { width: 0, height: 18 }, elevation: 16, borderRadius: radius.lg },
  titles: { alignItems: 'center', gap: 6, paddingHorizontal: GUTTER * 1.5, marginTop: 22 },
  actions: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', paddingHorizontal: GUTTER, marginTop: 18, marginBottom: 10, gap: 12 },
  actionsLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  shuffle: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.fillStrong, alignItems: 'center', justifyContent: 'center' },
  play: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
}));
