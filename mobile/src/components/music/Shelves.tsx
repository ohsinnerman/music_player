import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { Artist, CatalogItem, Genre, PlayContext, Section, Track } from '@/api/types';
import { openItem } from '@/lib/nav';
import { player } from '@/player/engine';
import { colors, fonts, GUTTER, radius } from '@/theme';
import { openTrackActions } from '../sheets/TrackActions';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';
import { HeroCarousel } from './HeroCarousel';
import { MediaCard } from './MediaCard';
import { SectionHeader } from './SectionHeader';
import { TrackRow } from './TrackRow';

const tracksOf = (items: CatalogItem[]) => items.filter((i): i is Track => i.kind === 'track');

/* ───────── Shelf: horizontal cards ───────── */

export const Shelf = memo(function Shelf({ section, cardSize = 150 }: { section: Section; cardSize?: number }) {
  const tracks = useMemo(() => tracksOf(section.items), [section.items]);
  const ctx: PlayContext = { type: 'home', title: section.title };
  const render = useCallback(
    ({ item }: { item: CatalogItem }) => {
      if (item.kind === 'genre') return null;
      if (item.kind === 'track') {
        return (
          <MediaCard
            item={item}
            size={cardSize}
            onPress={() => player.playQueue(tracks, tracks.findIndex((t) => t.id === item.id), ctx)}
            onLongPress={() => openTrackActions(item)}
          />
        );
      }
      return <MediaCard item={item} size={cardSize} onPress={() => openItem(item)} />;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tracks, cardSize, section.title],
  );
  return (
    <View>
      <SectionHeader title={section.title} subtitle={section.subtitle} />
      <FlatList
        data={section.items}
        keyExtractor={(i) => i.id}
        renderItem={render}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}
        initialNumToRender={4}
        windowSize={5}
        removeClippedSubviews
      />
    </View>
  );
});

/* ───────── Quick picks: paged columns of 4 rows (YouTube Music style) ───────── */

export const QuickPicks = memo(function QuickPicks({ section }: { section: Section }) {
  const { width: W } = useWindowDimensions();
  const tracks = useMemo(() => tracksOf(section.items), [section.items]);
  const pages = useMemo(() => {
    const out: Track[][] = [];
    for (let i = 0; i < tracks.length; i += 4) out.push(tracks.slice(i, i + 4));
    return out;
  }, [tracks]);
  const pageW = W - GUTTER * 2 - 24;
  const ctx: PlayContext = { type: 'home', title: section.title };
  if (!tracks.length) return null;
  return (
    <View>
      <SectionHeader title={section.title} subtitle={section.subtitle} onSeeAll={() => player.playQueue(tracks, 0, ctx, { shuffle: true })} seeAllLabel="Shuffle" />
      <FlatList
        data={pages}
        keyExtractor={(_, i) => String(i)}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={pageW + 12}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: GUTTER - 4, gap: 12 }}
        renderItem={({ item: page, index: p }) => (
          <View style={{ width: pageW }}>
            {page.map((t, i) => (
              <TrackRow key={t.id} track={t} gutter={4} onPress={() => player.playQueue(tracks, p * 4 + i, ctx)} />
            ))}
          </View>
        )}
      />
    </View>
  );
});

/* ───────── Chart: editorial serif numerals ───────── */

export const ChartList = memo(function ChartList({ section, initial = 5 }: { section: Section; initial?: number }) {
  const tracks = useMemo(() => tracksOf(section.items), [section.items]);
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? tracks : tracks.slice(0, initial);
  const ctx: PlayContext = { type: 'home', title: section.title };
  return (
    <View>
      <SectionHeader
        title={section.title}
        subtitle={section.subtitle}
        onSeeAll={tracks.length > initial ? () => setExpanded((e) => !e) : undefined}
        seeAllLabel={expanded ? 'Show less' : 'Full chart'}
      />
      {shown.map((t, i) => (
        <View key={t.id} style={styles.chartRow}>
          <Text style={styles.rank} color={i < 3 ? colors.text : colors.textTertiary}>
            {i + 1}
          </Text>
          <View style={{ flex: 1 }}>
            <TrackRow track={t} gutter={0} onPress={() => player.playQueue(tracks, i, ctx)} />
          </View>
        </View>
      ))}
    </View>
  );
});

/* ───────── Artists rail ───────── */

export const ArtistRail = memo(function ArtistRail({ section }: { section: Section }) {
  const artists = section.items.filter((i): i is Artist => i.kind === 'artist');
  return (
    <View>
      <SectionHeader title={section.title} subtitle={section.subtitle} />
      <FlatList
        data={artists}
        keyExtractor={(a) => a.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 16 }}
        renderItem={({ item }) => <MediaCard item={item} size={112} onPress={() => openItem(item)} />}
      />
    </View>
  );
});

/* ───────── Genre tiles ───────── */

export const GenreTile = memo(function GenreTile({ genre, width, height = 96 }: { genre: Genre; width: number; height?: number }) {
  return (
    <PressableScale onPress={() => openItem(genre)} style={{ width, height }} accessibilityLabel={`${genre.name} genre`}>
      <LinearGradient colors={genre.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tile}>
        <Text variant="title3" color="#fff" style={{ fontFamily: fonts.extrabold }}>
          {genre.name}
        </Text>
        {/* Oversized serif initial as the tile's graphic. */}
        <Text style={styles.tileGlyph} color="rgba(255,255,255,0.22)">
          {genre.name.charAt(0)}
        </Text>
        <View pointerEvents="none" style={styles.tileEdge} />
      </LinearGradient>
    </PressableScale>
  );
});

export const GenreGrid = memo(function GenreGrid({ genres, title, onSeeAll }: { genres: Genre[]; title?: string; onSeeAll?: () => void }) {
  const { width: W } = useWindowDimensions();
  const w = (W - GUTTER * 2 - 12) / 2;
  return (
    <View>
      {title ? <SectionHeader title={title} onSeeAll={onSeeAll} /> : null}
      <View style={styles.grid}>
        {genres.map((g) => (
          <GenreTile key={g.id} genre={g} width={w} />
        ))}
      </View>
    </View>
  );
});

/* ───────── Renderer ───────── */

export const SectionView = memo(function SectionView({ section }: { section: Section }) {
  switch (section.layout) {
    case 'hero':
      return <HeroCarousel items={section.items} />;
    case 'quickpicks':
      return <QuickPicks section={section} />;
    case 'chart':
      return <ChartList section={section} />;
    case 'artists':
      return <ArtistRail section={section} />;
    case 'genres':
      return <GenreGrid genres={section.items.filter((i): i is Genre => i.kind === 'genre')} title={section.title} onSeeAll={() => router.navigate('/explore')} />;
    default:
      return <Shelf section={section} />;
  }
});

const styles = StyleSheet.create({
  chartRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: GUTTER, paddingRight: GUTTER - 8 },
  rank: { fontFamily: fonts.serifItalic, fontSize: 34, lineHeight: 40, width: 40, marginRight: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: GUTTER },
  tile: { flex: 1, borderRadius: radius.md, padding: 14, overflow: 'hidden' },
  tileGlyph: { position: 'absolute', right: -6, bottom: -26, fontFamily: fonts.serifItalic, fontSize: 110, lineHeight: 120 },
  tileEdge: { ...StyleSheet.absoluteFill, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)' },
});
