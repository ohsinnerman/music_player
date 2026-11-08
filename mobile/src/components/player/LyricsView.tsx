import { MicVocal } from 'lucide-react-native';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { ApiError } from '@/api/client';
import { useLyrics } from '@/api/queries';
import type { LyricLine, Track } from '@/api/types';
import { player } from '@/player/engine';
import { clock } from '@/player/store';
import { colors, fonts, type } from '@/theme';
import { Text } from '../ui/Text';

/** Find the active line for a time (binary search, runs on the UI thread). */
function activeIndex(times: number[], ms: number): number {
  'worklet';
  let lo = 0;
  let hi = times.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= ms) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

const Line = memo(function Line({
  line,
  index,
  active,
  onLayout,
}: {
  line: LyricLine;
  index: number;
  active: SharedValue<number>;
  onLayout: (i: number, y: number) => void;
}) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(index - active.value);
    const isActive = index === active.value;
    return {
      opacity: withTiming(isActive ? 1 : d === 1 ? 0.42 : 0.26, { duration: 320 }),
      transform: [{ scale: withTiming(isActive ? 1 : 0.94, { duration: 360 }) }],
    };
  });
  const empty = !line.text.trim();
  return (
    <Pressable
      onPress={() => void player.seek(line.timeMs / 1000 + 0.01)}
      onLayout={(e) => onLayout(index, e.nativeEvent.layout.y)}
      accessibilityRole="button"
      accessibilityLabel={empty ? 'Instrumental break' : line.text}
      accessibilityHint="Jumps to this line"
    >
      <Animated.Text style={[styles.line, style]}>{empty ? '♪' : line.text}</Animated.Text>
    </Pressable>
  );
});

/** Pulsing "• • •" shown during the intro before the first sung line. */
function BeatDots({ firstMs }: { firstMs: number }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => {
    const visible = clock.position.value * 1000 < firstMs - 300;
    return { opacity: withTiming(visible ? 0.4 + pulse.value * 0.6 : 0, { duration: 250 }), transform: [{ scale: 1 + pulse.value * 0.08 }] };
  });
  return <Animated.Text style={[styles.dots, style]}>• • •</Animated.Text>;
}

function Synced({ lines, height }: { lines: LyricLine[]; height: number }) {
  const ref = useAnimatedRef<Animated.ScrollView>();
  const times = useSharedValue(lines.map((l) => l.timeMs));
  const offsets = useSharedValue<number[]>([]);
  const active = useSharedValue(-1);
  const userScrollAt = useSharedValue(0);
  const ys = useRef<number[]>([]);

  useEffect(() => {
    times.set(lines.map((l) => l.timeMs));
    ys.current = [];
    offsets.set([]);
  }, [lines, times, offsets]);

  const onLayout = useCallback(
    (i: number, y: number) => {
      ys.current[i] = y;
      offsets.set(ys.current.slice());
    },
    [offsets],
  );

  // Track the active line and keep it at ~30% from the top, unless the user is browsing.
  useAnimatedReaction(
    () => activeIndex(times.value, clock.position.value * 1000 + 250),
    (idx, prev) => {
      if (idx === prev) return;
      active.value = idx;
      if (Date.now() - userScrollAt.value < 3500) return;
      const y = offsets.value[Math.max(0, idx)];
      if (y !== undefined) scrollTo(ref, 0, Math.max(0, y - height * 0.3), true);
    },
  );

  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      userScrollAt.set(Date.now());
    },
    onMomentumEnd: () => {
      userScrollAt.set(Date.now());
    },
  });

  return (
    <Animated.ScrollView
      ref={ref}
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: height * 0.12, paddingBottom: height * 0.6, paddingHorizontal: 28 }}
    >
      {lines[0] && lines[0].timeMs > 4000 ? <BeatDots firstMs={lines[0].timeMs} /> : null}
      {lines.map((l, i) => (
        <Line key={`${l.timeMs}-${i}`} line={l} index={i} active={active} onLayout={onLayout} />
      ))}
      <Text variant="footnote" tone="tertiary" style={{ marginTop: 28 }}>
        Lyrics from LRCLIB
      </Text>
    </Animated.ScrollView>
  );
}

function Message({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.message}>
      <MicVocal size={28} color={colors.textTertiary} />
      <Text variant="title3" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="callout" tone="secondary" align="center">
          {body}
        </Text>
      ) : null}
    </View>
  );
}

export const LyricsView = memo(function LyricsView({ track, height }: { track: Track; height: number }) {
  const { data, isLoading, error } = useLyrics(track.id);
  const [ready, setReady] = useState(false);
  // Defer mounting the (possibly long) list one frame so the panel transition stays smooth.
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [track.id]);

  if (isLoading || !ready) {
    return (
      <View style={styles.message}>
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    );
  }
  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return <Message title={notFound ? 'No lyrics for this one yet' : 'Couldn’t load lyrics'} body={notFound ? 'Enjoy the music.' : 'Check your connection and try again.'} />;
  }
  if (data?.instrumental) return <Message title="Instrumental" body="Just vibes on this one." />;
  if (data?.synced?.length) return <Synced lines={data.synced} height={height} />;
  if (data?.plain) {
    return (
      <Animated.ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 28, paddingBottom: 80 }}>
        <Text style={styles.plain}>{data.plain}</Text>
        <Text variant="footnote" tone="tertiary" style={{ marginTop: 24 }}>
          Lyrics from LRCLIB · not time-synced
        </Text>
      </Animated.ScrollView>
    );
  }
  return <Message title="No lyrics for this one yet" body="Enjoy the music." />;
});

const styles = StyleSheet.create({
  line: { ...type.lyric, color: colors.text, paddingVertical: 9, transformOrigin: 'left center' },
  dots: { fontFamily: fonts.extrabold, fontSize: 30, color: colors.text, paddingVertical: 8, letterSpacing: 4 },
  plain: { fontFamily: fonts.bold, fontSize: 21, lineHeight: 32, color: 'rgba(255,255,255,0.85)' },
  message: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
});
