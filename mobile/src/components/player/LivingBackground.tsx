import { Blur, Canvas, Circle, Fill, Group, Image, Paint, useClock, useImage } from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useDerivedValue, useReducedMotion } from 'react-native-reanimated';
import type { Palette } from '@/lib/palette';

/**
 * The player's "living artwork" background, after Apple Music: two huge,
 * heavily blurred copies of the cover slowly orbiting, plus soft colour
 * blobs from the palette.
 *
 * Perf trick: it renders into a canvas 1/5 of the screen size and is scaled
 * up 5× by the GPU. It's blurred anyway, so it looks identical, at ~4% of
 * the pixel cost.
 */
const SCALE = 5;

export const LivingBackground = memo(function LivingBackground({ uri, palette, animate }: { uri?: string; palette: Palette; animate: boolean }) {
  const { width: W, height: H } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const w = Math.ceil(W / SCALE);
  const h = Math.ceil(H / SCALE);
  const image = useImage(uri ?? null);
  const t = useClock();
  const moving = animate && !reduceMotion;

  const size = Math.max(w, h) * 1.35;
  const cx = w / 2;
  const cy = h / 2;

  const rotA = useDerivedValue(() => [{ translateX: cx }, { translateY: cy * 0.7 }, { rotate: moving ? t.value / 14000 : 0.4 }, { translateX: -size / 2 }, { translateY: -size / 2 }]);
  const rotB = useDerivedValue(() => [{ translateX: cx }, { translateY: cy * 1.35 }, { rotate: moving ? -t.value / 19000 + 2 : 2.4 }, { translateX: -size / 2 }, { translateY: -size / 2 }]);
  const blobA = useDerivedValue(() => (moving ? cx + Math.sin(t.value / 5200) * w * 0.35 : cx * 0.6));
  const blobB = useDerivedValue(() => (moving ? cy + Math.cos(t.value / 6100) * h * 0.3 : cy * 1.3));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas
        style={{
          position: 'absolute',
          width: w,
          height: h,
          left: (W - w) / 2,
          top: (H - h) / 2,
          transform: [{ scale: SCALE + 0.05 }],
        }}
      >
        <Fill color={palette.dark} />
        <Group layer={<Paint><Blur blur={9} /></Paint>}>
          <Circle cx={blobA} cy={h * 0.25} r={w * 0.55} color={palette.vibrant} opacity={0.55} />
          <Circle cx={w * 0.3} cy={blobB} r={w * 0.6} color={palette.dominant} opacity={0.6} />
          {image ? (
            <>
              <Group transform={rotA} opacity={0.85}>
                <Image image={image} x={0} y={0} width={size} height={size} fit="cover" />
              </Group>
              <Group transform={rotB} opacity={0.55} blendMode="screen">
                <Image image={image} x={0} y={0} width={size} height={size} fit="cover" />
              </Group>
            </>
          ) : null}
        </Group>
      </Canvas>
      {/* Legibility scrim: darker at top (header) and bottom (controls). */}
      <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0.5)']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
    </View>
  );
});
