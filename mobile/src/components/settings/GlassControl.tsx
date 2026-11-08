import { memo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { GLASS_STAGES, type GlassStage, glassLevel, stageOf } from '@/lib/glass';
import { Text } from '../ui/Text';
import { GlassPreview } from './GlassPreview';
import { GlassSlider } from './GlassSlider';

/** Settings → Look & feel → Glass: live preview + material slider + what it means. */
export const GlassControl = memo(function GlassControl() {
  const [stage, setStage] = useState<GlassStage>(() => stageOf(glassLevel.value));
  useAnimatedReaction(
    () => stageOf(glassLevel.value),
    (s, prev) => {
      if (s !== prev) scheduleOnRN(setStage, s);
    },
  );
  const info = GLASS_STAGES.find((s) => s.key === stage)!;

  return (
    <View style={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text variant="body">Glass</Text>
        <Animated.View key={stage} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
          <Text variant="headline">{info.label}</Text>
        </Animated.View>
      </View>
      <GlassPreview />
      <GlassSlider />
      <Animated.View key={`b-${stage}`} entering={FadeIn.duration(220)}>
        <Text variant="footnote" tone="tertiary">
          {info.blurb}
        </Text>
      </Animated.View>
    </View>
  );
});
