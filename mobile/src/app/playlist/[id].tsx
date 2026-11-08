import { useLocalSearchParams } from 'expo-router';
import { CopyPlus } from 'lucide-react-native';
import { View } from 'react-native';
import { usePlaylist } from '@/api/queries';
import { CollectionScreen } from '@/components/music/CollectionScreen';
import { openCreatePlaylist } from '@/components/sheets/TrackActions';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { colors, GUTTER } from '@/theme';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = usePlaylist(id);
  const tracks = data?.tracks ?? [];
  return (
    <CollectionScreen
      title={data?.title ?? ''}
      kindLabel="Playlist"
      subtitle={data?.owner?.name}
      artwork={data?.artwork}
      tracks={tracks}
      context={{ type: 'playlist', id, title: data?.title ?? 'Playlist' }}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        tracks.length ? (
          <IconButton icon={CopyPlus} label="Save a copy to your library" color={colors.textSecondary} onPress={() => openCreatePlaylist(tracks.slice(0, 100))} />
        ) : null
      }
      footer={
        data?.description ? (
          <View style={{ paddingHorizontal: GUTTER, paddingTop: 20 }}>
            <Text variant="caption" tone="tertiary" numberOfLines={8}>
              {data.description}
            </Text>
          </View>
        ) : null
      }
    />
  );
}
