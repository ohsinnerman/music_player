import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Play } from 'lucide-react-native';
import { memo, useCallback } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { type SharedValue, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { CatalogItem } from '@/api/types';
import { art, artistNames } from '@/lib/format';
import { openItem } from '@/lib/nav';
import { colors, GUTTER, radius } from '@/theme';
import { Glass } from '../ui/Glass';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';

type HeroItem = Extract<CatalogItem, { kind: 'album' | 'playlist' }>;

function label(item: HeroItem) {
  if (item.kind === 'album') return item.albumType === 'single' ? 'New single' : item.albumType === 'ep' ? 'New EP' : 'Featured album';
  return 'Featured playlist';
}

const Card = memo(function Card({ item, index, x, width, gap }: { item: HeroItem; index: number; x: SharedValue<number>; width: number; gap: number }) {
  const step = width + gap;
  const style = useAnimatedStyle(() => {
    const d = (x.value - index * step) / step; // -1 … 0 … 1
    return {
      transform: [{ scale: interpolate(Math.abs(d), [0, 1], [1, 0.9], 'clamp') }],
      opacity: interpolate(Math.abs(d), [0, 1.2], [1, 0.55], 'clamp'),
    };
  });
  // Parallax: the artwork drifts slower than the card.
  const imgStyle = useAnimatedStyle(() => {
    const d = (x.value - index * step) / step;
    return { transform: [{ translateX: interpolate(d, [-1, 1], [-width * 0.12, width * 0.12], 'clamp') }, { scale: 1.25 }] };
  });
  const uri = art(item.artwork, 'large');
  const subtitle = item.kind === 'album' ? artistNames(item) : item.owner?.name ?? `${item.trackCount ?? 0} songs`;

  return (
    <Animated.View style={[{ width, marginRight: gap }, style]}>
      {/* Coloured glow: a blurred copy of the cover underneath. */}
      {uri ? <Image source={{ uri }} blurRadius={40} style={[styles.glow, { width: width * 0.86, left: width * 0.07 }]} contentFit="cover" /> : null}
      <PressableScale onPress={() => openItem(item)} scaleTo={0.98} accessibilityLabel={`${label(item)}: ${item.title}`}>
        <View style={[styles.card, { height: width * 1.08 }]}>
          <Animated.View style={[StyleSheet.absoluteFill, imgStyle]}>
            {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={260} cachePolicy="memory-disk" priority="high" /> : null}
          </Animated.View>
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.85)']} locations={[0.35, 0.6, 1]} style={StyleSheet.absoluteFill} />
          <View style={styles.cardBody}>
            <Text variant="label" color="rgba(255,255,255,0.75)">
              {label(item)}
            </Text>
            <Text variant="title1" numberOfLines={2} color="#fff" style={{ marginTop: 6 }}>
              {item.title}
            </Text>
            <View style={styles.footer}>
              <Text variant="callout" color="rgba(255,255,255,0.78)" numberOfLines={1} style={{ flex: 1 }}>
                {subtitle}
              </Text>
              <Glass radius={22} intensity={30} variant="inline" style={styles.playPill}>
                <View style={styles.playInner}>
                  <Play size={14} color="#fff" fill="#fff" />
                  <Text variant="headline" color="#fff">
                    Open
                  </Text>
                </View>
              </Glass>
            </View>
          </View>
          <View pointerEvents="none" style={styles.edge} />
        </View>
      </PressableScale>
    </Animated.View>
  );
});

export const HeroCarousel = memo(function HeroCarousel({ items }: { items: CatalogItem[] }) {
  const { width: W } = useWindowDimensions();
  const heroes = items.filter((i): i is HeroItem => i.kind === 'album' || i.kind === 'playlist');
  const width = Math.min(W - GUTTER * 2 - 28, 380);
  const gap = 14;
  const x = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
  });
  const render = useCallback(({ item, index }: { item: HeroItem; index: number }) => <Card item={item} index={index} x={x} width={width} gap={gap} />, [x, width]);
  if (!heroes.length) return null;
  return (
    <Animated.FlatList
      data={heroes}
      keyExtractor={(i) => i.id}
      renderItem={render}
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={width + gap}
      decelerationRate="fast"
      disableIntervalMomentum
      contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 6, paddingBottom: 18 }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    />
  );
});

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: 24, bottom: -10, borderRadius: radius.xl, opacity: 0.55 },
  card: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surface },
  cardBody: { position: 'absolute', left: 18, right: 18, bottom: 18 },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 12 },
  playPill: { height: 36 },
  playInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36 },
  edge: { ...StyleSheet.absoluteFill, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)' },
});
