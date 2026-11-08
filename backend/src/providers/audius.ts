import type { Album, Artist, ArtistDetail, Artwork, Playlist, Section, StreamInfo, Track } from '../domain/types.js';
import { notFound } from '../lib/errors.js';
import { type HttpClient, qs } from '../lib/http.js';
import { makeId } from '../lib/ids.js';
import type { CatalogProvider, ProviderSearch } from './types.js';

/**
 * Audius: an open, artist-owned catalogue with free FULL-LENGTH streaming.
 * API reference: https://docs.audius.co/api (base https://api.audius.co/v1)
 */

interface AudiusArtwork {
  '150x150'?: string;
  '480x480'?: string;
  '1000x1000'?: string;
}
interface AudiusUser {
  id: string;
  name: string;
  handle: string;
  is_verified?: boolean;
  follower_count?: number;
  bio?: string;
  profile_picture?: AudiusArtwork | null;
  cover_photo?: { '640x'?: string; '2000x'?: string } | null;
}
interface AudiusTrack {
  id: string;
  title: string;
  duration: number;
  genre?: string;
  mood?: string;
  play_count?: number;
  release_date?: string;
  artwork?: AudiusArtwork | null;
  user: AudiusUser;
  is_streamable?: boolean;
  is_delete?: boolean;
  access?: { stream?: boolean };
}
interface AudiusPlaylist {
  id: string;
  playlist_name: string;
  description?: string;
  is_album: boolean;
  artwork?: AudiusArtwork | null;
  user: AudiusUser;
  track_count?: number;
  release_date?: string;
}
interface Envelope<T> {
  data: T;
}

const art = (a?: AudiusArtwork | null): Artwork => ({
  small: a?.['150x150'],
  medium: a?.['480x480'],
  large: a?.['1000x1000'],
});

export interface AudiusOptions {
  base: string;
  appName: string;
  apiKey?: string;
}

