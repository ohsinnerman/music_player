import { router, useLocalSearchParams } from 'expo-router';
import { ListMusic, Pencil, Search, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { CollectionScreen } from '@/components/music/CollectionScreen';
import { removeExtra } from '@/components/sheets/TrackActions';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { openSheet } from '@/components/ui/Sheet';
import { EmptyState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { deletePlaylist, removeFromPlaylist, renamePlaylist, useLibraryPlaylist } from '@/library/hooks';
import { colors, GUTTER, radius } from '@/theme';

function Rename({ id, current, close }: { id: string; current: string; close: () => void }) {
  const [name, setName] = useState(current);
  return (
    <View style={{ paddingHorizontal: GUTTER, gap: 18 }}>
      <Text variant="title2">Rename playlist</Text>
      <TextField label="Name" value={name} onChangeText={setName} autoFocus maxLength={80} onSubmitEditing={() => renamePlaylist(id, name).then(close)} />
      <Button title="Save" size="lg" disabled={!name.trim()} onPress={() => renamePlaylist(id, name).then(close)} />
    </View>
  );
}

export default function MyPlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { playlist, isLoading, error } = useLibraryPlaylist(id);
  const tracks = playlist?.tracks ?? [];

  const confirmDelete = () =>
    Alert.alert('Delete playlist?', `“${playlist?.title}” will be removed from your library.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePlaylist(id);
          router.back();
        },
      },
    ]);

  return (
    <CollectionScreen
      title={playlist?.title ?? ''}
      kindLabel="Your playlist"
      artwork={playlist?.artwork}
      customArt={
        !isLoading && !tracks.length ? (
          <View style={styles.emptyArt}>
            <ListMusic size={64} color={colors.textTertiary} strokeWidth={1.5} />
          </View>
        ) : undefined
      }
      tracks={tracks}
      context={{ type: 'playlist', id, title: playlist?.title ?? 'Playlist' }}
      isLoading={isLoading}
      error={error}
      trackExtraActions={(t) => [removeExtra(() => removeFromPlaylist(id, t.id))]}
      actions={
        playlist ? (
          <>
            <IconButton icon={Pencil} label="Rename" color={colors.textSecondary} onPress={() => openSheet((close) => <Rename id={id} current={playlist.title} close={close} />)} />
            <IconButton icon={Trash2} label="Delete playlist" color={colors.textSecondary} onPress={confirmDelete} />
          </>
        ) : null
      }
      empty={<EmptyState icon={Search} title="Let’s find something for this playlist" body="Long-press any song and choose “Add to playlist”." action={{ label: 'Search songs', onPress: () => router.push('/search') }} />}
    />
  );
}

const styles = StyleSheet.create({
  emptyArt: { width: 220, height: 220, borderRadius: radius.lg, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
});
