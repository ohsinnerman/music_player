import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useMemo } from 'react';
import { endpoints } from '@/api/endpoints';
import { qk, queryClient } from '@/api/queries';
import type { Playlist, Track, UserPlaylist } from '@/api/types';
import { onSignedIn, useAuth } from '@/auth/store';
import { toast } from '@/components/ui/Toast';
import { type LocalPlaylist, useLocalLibrary } from './store';

const isAuthed = () => useAuth.getState().status === 'authed';

/** A playlist in the library list, regardless of where it's stored. */
export type LibraryPlaylist = Playlist & { updatedAt?: string };

const fromLocal = (p: LocalPlaylist): LibraryPlaylist => ({
  kind: 'playlist',
  id: p.id,
  title: p.title,
  description: p.description,
  artwork: p.tracks[0]?.artwork ?? {},
  trackCount: p.tracks.length,
  provider: 'user',
  tracks: p.tracks,
  updatedAt: p.updatedAt,
});

/* ───────────────────────── Likes ───────────────────────── */

export function useLikedTracks() {
  const authed = useAuth((s) => s.status === 'authed');
  const local = useLocalLibrary((s) => s.likes);
  const remote = useQuery({ queryKey: qk.likes, queryFn: endpoints.likes, enabled: authed, staleTime: 60_000 });
  return authed
    ? { tracks: (remote.data ?? []) as Track[], isLoading: remote.isLoading, refetch: remote.refetch }
    : { tracks: local, isLoading: false, refetch: async () => undefined };
}

export function useLikedIds(): Set<string> {
  const { tracks } = useLikedTracks();
  return useMemo(() => new Set(tracks.map((t) => t.id)), [tracks]);
}

export function useIsLiked(id: string | undefined): boolean {
  const ids = useLikedIds();
  return !!id && ids.has(id);
}

export async function toggleLike(track: Track, liked: boolean) {
  if (!isAuthed()) {
    useLocalLibrary.getState().setLikes((l) => (liked ? l.filter((t) => t.id !== track.id) : [track, ...l]));
    return;
  }
  const prev = queryClient.getQueryData<Track[]>(qk.likes);
  queryClient.setQueryData<Track[]>(qk.likes, (l = []) => (liked ? l.filter((t) => t.id !== track.id) : [track, ...l]));
  try {
    await (liked ? endpoints.unlike(track.id) : endpoints.like(track.id));
  } catch {
    queryClient.setQueryData(qk.likes, prev);
    toast('Couldn’t update your likes', 'error');
  }
}

/* ───────────────────────── Playlists ───────────────────────── */

export function usePlaylists() {
  const authed = useAuth((s) => s.status === 'authed');
  const local = useLocalLibrary((s) => s.playlists);
  const remote = useQuery({ queryKey: qk.myPlaylists, queryFn: endpoints.myPlaylists, enabled: authed });
  const localMapped = useMemo(() => local.map(fromLocal), [local]);
  return authed
    ? { playlists: (remote.data ?? []) as LibraryPlaylist[], isLoading: remote.isLoading }
    : { playlists: localMapped, isLoading: false };
}

export function useLibraryPlaylist(id: string) {
  const authed = useAuth((s) => s.status === 'authed');
  const local = useLocalLibrary((s) => s.playlists.find((p) => p.id === id));
  const remote = useQuery({ queryKey: qk.myPlaylist(id), queryFn: () => endpoints.myPlaylist(id), enabled: authed && !!id });
  if (authed) return { playlist: remote.data as LibraryPlaylist | undefined, isLoading: remote.isLoading, error: remote.error };
  return { playlist: local ? fromLocal(local) : undefined, isLoading: false, error: null };
}

const now = () => new Date().toISOString();

export async function createPlaylist(title: string, tracks: Track[] = []): Promise<string | null> {
  const name = title.trim().slice(0, 80);
  if (!name) return null;
  if (!isAuthed()) {
    const id = Crypto.randomUUID();
    useLocalLibrary.getState().setPlaylists((p) => [{ id, title: name, tracks, createdAt: now(), updatedAt: now() }, ...p]);
    return id;
  }
  try {
    const p = await endpoints.createPlaylist(name, tracks.map((t) => t.id));
    queryClient.invalidateQueries({ queryKey: qk.myPlaylists });
    return p.id;
  } catch {
    toast('Couldn’t create the playlist', 'error');
    return null;
  }
}

