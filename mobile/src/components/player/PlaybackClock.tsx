import { useEffect } from 'react';
import { useFrameCallback } from 'react-native-reanimated';
import { clock, usePlayer } from '@/player/store';

/**
 * Mount once. Interpolates the native position between status updates, every
 * frame, on the UI thread — but only while audio is actually playing, so a
 * paused app isn't spinning a 120Hz frame loop for nothing. While paused the
 * engine writes `clock.position` directly from native status / seeks.
 */
export function PlaybackClock() {
  const isPlaying = usePlayer((s) => s.isPlaying);
  const cb = useFrameCallback(() => {
    'worklet';
    if (clock.scrubbing.value) return;
    let p = clock.base.value;
    if (clock.playing.value) p += (Date.now() - clock.at.value) / 1000;
    const d = clock.duration.value;
    if (d > 0 && p > d) p = d;
    if (Math.abs(p - clock.position.value) > 0.004) clock.position.value = p;
  }, false);

  useEffect(() => {
    cb.setActive(isPlaying);
  }, [cb, isPlaying]);

  return null;
}
