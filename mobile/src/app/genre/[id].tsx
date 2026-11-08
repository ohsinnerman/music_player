import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useGenre } from '@/api/queries';
import { CollectionScreen } from '@/components/music/CollectionScreen';
import { Text } from '@/components/ui/Text';
import { fonts, radius } from '@/theme';

export default function GenreScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { data, isLoading, error, refetch } = useGenre(id);
  const title = data?.genre.name ?? name ?? 'Genre';
  const colorsPair = data?.genre.colors ?? (['#2A2A35', '#121218'] as [string, string]);
  return (
    <CollectionScreen
      title={title}
      kindLabel="Trending in genre"
      wash={colorsPair}
      customArt={
        <LinearGradient colors={colorsPair} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.art}>
          <Text style={styles.glyph} color="rgba(255,255,255,0.9)">
            {title.charAt(0)}
          </Text>
          <Text variant="title1" color="#fff" style={styles.name}>
            {title}
          </Text>
        </LinearGradient>
      }
      tracks={data?.tracks ?? []}
      context={{ type: 'genre', id, title }}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
    />
  );
}

const styles = StyleSheet.create({
  art: { width: 230, height: 230, borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'flex-end', padding: 18 },
  glyph: { position: 'absolute', right: 6, top: -30, fontFamily: fonts.serifItalic, fontSize: 200, lineHeight: 220, opacity: 0.35 },
  name: { fontFamily: fonts.extrabold },
});
