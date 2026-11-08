import { Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react-native';
import { memo, useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { player } from '@/player/engine';
import { usePlayer } from '@/player/store';
import { colors, spring } from '@/theme';
import { IconButton } from '../ui/IconButton';
import { PressableScale } from '../ui/PressableScale';

/** Play ↔ pause with a springy cross-scale instead of a hard icon swap. */
export const PlayPauseIcon = memo(function PlayPauseIcon({ playing, size, color }: { playing: boolean; size: number; color: string }) {
  const v = useSharedValue(playing ? 1 : 0);
  useEffect(() => {
    v.value = withSpring(playing ? 1 : 0, spring.snappy);
  }, [playing, v]);
  const play = useAnimatedStyle(() => ({ opacity: 1 - v.value, transform: [{ scale: 0.6 + (1 - v.value) * 0.4 }, { rotate: `${v.value * -45}deg` }] }));
  const pause = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 0.6 + v.value * 0.4 }, { rotate: `${(1 - v.value) * 45}deg` }] }));
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, play]}>
        <Play size={size} color={color} fill={color} strokeWidth={0} style={{ marginLeft: size * 0.08 }} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, pause]}>
        <Pause size={size} color={color} fill={color} strokeWidth={0} />
      </Animated.View>
    </View>
  );
});

export const Controls = memo(function Controls({ width }: { width: number }) {
  const isPlaying = usePlayer((s) => s.isPlaying);
  const buffering = usePlayer((s) => s.isBuffering && !s.isPlaying);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);

  return (
    <View style={[styles.row, { width }]}>
      <View>
        <IconButton icon={Shuffle} label={shuffle ? 'Shuffle on' : 'Shuffle off'} active={shuffle} color={colors.textSecondary} iconSize={21} onPress={player.toggleShuffle} />
        {shuffle ? <View style={styles.dot} /> : null}
      </View>
      <IconButton icon={SkipBack} label="Previous" size={60} iconSize={30} fill={colors.text} strokeWidth={2.2} onPress={player.previous} haptic="soft" />
      <PressableScale onPress={player.toggle} scaleTo={0.9} hapticOnPress="medium" accessibilityLabel={isPlaying ? 'Pause' : 'Play'} style={styles.play}>
        {buffering ? <ActivityIndicator color="#0B0B0F" /> : <PlayPauseIcon playing={isPlaying} size={30} color="#0B0B0F" />}
      </PressableScale>
      <IconButton icon={SkipForward} label="Next" size={60} iconSize={30} fill={colors.text} strokeWidth={2.2} onPress={player.next} haptic="soft" />
      <View>
        <IconButton
          icon={repeat === 'one' ? Repeat1 : Repeat}
          label={repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat one'}
          active={repeat !== 'off'}
          color={colors.textSecondary}
          iconSize={21}
          onPress={player.cycleRepeat}
        />
        {repeat !== 'off' ? <View style={styles.dot} /> : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  center: { alignItems: 'center', justifyContent: 'center' },
  play: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  dot: { position: 'absolute', bottom: 2, alignSelf: 'center', width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
});