export function createAudiusProvider(http: HttpClient, opts: AudiusOptions): CatalogProvider {
  const base = opts.base.replace(/\/$/, '');
  const auth = { app_name: opts.appName, api_key: opts.apiKey };
  const get = <T>(path: string, params: Record<string, string | number | boolean | undefined> = {}) =>
    http.json<Envelope<T>>(`${base}${path}${qs({ ...params, ...auth })}`).then((e) => e.data);

  const playable = (t: AudiusTrack) =>
    !t.is_delete && t.is_streamable !== false && (t.access?.stream ?? true);

  const toArtist = (u: AudiusUser): Artist => ({
    kind: 'artist',
    id: makeId('audius', u.id),
    name: u.name || u.handle,
    image: art(u.profile_picture),
    followers: u.follower_count,
    verified: !!u.is_verified,
    provider: 'audius',
  });

  const toTrack = (t: AudiusTrack): Track => ({
    kind: 'track',
    id: makeId('audius', t.id),
    title: t.title,
    artists: [{ id: makeId('audius', t.user.id), name: t.user.name || t.user.handle }],
    durationMs: Math.round((t.duration ?? 0) * 1000),
    artwork: art(t.artwork),
    explicit: false,
    streamKind: 'full',
    provider: 'audius',
    genre: t.genre || undefined,
    playCount: t.play_count,
    releaseDate: t.release_date,
  });

  const tracks = (list: AudiusTrack[] | null | undefined) => (list ?? []).filter(playable).map(toTrack);

  const toAlbum = (p: AudiusPlaylist, items?: AudiusTrack[]): Album => ({
    kind: 'album',
    id: makeId('audius', p.id),
    title: p.playlist_name,
    artists: [{ id: makeId('audius', p.user.id), name: p.user.name || p.user.handle }],
    artwork: art(p.artwork),
    releaseDate: p.release_date,
    trackCount: p.track_count,
    albumType: 'album',
    provider: 'audius',
    description: p.description,
    tracks: items ? tracks(items) : undefined,
  });

  const toPlaylist = (p: AudiusPlaylist, items?: AudiusTrack[]): Playlist => ({
    kind: 'playlist',
    id: makeId('audius', p.id),
    title: p.playlist_name,
    description: p.description,
    artwork: art(p.artwork),
    owner: { id: makeId('audius', p.user.id), name: p.user.name || p.user.handle },
    trackCount: p.track_count,
    provider: 'audius',
    tracks: items ? tracks(items) : undefined,
  });

  return {
    id: 'audius',
    label: 'Audius',
    fullTracks: true,

    async homeSections(): Promise<Section[]> {
      const [trending, underground, playlists] = await Promise.allSettled([
        get<AudiusTrack[]>('/tracks/trending', { time: 'week', limit: 30 }),
        get<AudiusTrack[]>('/tracks/trending/underground', { limit: 20 }),
        get<AudiusPlaylist[]>('/playlists/trending', { time: 'week', limit: 20 }),
      ]);
      const sections: Section[] = [];
      if (trending.status === 'fulfilled') {
        const list = tracks(trending.value);
        sections.push({ id: 'audius-quick', title: 'Quick picks', subtitle: 'Full tracks, trending this week', layout: 'quickpicks', items: list.slice(0, 12) });
        sections.push({ id: 'audius-trending', title: 'Trending now', subtitle: 'What everyone is playing', layout: 'shelf', items: list.slice(12) });
        // Distinct artists from trending make a good "artists" rail.
        const seen = new Set<string>();
        const artists: Artist[] = [];
        for (const t of trending.value) {
          if (seen.has(t.user.id)) continue;
          seen.add(t.user.id);
          artists.push(toArtist(t.user));
        }
        sections.push({ id: 'audius-artists', title: 'Artists on the rise', layout: 'artists', items: artists.slice(0, 15) });
      }
      if (playlists.status === 'fulfilled') {
        sections.push({ id: 'audius-playlists', title: 'Trending playlists', layout: 'shelf', items: playlists.value.map((p) => (p.is_album ? toAlbum(p) : toPlaylist(p))) });
      }
      if (underground.status === 'fulfilled') {
        sections.push({ id: 'audius-underground', title: 'Underground', subtitle: 'Fresh finds from new artists', layout: 'shelf', items: tracks(underground.value) });
      }
      return sections;
    },

    async search(query, limit): Promise<ProviderSearch> {
      const [t, u, p] = await Promise.allSettled([
        get<AudiusTrack[]>('/tracks/search', { query, limit }),
        get<AudiusUser[]>('/users/search', { query, limit: Math.min(limit, 10) }),
        get<AudiusPlaylist[]>('/playlists/search', { query, limit: Math.min(limit, 10) }),
      ]);
      const pl = p.status === 'fulfilled' ? p.value : [];
      return {
        tracks: t.status === 'fulfilled' ? tracks(t.value) : [],
        artists: u.status === 'fulfilled' ? u.value.map(toArtist) : [],
        albums: pl.filter((x) => x.is_album).map((x) => toAlbum(x)),
        playlists: pl.filter((x) => !x.is_album).map((x) => toPlaylist(x)),
      };
    },

    async track(raw) {
      const t = await get<AudiusTrack>(`/tracks/${raw}`);
      if (!t || !playable(t)) throw notFound('Track not available');
      return toTrack(t);
    },

    async album(raw) {
      const [list, items] = await Promise.all([
        get<AudiusPlaylist[] | AudiusPlaylist>(`/playlists/${raw}`),
        get<AudiusTrack[]>(`/playlists/${raw}/tracks`),
      ]);
      const p = Array.isArray(list) ? list[0] : list;
      if (!p) throw notFound();
      return toAlbum(p, items);
    },

    async playlist(raw) {
      const [list, items] = await Promise.all([
        get<AudiusPlaylist[] | AudiusPlaylist>(`/playlists/${raw}`),
        get<AudiusTrack[]>(`/playlists/${raw}/tracks`),
      ]);
      const p = Array.isArray(list) ? list[0] : list;
      if (!p) throw notFound();
      return p.is_album ? { ...toPlaylist(p, items) } : toPlaylist(p, items);
    },

    async artist(raw): Promise<ArtistDetail> {
      const [user, top, albums] = await Promise.all([
        get<AudiusUser>(`/users/${raw}`),
        get<AudiusTrack[]>(`/users/${raw}/tracks`, { sort_method: 'plays', limit: 20 }).catch(() => []),
        get<AudiusPlaylist[]>(`/users/${raw}/albums`, { limit: 20 }).catch(() => []),
      ]);
      return {
        ...toArtist(user),
        bio: user.bio,
        cover: user.cover_photo?.['2000x'] ?? user.cover_photo?.['640x'],
        topTracks: tracks(top).slice(0, 10),
        albums: albums.map((a) => toAlbum(a)),
      };
    },

    async stream(raw): Promise<StreamInfo> {
      const expiresAt = new Date(Date.now() + 50 * 60_000).toISOString();
      if (opts.apiKey) {
        // Resolve to the signed content-node URL server-side so the API key never reaches the client.
        const data = await get<string | { url?: string }>(`/tracks/${raw}/stream`, { no_redirect: true });
        const url = typeof data === 'string' ? data : data?.url;
        if (url) return { url, kind: 'full', expiresAt, mimeType: 'audio/mpeg' };
      }
      return {
        url: `${base}/tracks/${raw}/stream${qs({ app_name: opts.appName })}`,
        kind: 'full',
        expiresAt,
        mimeType: 'audio/mpeg',
      };
    },

    async genreTracks(genre, limit) {
      const list = await get<AudiusTrack[]>('/tracks/trending', { genre, time: 'month', limit });
      return tracks(list);
    },
  };
}
