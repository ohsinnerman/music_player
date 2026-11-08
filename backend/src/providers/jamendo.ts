import type { Album, Artist, ArtistDetail, Playlist, Section, StreamInfo, Track } from '../domain/types.js';
import { notFound } from '../lib/errors.js';
import { type HttpClient, qs } from '../lib/http.js';
import { makeId } from '../lib/ids.js';
import type { CatalogProvider, ProviderSearch } from './types.js';

/**
 * Jamendo: Creative-Commons music with FULL-LENGTH streams. Needs a free
 * client_id from https://devportal.jamendo.com. Optional provider.
 */

interface JmTrack {
  id: string;
  name: string;
  duration: number;
  artist_id: string;
  artist_name: string;
  album_id?: string;
  album_name?: string;
  album_image?: string;
  image?: string;
  audio?: string;
  releasedate?: string;
  audiodownload_allowed?: boolean;
  musicinfo?: { tags?: { genres?: string[] } };
}
interface JmAlbum {
  id: string;
  name: string;
  artist_id: string;
  artist_name: string;
  image?: string;
  releasedate?: string;
  tracks?: JmTrack[];
}
interface JmArtist {
  id: string;
  name: string;
  image?: string;
  tracks?: JmTrack[];
}
interface JmPlaylist {
  id: string;
  name: string;
  user_id?: string;
  user_name?: string;
  tracks?: JmTrack[];
}
interface JmResponse<T> {
  headers: { status: string; code: number; error_message?: string };
  results: T[];
}

// Jamendo image URLs accept a "width" query param for resizing.
const sized = (url: string | undefined, w: number) => (url ? url.replace(/([?&])width=\d+/, `$1width=${w}`) : undefined);
const artFrom = (url?: string) => ({ small: sized(url, 200), medium: sized(url, 500), large: sized(url, 1000) ?? url });

export function createJamendoProvider(http: HttpClient, base: string, clientId: string): CatalogProvider {
  const root = base.replace(/\/$/, '');
  const get = async <T>(path: string, params: Record<string, string | number | undefined>) => {
    const res = await http.json<JmResponse<T>>(
      `${root}${path}/${qs({ client_id: clientId, format: 'json', imagesize: 600, ...params })}`,
    );
    return res.results ?? [];
  };

  const toTrack = (t: JmTrack): Track => ({
    kind: 'track',
    id: makeId('jamendo', t.id),
    title: t.name,
    artists: [{ id: makeId('jamendo', t.artist_id), name: t.artist_name }],
    album: t.album_id ? { id: makeId('jamendo', t.album_id), title: t.album_name ?? '' } : undefined,
    durationMs: (t.duration ?? 0) * 1000,
    artwork: artFrom(t.album_image || t.image),
    explicit: false,
    streamKind: 'full',
    provider: 'jamendo',
    genre: t.musicinfo?.tags?.genres?.[0],
    releaseDate: t.releasedate,
  });
  const toAlbum = (a: JmAlbum, tracks?: JmTrack[]): Album => ({
    kind: 'album',
    id: makeId('jamendo', a.id),
    title: a.name,
    artists: [{ id: makeId('jamendo', a.artist_id), name: a.artist_name }],
    artwork: artFrom(a.image),
    releaseDate: a.releasedate,
    albumType: 'album',
    provider: 'jamendo',
    trackCount: tracks?.length,
    tracks: tracks?.map((t) => toTrack({ ...t, album_id: a.id, album_name: a.name, album_image: a.image, artist_id: a.artist_id, artist_name: a.artist_name })),
  });
  const toArtist = (a: JmArtist): Artist => ({
    kind: 'artist',
    id: makeId('jamendo', a.id),
    name: a.name,
    image: artFrom(a.image),
    provider: 'jamendo',
  });

  return {
    id: 'jamendo',
    label: 'Jamendo',
    fullTracks: true,

    async homeSections(): Promise<Section[]> {
      const [popular, albums] = await Promise.allSettled([
        get<JmTrack>('/tracks', { order: 'popularity_week', limit: 30, include: 'musicinfo' }),
        get<JmAlbum>('/albums', { order: 'popularity_week', limit: 20 }),
      ]);
      const out: Section[] = [];
      if (popular.status === 'fulfilled') out.push({ id: 'jamendo-popular', title: 'Creative Commons hits', subtitle: 'Full tracks from Jamendo', layout: 'shelf', items: popular.value.map(toTrack) });
      if (albums.status === 'fulfilled') out.push({ id: 'jamendo-albums', title: 'Independent albums', layout: 'shelf', items: albums.value.map((a) => toAlbum(a)) });
      return out;
    },

    async search(query, limit): Promise<ProviderSearch> {
      const [t, al, ar] = await Promise.allSettled([
        get<JmTrack>('/tracks', { search: query, limit }),
        get<JmAlbum>('/albums', { namesearch: query, limit: Math.min(limit, 10) }),
        get<JmArtist>('/artists', { namesearch: query, limit: Math.min(limit, 10) }),
      ]);
      return {
        tracks: t.status === 'fulfilled' ? t.value.map(toTrack) : [],
        albums: al.status === 'fulfilled' ? al.value.map((a) => toAlbum(a)) : [],
        artists: ar.status === 'fulfilled' ? ar.value.map(toArtist) : [],
        playlists: [],
      };
    },

    async track(raw) {
      const [t] = await get<JmTrack>('/tracks', { id: raw });
      if (!t) throw notFound();
      return toTrack(t);
    },

    async album(raw) {
      const [a] = await get<JmAlbum>('/albums/tracks', { id: raw });
      if (!a) throw notFound();
      return toAlbum(a, a.tracks ?? []);
    },

    async playlist(raw): Promise<Playlist> {
      const [p] = await get<JmPlaylist>('/playlists/tracks', { id: raw });
      if (!p) throw notFound();
      const tracks = (p.tracks ?? []).map(toTrack);
      return {
        kind: 'playlist',
        id: makeId('jamendo', p.id),
        title: p.name,
        artwork: tracks[0]?.artwork ?? {},
        owner: p.user_id ? { id: `jamendo-user:${p.user_id}`, name: p.user_name ?? '' } : undefined,
        trackCount: tracks.length,
        provider: 'jamendo',
        tracks,
      };
    },

    async artist(raw): Promise<ArtistDetail> {
      const [[a], [withTracks], albums] = await Promise.all([
        get<JmArtist>('/artists', { id: raw }),
        get<JmArtist>('/artists/tracks', { id: raw, limit: 10, order: 'popularity_total' }).catch(() => []),
        get<JmAlbum>('/albums', { artist_id: raw, limit: 20 }).catch(() => []),
      ]);
      if (!a) throw notFound();
      return {
        ...toArtist(a),
        topTracks: (withTracks?.tracks ?? []).map((t) => toTrack({ ...t, artist_id: a.id, artist_name: a.name })),
        albums: albums.map((al) => toAlbum(al)),
      };
    },

    async stream(raw): Promise<StreamInfo> {
      const [t] = await get<JmTrack>('/tracks', { id: raw, audioformat: 'mp32' });
      if (!t?.audio) throw notFound('Stream not available');
      return { url: t.audio, kind: 'full', expiresAt: new Date(Date.now() + 6 * 3600_000).toISOString(), mimeType: 'audio/mpeg' };
    },

    async genreTracks(genre, limit) {
      const list = await get<JmTrack>('/tracks', { tags: genre.toLowerCase().replace(/[^a-z0-9]+/g, ''), order: 'popularity_month', limit });
      return list.map(toTrack);
    },
  };
}
