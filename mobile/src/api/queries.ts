import { QueryClient, keepPreviousData, useQuery } from '@tanstack/react-query';
import { getLocalLyrics } from '@/local/identify';
import { ApiError } from './client';
import { endpoints } from './endpoints';
import type { Track } from './types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      retry: (count, err) => {
        if (err instanceof ApiError && (err.status === 404 || err.status === 400 || err.status === 401 || err.code === 'no_server')) return false;
        return count < 2;
      },
      retryDelay: (n) => Math.min(800 * 2 ** n, 6000),
      refetchOnWindowFocus: false,
    },
  },
});

export const qk = {
  home: ['home'] as const,
  genres: ['genres'] as const,
  genre: (id: string) => ['genre', id] as const,
  search: (q: string) => ['search', q.trim().toLowerCase()] as const,
  album: (id: string) => ['album', id] as const,
  artist: (id: string) => ['artist', id] as const,
  playlist: (id: string) => ['playlist', id] as const,
  lyrics: (id: string) => ['lyrics', id] as const,
  config: ['config'] as const,
  likes: ['me', 'likes'] as const,
  myPlaylists: ['me', 'playlists'] as const,
  myPlaylist: (id: string) => ['me', 'playlists', id] as const,
  history: ['me', 'history'] as const,
};

export const useHome = () => useQuery({ queryKey: qk.home, queryFn: ({ signal }) => endpoints.home(signal), staleTime: 3 * 60_000 });
export const useGenres = () => useQuery({ queryKey: qk.genres, queryFn: endpoints.genres, staleTime: Infinity });
export const useGenre = (id: string) => useQuery({ queryKey: qk.genre(id), queryFn: () => endpoints.genre(id), enabled: !!id });
export const useSearch = (q: string) =>
  useQuery({
    queryKey: qk.search(q),
    queryFn: ({ signal }) => endpoints.search(q.trim(), signal),
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
    staleTime: 2 * 60_000,
  });
export const useAlbum = (id: string) => useQuery({ queryKey: qk.album(id), queryFn: () => endpoints.album(id), enabled: !!id });
export const useArtist = (id: string) => useQuery({ queryKey: qk.artist(id), queryFn: () => endpoints.artist(id), enabled: !!id });
export const usePlaylist = (id: string) => useQuery({ queryKey: qk.playlist(id), queryFn: () => endpoints.playlist(id), enabled: !!id });
export const useLyrics = (track: Track | undefined) =>
  useQuery({
    queryKey: qk.lyrics(track?.id ?? ''),
    // Imported songs: embedded → cached → identify (tags / AI) → listen.
    queryFn: ({ signal }) => (track!.local ? getLocalLyrics(track!) : endpoints.lyrics(track!.id, signal)),
    enabled: !!track,
    staleTime: Infinity,
    retry: false,
  });
export const useServerConfig = () => useQuery({ queryKey: qk.config, queryFn: endpoints.config, staleTime: 10 * 60_000, retry: false });
