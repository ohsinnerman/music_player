import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '@/api/types';
import { persistStorage } from '@/lib/storage';

export interface LocalPlaylist {
  id: string;
  title: string;
  description?: string;
  tracks: Track[];
  createdAt: string;
  updatedAt: string;
}

interface LocalLibrary {
  likes: Track[];
  playlists: LocalPlaylist[];
  history: Track[];
  setLikes: (fn: (l: Track[]) => Track[]) => void;
  setPlaylists: (fn: (p: LocalPlaylist[]) => LocalPlaylist[]) => void;
  pushHistory: (t: Track) => void;
  clearHistory: () => void;
  clearSynced: () => void;
}

/**
 * Guest library, kept on the device. Signed-in users use the server copy
 * (see hooks.ts); history is mirrored locally for both so "Recently played"
 * is instant and works offline.
 */
export const useLocalLibrary = create<LocalLibrary>()(
  persist(
    (set) => ({
      likes: [],
      playlists: [],
      history: [],
      setLikes: (fn) => set((s) => ({ likes: fn(s.likes) })),
      setPlaylists: (fn) => set((s) => ({ playlists: fn(s.playlists) })),
      pushHistory: (t) => set((s) => ({ history: [t, ...s.history.filter((x) => x.id !== t.id)].slice(0, 100) })),
      clearHistory: () => set({ history: [] }),
      clearSynced: () => set({ likes: [], playlists: [] }),
    }),
    { name: 'aura.library', storage: persistStorage, version: 1 },
  ),
);
