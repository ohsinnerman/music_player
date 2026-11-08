import type { Album, Artist, ArtistDetail, Artwork, Playlist, Section, StreamInfo, Track } from '../domain/types.js';
import { notFound, upstreamError } from '../lib/errors.js';
import { type HttpClient, qs } from '../lib/http.js';
import { makeId } from '../lib/ids.js';
import type { CatalogProvider, ProviderSearch } from './types.js';

/**
 * Deezer public API: mainstream catalogue + charts, no key needed.
 * Streams are 30-second previews (full playback needs a licence).
 * Reference: https://developers.deezer.com/api
 */

interface DzArtist {
  id: number;
  name: string;
  picture_medium?: string;
  picture_big?: string;
  picture_xl?: string;
  nb_fan?: number;
}
interface DzAlbumLite {
  id: number;
  title: string;
  cover_medium?: string;
  cover_big?: string;
  cover_xl?: string;
}
interface DzTrack {
  id: number;
  title: string;
  title_short?: string;
  duration: number;
  preview?: string;
  explicit_lyrics?: boolean;
  readable?: boolean;
  release_date?: string;
  artist: DzArtist;
  contributors?: DzArtist[];
  album?: DzAlbumLite;
}
interface DzAlbum extends DzAlbumLite {
  artist?: DzArtist;
  contributors?: DzArtist[];
  release_date?: string;
  nb_tracks?: number;
  record_type?: string;
  tracks?: { data: DzTrack[] };
}
interface DzPlaylist {
  id: number;
  title: string;
  description?: string;
  picture_medium?: string;
  picture_big?: string;
  picture_xl?: string;
  nb_tracks?: number;
  creator?: { id: number; name: string };
  user?: { id: number; name: string };
  tracks?: { data: DzTrack[] };
}
interface DzList<T> {
  data: T[];
}
interface DzError {
  error?: { type?: string; message?: string; code?: number };
}

const coverArt = (a?: DzAlbumLite): Artwork => ({ small: a?.cover_medium, medium: a?.cover_big, large: a?.cover_xl });
const pictureArt = (a?: { picture_medium?: string; picture_big?: string; picture_xl?: string }): Artwork => ({
  small: a?.picture_medium,
  medium: a?.picture_big,
  large: a?.picture_xl,
});
const albumType = (t?: string): Album['albumType'] =>
  t === 'single' ? 'single' : t === 'ep' ? 'ep' : t === 'compile' ? 'compilation' : 'album';

