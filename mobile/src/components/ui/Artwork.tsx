import { Image, type ImageStyle } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Music2 } from 'lucide-react-native';
import { memo } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import type { Artwork as ArtworkT } from '@/api/types';
import { art } from '@/lib/format';
import { radius as R, useColors } from '@/theme';

export interface ArtworkProps {
  artwork?: ArtworkT;
  uri?: string;
  size?: number;
  /** Which source size to load. Picks automatically from `size` if omitted. */
  quality?: 'small' | 'medium' | 'large';
  radius?: number;
  round?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Hairline inner border so dark covers don't melt into the background. */
  bordered?: boolean;
  priority?: 'low' | 'normal' | 'high';
}


export const Artwork = memo(function Artwork({
  artwork,
  uri,
  size,
  quality,
  radius = R.sm,
  round = false,
  style,
  bordered = true,
  priority = 'normal',
}: ArtworkProps) {
  const colors = useColors();
  const q = quality ?? (size && size <= 64 ? 'small' : size && size >= 300 ? 'large' : 'medium');
  const src = uri ?? art(artwork, q);
  const r = round ? 9999 : radius;
  const dims: ViewStyle = size ? { width: size, height: size } : { width: '100%', aspectRatio: 1 };

  return (
    <View style={[dims, { borderRadius: r, overflow: 'hidden', backgroundColor: colors.surface }, style]}>
      {src ? (
        <Image
          source={{ uri: src }}
          style={StyleSheet.absoluteFill as ImageStyle}
          contentFit="cover"
          transition={220}
          cachePolicy="memory-disk"
          recyclingKey={src}
          priority={priority}
        />
      ) : (
        <LinearGradient colors={[colors.surfaceHigh, colors.surface]} style={[StyleSheet.absoluteFill, styles.center]}>
          <Music2 size={size ? Math.max(14, size * 0.32) : 32} color={colors.textQuaternary} strokeWidth={1.75} />
        </LinearGradient>
      )}
      {bordered ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.border, { borderRadius: r }]} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  border: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
});
