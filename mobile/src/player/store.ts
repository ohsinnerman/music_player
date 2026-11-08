import { makeMutable } from 'react-native-reanimated';
import { create } from 'zustand';
import type { PlayContext, Track } from '@/api/types';

export type RepeatMode = 'off' | 'all' | 'one';

export interface PlayerState {
  queue: Track[];
  /** Queue order before shuffle was switched on (to restore it). */
  original: Track[] | null;
  index: number;
  context: PlayContext | null;
  isPlaying: boolean;
  isBuffering: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  /** Sleep timer: epoch ms to pause at, -1 = end of current song, null = off. */
  sleepAt: number | null;
}

export const usePlayer = create<PlayerState>()(() => ({
  queue: [],
  original: null,
  index: -1,
  context: null,
  isPlaying: false,
  isBuffering: false,
  repeat: 'off',
  shuffle: false,
  sleepAt: null,
}));

export const useCurrentTrack = (): Track | undefined => usePlayer((s) => s.queue[s.index]);

/**
 * Playback clock on the UI thread. Native status arrives every ~250ms; the
 * frame callback in <PlaybackClock/> interpolates between updates so the
 * scrubber and lyrics move at 60/120fps without React re-renders.
 */
export const clock = {
  base: makeMutable(0), // seconds at last native update
  at: makeMutable(0), // Date.now() of last native update
  playing: makeMutable(false),
  duration: makeMutable(0),
  /** Interpolated position (seconds). Read this in animations. */
  position: makeMutable(0),
  /** True while the user drags the scrubber (freezes lyrics auto-scroll jumps). */
  scrubbing: makeMutable(false),
};

/** Coarse position for JS consumers (updated ~4x/second). */
export const useProgress = create<{ position: number; duration: number }>()(() => ({ position: 0, duration: 0 }));