export function createDeezerProvider(http: HttpClient, base: string): CatalogProvider {
  const root = base.replace(/\/$/, '');

  async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const body = await http.json<T & DzError>(`${root}${path}${qs(params)}`);
    if (body && typeof body === 'object' && 'error' in body && body.error) {
      // Deezer reports errors with HTTP 200. 800 = no data.
      if (body.error.code === 800) throw notFound();
      throw upstreamError();
    }
    return body;
  }

  const toArtist = (a: DzArtist): Artist => ({
    kind: 'artist',
    id: makeId('deezer', a.id),
    name: a.name,
    image: pictureArt(a),
    followers: a.nb_fan,
    provider: 'deezer',
  });

  const toTrack = (t: DzTrack, album?: DzAlbumLite): Track => {
    const alb = t.album ?? album;
    const people = t.contributors?.length ? t.contributors : [t.artist];
    return {
      kind: 'track',
      id: makeId('deezer', t.id),
      title: t.title_short || t.title,
      artists: people.map((p) => ({ id: makeId('deezer', p.id), name: p.name })),
      album: alb ? { id: makeId('deezer', alb.id), title: alb.title } : undefined,
      durationMs: (t.duration ?? 0) * 1000,
      artwork: coverArt(alb),
      explicit: !!t.explicit_lyrics,
      streamKind: 'preview',
      provider: 'deezer',
      releaseDate: t.release_date,
    };
  };

  const playable = (t: DzTrack) => t.readable !== false && !!t.preview;

  const toAlbum = (a: DzAlbum): Album => ({
    kind: 'album',
    id: makeId('deezer', a.id),
    title: a.title,
    artists: (a.contributors?.length ? a.contributors : a.artist ? [a.artist] : []).map((p) => ({
      id: makeId('deezer', p.id),
      name: p.name,
    })),
    artwork: coverArt(a),
    releaseDate: a.release_date,
    trackCount: a.nb_tracks,
    albumType: albumType(a.record_type),
    provider: 'deezer',
    tracks: a.tracks ? a.tracks.data.filter(playable).map((t) => toTrack(t, a)) : undefined,
  });

  const toPlaylist = (p: DzPlaylist): Playlist => {
    const owner = p.creator ?? p.user;
    return {
      kind: 'playlist',
      id: makeId('deezer', p.id),
      title: p.title,
      description: p.description || undefined,
      artwork: pictureArt(p),
      owner: owner ? { id: `deezer-user:${owner.id}`, name: owner.name } : undefined,
      trackCount: p.nb_tracks,
      provider: 'deezer',
      tracks: p.tracks ? p.tracks.data.filter(playable).map((t) => toTrack(t)) : undefined,
    };
  };

  return {
    id: 'deezer',
    label: 'Deezer',
    fullTracks: false,

    async homeSections(): Promise<Section[]> {
      const [chart, releases] = await Promise.allSettled([
        get<{
          tracks: DzList<DzTrack>;
          albums: DzList<DzAlbum>;
          artists: DzList<DzArtist>;
          playlists: DzList<DzPlaylist>;
        }>('/chart/0', { limit: 30 }),
        get<DzList<DzAlbum>>('/editorial/0/releases', { limit: 20 }),
      ]);
      const sections: Section[] = [];
      if (chart.status === 'fulfilled') {
        const c = chart.value;
        sections.push({ id: 'deezer-hero', title: 'Featured', layout: 'hero', items: c.albums.data.slice(0, 8).map(toAlbum) });
        sections.push({ id: 'deezer-chart', title: 'Top 30 right now', subtitle: 'Global chart · previews', layout: 'chart', items: c.tracks.data.filter(playable).map((t) => toTrack(t)) });
        sections.push({ id: 'deezer-artists', title: 'Most played artists', layout: 'artists', items: c.artists.data.map(toArtist) });
        sections.push({ id: 'deezer-playlists', title: 'Editor’s playlists', layout: 'shelf', items: c.playlists.data.map(toPlaylist) });
      }
      if (releases.status === 'fulfilled') {
        sections.push({ id: 'deezer-new', title: 'New releases', layout: 'shelf', items: releases.value.data.map(toAlbum) });
      }
      return sections;
    },

    async search(query, limit): Promise<ProviderSearch> {
      const [t, al, ar, pl] = await Promise.allSettled([
        get<DzList<DzTrack>>('/search', { q: query, limit }),
        get<DzList<DzAlbum>>('/search/album', { q: query, limit: Math.min(limit, 12) }),
        get<DzList<DzArtist>>('/search/artist', { q: query, limit: Math.min(limit, 10) }),
        get<DzList<DzPlaylist>>('/search/playlist', { q: query, limit: Math.min(limit, 10) }),
      ]);
      return {
        tracks: t.status === 'fulfilled' ? t.value.data.filter(playable).map((x) => toTrack(x)) : [],
        albums: al.status === 'fulfilled' ? al.value.data.map(toAlbum) : [],
        artists: ar.status === 'fulfilled' ? ar.value.data.map(toArtist) : [],
        playlists: pl.status === 'fulfilled' ? pl.value.data.map(toPlaylist) : [],
      };
    },

    async track(raw) {
      return toTrack(await get<DzTrack>(`/track/${raw}`));
    },

    async album(raw) {
      return toAlbum(await get<DzAlbum>(`/album/${raw}`));
    },

    async playlist(raw) {
      return toPlaylist(await get<DzPlaylist>(`/playlist/${raw}`));
    },

    async artist(raw): Promise<ArtistDetail> {
      const [a, top, albums] = await Promise.all([
        get<DzArtist>(`/artist/${raw}`),
        get<DzList<DzTrack>>(`/artist/${raw}/top`, { limit: 10 }).catch(() => ({ data: [] as DzTrack[] })),
        get<DzList<DzAlbum>>(`/artist/${raw}/albums`, { limit: 25 }).catch(() => ({ data: [] as DzAlbum[] })),
      ]);
      return {
        ...toArtist(a),
        cover: a.picture_xl,
        topTracks: top.data.filter(playable).map((t) => toTrack(t)),
        albums: albums.data.map((al) => toAlbum({ ...al, artist: al.artist ?? a })),
      };
    },

    async stream(raw): Promise<StreamInfo> {
      // Preview URLs are signed and expire, so always resolve a fresh one.
      const t = await get<DzTrack>(`/track/${raw}`);
      if (!t.preview) throw notFound('No preview available for this track');
      return {
        url: t.preview,
        kind: 'preview',
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        mimeType: 'audio/mpeg',
      };
    },

    async genreTracks(genre, limit) {
      const res = await get<DzList<DzTrack>>('/search', { q: `genre:"${genre.replace(/"/g, '')}"`, limit });
      return res.data.filter(playable).map((t) => toTrack(t));
    },
  };
}
