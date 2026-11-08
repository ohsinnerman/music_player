import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { CollectionScreen } from '@/components/music/CollectionScreen';
import { EmptyState } from '@/components/ui/States';
import { useLikedTracks } from '@/library/hooks';
import { radius } from '@/theme';

export default function LikedScreen() {
  const { tracks, isLoading } = useLikedTracks();
  return (
    <CollectionScreen
      title="Liked Songs"
      kindLabel="Your favourites"
      wash={['#FF2D6B', '#3A0F1E']}
      customArt={
        <LinearGradient colors={['#FF5A36', '#FF2D6B', '#7A1E3A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.art}>
          <Heart size={84} color="#fff" fill="#fff" />
        </LinearGradient>
      }
      tracks={tracks}
      context={{ type: 'liked', id: 'liked', title: 'Liked Songs' }}
      isLoading={isLoading}
      empty={<EmptyState icon={Heart} title="Songs you like will appear here" body="Tap the heart on any song to save it." action={{ label: 'Find music', onPress: () => router.navigate('/explore') }} />}
    />
  );
}

const styles = StyleSheet.create({
  art: { width: 230, height: 230, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
});
