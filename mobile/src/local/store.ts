import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SongMatch, Track } from '@/api/types';
import { persistStorage } from '@/lib/storage';

/** What we know about "which song is this" for an imported file. */
export interface IdentityState {
  status: 'pending' | 'found' | 'nolyrics' | 'error';
  match?: SongMatch | null;
  /** Lyrics came from the file itself, LRCLIB, or nowhere yet. */
  lyricsSource?: 'embedded' | 'lrclib';
  /** We already sent an audio clip for this file. */
  listened?: boolean;
  /** The server said listening could still help. */
  canListen?: boolean;
  at: string;
}

export interface ImportProgress {
  done: number;
  total: number;
  label: string;
}

interface DeviceMusic {
  tracks: Track[];
  liked: string[];
  ident: Record<string, IdentityState>;
  importing: ImportProgress | null;
  /** "Find lyrics for all" progress. */
  lyricsBatch: ImportProgress | null;
  add: (tracks: Track[]) => void;
  remove: (ids: string[]) => void;
  patchTrack: (id: string, patch: Partial<Track>) => void;
  setIdent: (id: string, s: IdentityState) => void;
  toggleLike: (id: string) => void;
  setImporting: (p: ImportProgress | null) => void;
  setLyricsBatch: (p: ImportProgress | null) => void;
}

/**
 * Songs the user imported from their phone. Only metadata lives here; the
 * audio stays where it is (we hold a persistent read permission to it), and
 * artwork / lyrics are small files in the app's document folder.
 */
export const useDeviceMusic = create<DeviceMusic>()(
  persist(
    (set) => ({
      tracks: [],
      liked: [],
      ident: {},
      importing: null,
      lyricsBatch: null,
      add: (tracks) =>
        set((s) => {
          const have = new Set(s.tracks.map((t) => t.id));
          return { tracks: [...tracks.filter((t) => !have.has(t.id)), ...s.tracks] };
        }),
      remove: (ids) =>
        set((s) => {
          const drop = new Set(ids);
          const ident = { ...s.ident };
          ids.forEach((id) => delete ident[id]);
          return { tracks: s.tracks.filter((t) => !drop.has(t.id)), liked: s.liked.filter((id) => !drop.has(id)), ident };
        }),
      patchTrack: (id, patch) => set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      setIdent: (id, st) => set((s) => ({ ident: { ...s.ident, [id]: st } })),
      toggleLike: (id) => set((s) => ({ liked: s.liked.includes(id) ? s.liked.filter((x) => x !== id) : [id, ...s.liked] })),
      setImporting: (importing) => set({ importing }),
      setLyricsBatch: (lyricsBatch) => set({ lyricsBatch }),
    }),
    {
      name: 'aura.device-music',
      storage: persistStorage,
      version: 1,
      partialize: (s) => ({ tracks: s.tracks, liked: s.liked, ident: s.ident }),
    },
  ),
);

export const isLocal = (t: { provider?: string; id: string } | undefined): boolean => !!t && (t.provider === 'local' || t.id.startsWith('local:'));
