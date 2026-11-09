import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { endpoints } from '@/api/endpoints';
import type { Album, AlbumInfo, Artist, ArtistInfo, Track } from '@/api/types';
import { persistStorage } from '@/lib/storage';
import { groupAlbums, groupArtists, hasArt, type LocalAlbum, type LocalArtist } from './group';
import { useDeviceMusic } from './store';

export type { LocalAlbum, LocalArtist } from './group';
export { groupAlbums, groupArtists } from './group';

/**
 * Albums and artists built from the songs on the phone, plus details from the
 * web (covers, artist photos, year, label, genres, Wikipedia summaries) cached
 * on the phone so pages work offline after the first visit.
 */

/* ───────────────────────── Web details (cached) ───────────────────────── */

type Cached<T> = { data: T | null; at: number };

interface InfoState {
  albums: Record<string, Cached<AlbumInfo>>;
  artists: Record<string, Cached<ArtistInfo>>;
  /** "Get art & details" batch progress. */
  batch: { done: number; total: number; label: string } | null;
}

export const useLibraryInfo = create<InfoState>()(
  persist((): InfoState => ({ albums: {}, artists: {}, batch: null }), {
    name: 'aura.library-info',
    storage: persistStorage,
    version: 1,
    partialize: (s) => ({ albums: s.albums, artists: s.artists }),
  }),
);

const FRESH = 30 * 24 * 3600_000;
const RETRY_EMPTY = 24 * 3600_000;
const stale = (c: Cached<unknown> | undefined) => !c || Date.now() - c.at > (c.data ? FRESH : RETRY_EMPTY);
const inflight = new Map<string, Promise<unknown>>();

/** Covers from the web for songs that have none (kept as URLs; expo-image caches them on disk). */
function fillArtwork(album: LocalAlbum, cover: string) {
  const store = useDeviceMusic.getState();
  for (const t of album.tracks) {
    if (!hasArt(t)) store.patchTrack(t.id, { artwork: { small: cover, medium: cover, large: cover } });
  }
}

export async function loadAlbumInfo(album: LocalAlbum, force = false): Promise<AlbumInfo | null> {
  const cached = useLibraryInfo.getState().albums[album.id];
  if (!force && !stale(cached)) return cached!.data;
  if (album.artist.name === 'Unknown artist') return null;
  const key = `al:${album.id}`;
  const running = inflight.get(key) as Promise<AlbumInfo | null> | undefined;
  if (running) return running;
  const p = (async () => {
    try {
      const info = await endpoints.albumInfo(album.artist.id === 'local-artist:various' ? 'Various Artists' : album.artist.name, album.title);
      useLibraryInfo.setState((s) => ({ albums: { ...s.albums, [album.id]: { data: info, at: Date.now() } } }));
      if (info.cover) fillArtwork(album, info.cover);
      return info;
    } catch {
      useLibraryInfo.setState((s) => ({ albums: { ...s.albums, [album.id]: { data: cached?.data ?? null, at: Date.now() } } }));
      return cached?.data ?? null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export async function loadArtistInfo(artist: { id: string; name: string }, force = false): Promise<ArtistInfo | null> {
  const cached = useLibraryInfo.getState().artists[artist.id];
  if (!force && !stale(cached)) return cached!.data;
  if (artist.id === 'local-artist:unknown' || artist.id === 'local-artist:various') return null;
  const key = `ar:${artist.id}`;
  const running = inflight.get(key) as Promise<ArtistInfo | null> | undefined;
  if (running) return running;
  const p = (async () => {
    try {
      const info = await endpoints.artistInfo(artist.name);
      useLibraryInfo.setState((s) => ({ artists: { ...s.artists, [artist.id]: { data: info, at: Date.now() } } }));
      return info;
    } catch {
      useLibraryInfo.setState((s) => ({ artists: { ...s.artists, [artist.id]: { data: cached?.data ?? null, at: Date.now() } } }));
      return cached?.data ?? null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

let batchCancel = false;

/** Fetch covers + details for every album and artist (second call cancels). */
export async function enrichAll(): Promise<{ albums: number; covers: number }> {
  if (useLibraryInfo.getState().batch) {
    batchCancel = true;
    return { albums: 0, covers: 0 };
  }
  batchCancel = false;
  const tracks = useDeviceMusic.getState().tracks;
  const albums = groupAlbums(tracks);
  const artists = groupArtists(tracks, albums);
  const todoAlbums = albums.filter((a) => stale(useLibraryInfo.getState().albums[a.id]));
  const todoArtists = artists.filter((a) => stale(useLibraryInfo.getState().artists[a.id]));
  const total = todoAlbums.length + todoArtists.length;
  let done = 0;
  let covers = 0;
  for (const a of todoAlbums) {
    if (batchCancel) break;
    useLibraryInfo.setState({ batch: { done, total, label: a.title } });
    const before = hasArt({ artwork: a.artwork } as Track);
    const info = await loadAlbumInfo(a);
    if (!before && info?.cover) covers++;
    done++;
  }
  for (const a of todoArtists) {
    if (batchCancel) break;
    useLibraryInfo.setState({ batch: { done, total, label: a.name } });
    await loadArtistInfo(a);
    done++;
  }
  useLibraryInfo.setState({ batch: null });
  return { albums: todoAlbums.length, covers };
}

/* ───────────────────────── Hooks ───────────────────────── */

export function useLocalLibrary() {
  const tracks = useDeviceMusic((s) => s.tracks);
  return useMemo(() => {
    const albums = groupAlbums(tracks);
    return { albums, artists: groupArtists(tracks, albums) };
  }, [tracks]);
}

/** As catalog cards (for MediaCard shelves). */
export function albumCard(a: LocalAlbum, info?: AlbumInfo | null): Album {
  const cover = info?.cover;
  const artwork = a.artwork.large || a.artwork.medium ? a.artwork : cover ? { small: cover, medium: cover, large: cover } : {};
  return { kind: 'album', id: a.id, title: a.title, artists: [a.artist], artwork, releaseDate: info?.year ?? a.year, trackCount: a.tracks.length, albumType: 'album', provider: 'local' };
}

export function artistCard(a: LocalArtist, info?: ArtistInfo | null): Artist {
  const img = info?.image;
  return { kind: 'artist', id: a.id, name: a.name, image: img ? { small: img, medium: img, large: img } : a.artwork, provider: 'local' };
}
