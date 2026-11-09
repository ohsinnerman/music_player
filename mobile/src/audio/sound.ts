import { Platform } from 'react-native';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setSoundConfig } from '../../modules/aura-audio-route';
import { persistStorage } from '@/lib/storage';
import { autoPreamp, BANDS, chain, type HeadphoneProfile } from './eq';

export type ReplayGainMode = 'off' | 'track' | 'album';

/**
 * Sound settings: ReplayGain, EQ (graphic bands + AutoEq headphone
 * correction), surround downmix and bit-perfect USB. Persisted, and pushed to
 * the player's native output stage (AuraDsp) whenever they change — the
 * player applies them live, mid-song.
 */
interface SoundState {
  replayGain: ReplayGainMode;
  /** Added to the ReplayGain value (dB). */
  preampDb: number;
  /** Used when ReplayGain is on but a song has no tags (dB). */
  noTagDb: number;
  preventClip: boolean;
  /** Surround (5.1 / 7.1) files are mixed down to stereo. */
  downmix: boolean;
  /** Android 14+ USB DAC: bypass the mixer at the song's own rate. */
  bitPerfect: boolean;
  eqEnabled: boolean;
  bands: number[];
  presetId: string | null;
  headphone: HeadphoneProfile | null;
  set: (patch: Partial<Omit<SoundState, 'set' | 'setBand'>>) => void;
  setBand: (i: number, db: number) => void;
}

export const useSound = create<SoundState>()(
  persist(
    (set) => ({
      replayGain: 'off',
      preampDb: 0,
      noTagDb: 0,
      preventClip: true,
      downmix: true,
      bitPerfect: false,
      eqEnabled: false,
      bands: BANDS.map(() => 0),
      presetId: 'flat',
      headphone: null,
      set: (patch) => set(patch),
      setBand: (i, db) => set((s) => ({ bands: s.bands.map((v, k) => (k === i ? db : v)), presetId: null })),
    }),
    {
      name: 'aura.sound',
      storage: persistStorage,
      version: 1,
      partialize: ({ set: _s, setBand: _b, ...rest }) => rest,
    },
  ),
);

/** What the native side receives. */
export function nativeConfig(s: SoundState) {
  const filters = chain(s.bands, s.headphone);
  return {
    replayGain: s.replayGain,
    preampDb: s.preampDb,
    noTagDb: s.noTagDb,
    preventClip: s.preventClip,
    downmix: s.downmix,
    bitPerfect: s.bitPerfect,
    eqEnabled: s.eqEnabled && filters.length > 0,
    eqPreampDb: Math.min(0, autoPreamp(filters)),
    filters,
  };
}

let last = '';
function push(s: SoundState) {
  if (Platform.OS !== 'android') return;
  const cfg = nativeConfig(s);
  const key = JSON.stringify(cfg);
  if (key === last) return;
  last = key;
  setSoundConfig(cfg);
}

// Sync on load and on every change.
if (useSound.persist.hasHydrated()) push(useSound.getState());
useSound.persist.onFinishHydration(push);
useSound.subscribe(push);
