import type {
  Album,
  ArtistDetail,
  CatalogItem,
  Genre,
  Playlist,
  ProviderId,
  SearchResults,
  Section,
  StreamInfo,
  Track,
} from '../domain/types.js';
import type { TtlCache } from '../lib/cache.js';
import { notFound, upstreamError } from '../lib/errors.js';
import { parseId } from '../lib/ids.js';
import type { CatalogProvider } from '../providers/types.js';
import { GENRES, GENRE_QUERY } from './genres.js';

const MIN = 60_000;

/** Interleave lists so results from every provider surface near the top. */
function interleave<T>(lists: T[][], limit: number): T[] {
  const out: T[] = [];
  for (let i = 0; out.length < limit; i++) {
    let added = false;
    for (const l of lists) {
      const v = l[i];
      if (v !== undefined) {
        out.push(v);
        added = true;
        if (out.length >= limit) break;
      }
    }
    if (!added) break;
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function createCatalogService(providers: Map<ProviderId, CatalogProvider>, cache: TtlCache) {
  const list = [...providers.values()];

  function provider(id: ProviderId): CatalogProvider {
    const p = providers.get(id);
    if (!p) throw notFound('This music source is not enabled on the server');
    return p;
  }

  /** Home feed: every provider contributes sections; one failing source never breaks the page. */
  async function home(): Promise<Section[]> {
    return cache.wrap('home', 5 * MIN, async () => {
      const results = await Promise.allSettled(list.map((p) => p.homeSections()));
      const byId = new Map<string, Section>();
      for (const r of results) if (r.status === 'fulfilled') for (const s of r.value) if (s.items.length) byId.set(s.id, s);
      if (byId.size === 0) throw upstreamError();

      // Curated order: hero → quick picks → charts → the rest → genres.
      const order = [
        'deezer-hero',
        'audius-quick',
        'deezer-chart',
        'audius-trending',
        'deezer-new',
        'audius-artists',
        'audius-playlists',
        'deezer-playlists',
        'deezer-artists',
        'jamendo-popular',
        'audius-underground',
        'jamendo-albums',
      ];
      const sections: Section[] = [];
      for (const id of order) {
        const s = byId.get(id);
        if (s) {
          sections.push(s);
          byId.delete(id);
        }
      }
      sections.push(...byId.values());

      // No editorial hero (e.g. Deezer disabled)? Promote trending playlists.
      if (!sections.some((s) => s.layout === 'hero')) {
        const pl = sections.find((s) => s.id === 'audius-playlists');
        if (pl) sections.unshift({ ...pl, id: 'hero', title: 'Featured', layout: 'hero', items: pl.items.slice(0, 8) });
      }
      sections.splice(Math.min(4, sections.length), 0, {
        id: 'genres',
        title: 'Browse by mood & genre',
        layout: 'genres',
        items: GENRES.slice(0, 8),
      });
      return sections;
    });
  }

  async function search(query: string, limit = 20): Promise<SearchResults> {
    const q = query.trim();
    return cache.wrap(`search:${limit}:${norm(q)}`, 2 * MIN, async () => {
      const results = await Promise.allSettled(list.map((p) => p.search(q, limit)));
      const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      if (!ok.length && results.length) throw upstreamError();

      const tracks = interleave(ok.map((r) => r.tracks), limit);
      const albums = interleave(ok.map((r) => r.albums), limit);
      const artists = interleave(ok.map((r) => r.artists), Math.min(limit, 15));
      const playlists = interleave(ok.map((r) => r.playlists), Math.min(limit, 15));

      // Top result: an exact artist match beats everything, then an exact track title, then the first track.
      const nq = norm(q);
      const top: CatalogItem | undefined =
        artists.find((a) => norm(a.name) === nq) ??
        tracks.find((t) => norm(t.title) === nq) ??
        albums.find((a) => norm(a.title) === nq) ??
        tracks[0] ??
        artists[0];
      return { query: q, tracks, albums, artists, playlists, top };
    });
  }

  const entity = <T>(kind: string, id: string, load: (p: CatalogProvider, raw: string) => Promise<T>) => {
    const { provider: pid, raw } = parseId(id);
    return cache.wrap(`${kind}:${id}`, 30 * MIN, () => load(provider(pid), raw));
  };

  const track = (id: string) => entity<Track>('track', id, (p, raw) => p.track(raw));

  return {
    home,
    search,
    providers: () => list.map((p) => ({ id: p.id, label: p.label, fullTracks: p.fullTracks })),
    track,
    album: (id: string) => entity<Album>('album', id, (p, raw) => p.album(raw)),
    artist: (id: string) => entity<ArtistDetail>('artist', id, (p, raw) => p.artist(raw)),
    playlist: (id: string) => entity<Playlist>('playlist', id, (p, raw) => p.playlist(raw)),
    /** Stream URLs are short-lived, so cache them for a couple of minutes only. */
    stream: (id: string): Promise<StreamInfo> => {
      const { provider: pid, raw } = parseId(id);
      return cache.wrap(`stream:${id}`, 2 * MIN, () => provider(pid).stream(raw));
    },
    genres: (): Genre[] => GENRES,
    async genre(genreId: string): Promise<{ genre: Genre; tracks: Track[] }> {
      const genre = GENRES.find((g) => g.id === genreId);
      if (!genre) throw notFound('Unknown genre');
      const tracks = await cache.wrap(`genre:${genreId}`, 15 * MIN, async () => {
        const name = GENRE_QUERY[genreId] ?? genre.name;
        const res = await Promise.allSettled(list.filter((p) => p.genreTracks).map((p) => p.genreTracks!(name, 30)));
        return interleave(res.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])), 50);
      });
      return { genre, tracks };
    },
    /** Lightweight "radio": more tracks like the seed, from the same artist and genre. */
    async radio(seedId: string): Promise<Track[]> {
      const seed = await track(seedId);
      return cache.wrap(`radio:${seedId}`, 10 * MIN, async () => {
        const p = provider(seed.provider);
        const artistId = seed.artists[0]?.id;
        const [byArtist, byGenre] = await Promise.allSettled([
          artistId ? p.artist(parseId(artistId).raw).then((a) => a.topTracks) : Promise.resolve([] as Track[]),
          seed.genre && p.genreTracks ? p.genreTracks(seed.genre, 25) : p.search(seed.artists[0]?.name ?? seed.title, 25).then((r) => r.tracks),
        ]);
        const pool = interleave(
          [byGenre, byArtist].map((r) => (r.status === 'fulfilled' ? r.value : [])),
          50,
        );
        const seen = new Set([seed.id]);
        return pool.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true))).slice(0, 30);
      });
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
