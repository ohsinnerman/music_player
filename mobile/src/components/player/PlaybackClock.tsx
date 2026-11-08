import { useFrameCallback } from 'react-native-reanimated';
import { clock } from '@/player/store';

/** Mount once. Interpolates the native position between status updates, every frame, on the UI thread. */
export function PlaybackClock() {
  useFrameCallback(() => {
    'worklet';
    if (clock.scrubbing.value) return;
    let p = clock.base.value;
    if (clock.playing.value) p += (Date.now() - clock.at.value) / 1000;
    const d = clock.duration.value;
    if (d > 0 && p > d) p = d;
    if (Math.abs(p - clock.position.value) > 0.004) clock.position.value = p;
  });
  return null;
}