export async function addToPlaylist(id: string, tracks: Track[]) {
  if (!isAuthed()) {
    useLocalLibrary.getState().setPlaylists((list) =>
      list.map((p) => {
        if (p.id !== id) return p;
        const have = new Set(p.tracks.map((t) => t.id));
        return { ...p, tracks: [...p.tracks, ...tracks.filter((t) => !have.has(t.id))], updatedAt: now() };
      }),
    );
    return true;
  }
  try {
    const p = await endpoints.addToPlaylist(id, tracks.map((t) => t.id));
    queryClient.setQueryData<UserPlaylist>(qk.myPlaylist(id), p);
    queryClient.invalidateQueries({ queryKey: qk.myPlaylists });
    return true;
  } catch {
    toast('Couldn’t add to playlist', 'error');
    return false;
  }
}

export async function removeFromPlaylist(id: string, trackId: string) {
  if (!isAuthed()) {
    useLocalLibrary.getState().setPlaylists((list) =>
      list.map((p) => (p.id === id ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId), updatedAt: now() } : p)),
    );
    return;
  }
  const prev = queryClient.getQueryData<UserPlaylist>(qk.myPlaylist(id));
  if (prev) queryClient.setQueryData<UserPlaylist>(qk.myPlaylist(id), { ...prev, tracks: prev.tracks?.filter((t) => t.id !== trackId) });
  try {
    queryClient.setQueryData(qk.myPlaylist(id), await endpoints.removeFromPlaylist(id, trackId));
    queryClient.invalidateQueries({ queryKey: qk.myPlaylists });
  } catch {
    if (prev) queryClient.setQueryData(qk.myPlaylist(id), prev);
    toast('Couldn’t remove the song', 'error');
  }
}

export async function renamePlaylist(id: string, title: string) {
  const name = title.trim().slice(0, 80);
  if (!name) return;
  if (!isAuthed()) {
    useLocalLibrary.getState().setPlaylists((list) => list.map((p) => (p.id === id ? { ...p, title: name, updatedAt: now() } : p)));
    return;
  }
  try {
    queryClient.setQueryData(qk.myPlaylist(id), await endpoints.updatePlaylist(id, { title: name }));
    queryClient.invalidateQueries({ queryKey: qk.myPlaylists });
  } catch {
    toast('Couldn’t rename the playlist', 'error');
  }
}

export async function deletePlaylist(id: string) {
  if (!isAuthed()) {
    useLocalLibrary.getState().setPlaylists((list) => list.filter((p) => p.id !== id));
    return;
  }
  try {
    await endpoints.deletePlaylist(id);
    queryClient.removeQueries({ queryKey: qk.myPlaylist(id) });
    queryClient.invalidateQueries({ queryKey: qk.myPlaylists });
  } catch {
    toast('Couldn’t delete the playlist', 'error');
  }
}

/* ───────────────────────── History ───────────────────────── */

export function useRecentlyPlayed(limit = 20) {
  const history = useLocalLibrary((s) => s.history);
  return useMemo(() => history.slice(0, limit), [history, limit]);
}

export function recordPlay(track: Track) {
  useLocalLibrary.getState().pushHistory(track);
  if (isAuthed()) endpoints.recordPlay(track.id).catch(() => undefined);
}

/* ───────────────────────── Guest → account sync ───────────────────────── */

onSignedIn(async () => {
  const { likes, playlists, clearSynced } = useLocalLibrary.getState();
  if (!likes.length && !playlists.length) return;
  try {
    // Oldest first so the server's "newest liked" order matches the device.
    for (const t of [...likes].reverse().slice(-300)) await endpoints.like(t.id).catch(() => undefined);
    for (const p of playlists) await endpoints.createPlaylist(p.title, p.tracks.map((t) => t.id).slice(0, 100)).catch(() => undefined);
    clearSynced();
    queryClient.invalidateQueries({ queryKey: ['me'] });
    toast('Your library is now synced to your account', 'success');
  } catch {
    /* keep local copy; we'll retry next sign-in */
  }
});
