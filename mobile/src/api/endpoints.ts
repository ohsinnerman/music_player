import { api, qs } from './client';
import type {
  Album,
  ArtistDetail,
  AuthPayload,
  Genre,
  Lyrics,
  Playlist,
  SearchResults,
  Section,
  ServerConfig,
  Track,
  User,
  UserPlaylist,
} from './types';

const enc = encodeURIComponent;

export const endpoints = {
  health: () => api.get<{ status: string }>('/health'),
  config: () => api.get<ServerConfig>('/config'),

  // Auth
  register: (b: { email: string; password: string; displayName: string }) => api.public<AuthPayload>('POST', '/auth/register', b),
  login: (b: { email: string; password: string }) => api.public<AuthPayload>('POST', '/auth/login', b),
  logout: (refreshToken: string) => api.public<void>('POST', '/auth/logout', { refreshToken }),

  // Catalog
  home: (signal?: AbortSignal) => api.get<Section[]>('/browse/home', signal),
  genres: () => api.get<Genre[]>('/browse/genres'),
  genre: (id: string) => api.get<{ genre: Genre; tracks: Track[] }>(`/browse/genres/${enc(id)}`),
  search: (q: string, signal?: AbortSignal) => api.get<SearchResults>(`/search${qs({ q, limit: 25 })}`, signal),
  track: (id: string) => api.get<Track>(`/tracks/${enc(id)}`),
  album: (id: string) => api.get<Album>(`/albums/${enc(id)}`),
  artist: (id: string) => api.get<ArtistDetail>(`/artists/${enc(id)}`),
  playlist: (id: string) => api.get<Playlist>(`/playlists/${enc(id)}`),
  radio: (id: string) => api.get<Track[]>(`/tracks/${enc(id)}/radio`),
  lyrics: (trackId: string, signal?: AbortSignal) => api.get<Lyrics>(`/lyrics${qs({ trackId })}`, signal),

  // Me
  me: () => api.get<User>('/me'),
  updateMe: (displayName: string) => api.patch<User>('/me', { displayName }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<Omit<AuthPayload, 'user'>>('/me/password', { currentPassword, newPassword }),
  logoutAll: () => api.post<void>('/me/logout-all'),
  deleteAccount: (password: string) => api.del<void>('/me', { password }),

  likes: () => api.get<(Track & { likedAt: string })[]>('/me/likes'),
  like: (id: string) => api.put<void>(`/me/likes/${enc(id)}`),
  unlike: (id: string) => api.del<void>(`/me/likes/${enc(id)}`),

  myPlaylists: () => api.get<UserPlaylist[]>('/me/playlists'),
  myPlaylist: (id: string) => api.get<UserPlaylist>(`/me/playlists/${enc(id)}`),
  createPlaylist: (title: string, trackIds?: string[]) => api.post<UserPlaylist>('/me/playlists', { title, trackIds }),
  updatePlaylist: (id: string, patch: { title?: string; description?: string; trackIds?: string[] }) =>
    api.patch<UserPlaylist>(`/me/playlists/${enc(id)}`, patch),
  addToPlaylist: (id: string, trackIds: string[]) => api.post<UserPlaylist>(`/me/playlists/${enc(id)}/tracks`, { trackIds }),
  removeFromPlaylist: (id: string, trackId: string) => api.del<UserPlaylist>(`/me/playlists/${enc(id)}/tracks/${enc(trackId)}`),
  deletePlaylist: (id: string) => api.del<void>(`/me/playlists/${enc(id)}`),

  history: () => api.get<(Track & { playedAt: string })[]>('/me/history?limit=100'),
  recordPlay: (trackId: string) => api.post<void>('/me/history', { trackId }),
};
