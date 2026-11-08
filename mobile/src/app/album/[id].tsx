import { useLocalSearchParams } from 'expo-router';
import { ListPlus } from 'lucide-react-native';
import { View } from 'react-native';
import { useAlbum } from '@/api/queries';
import { CollectionScreen } from '@/components/music/CollectionScreen';
import { openPlaylistPicker } from '@/components/sheets/TrackActions';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { albumMeta, artistNames } from '@/lib/format';
import { openArtist } from '@/lib/nav';
import { colors, GUTTER } from '@/theme';

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useAlbum(id);
  const tracks = data?.tracks ?? [];
  return (
    <CollectionScreen
      title={data?.title ?? ''}
      kindLabel={data ? albumMeta(data) : 'Album'}
      subtitle={data ? artistNames(data) : undefined}
      onSubtitlePress={data?.artists[0] ? () => openArtist(data.artists[0]!.id) : undefined}
      artwork={data?.artwork}
      tracks={tracks}
      numbered
      context={{ type: 'album', id, title: data?.title ?? 'Album' }}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={tracks.length ? <IconButton icon={ListPlus} label="Add album to a playlist" color={colors.textSecondary} onPress={() => openPlaylistPicker(tracks)} /> : null}
      footer={
        data?.releaseDate || data?.description ? (
          <View style={{ paddingHorizontal: GUTTER, paddingTop: 20, gap: 6 }}>
            {data.releaseDate ? (
              <Text variant="callout" tone="secondary">
                {new Date(data.releaseDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </Text>
            ) : null}
            {data.description ? (
              <Text variant="caption" tone="tertiary" numberOfLines={6}>
                {data.description}
              </Text>
            ) : null}
          </View>
        ) : null
      }
    />
  );
}
