import type { TtlCache } from '../lib/cache.js';
import type { HttpClient } from '../lib/http.js';
import { qs } from '../lib/http.js';
import type { Groq } from './groq.js';
import { similarity } from './identify.js';

/**
 * Album / artist details for songs on the phone: covers, artist photos, year,
 * label, genres and a short description. Facts come from Deezer, MusicBrainz /
 * Cover Art Archive and Wikipedia; the AI is only used to pick which Wikipedia
 * article is the right one when the search is ambiguous — never to write facts.
 */

export interface TextSource {
  name: 'Wikipedia';
  url: string;
}

export interface AlbumInfo {
  title: string;
  artist: string;
  cover?: string;
  year?: string;
  releaseDate?: string;
  label?: string;
  genres: string[];
  trackCount?: number;
  summary?: string;
  summarySource?: TextSource;
  sources: string[];
}

export interface ArtistInfo {
  name: string;
  image?: string;
  fans?: number;
  genres: string[];
  summary?: string;
  summarySource?: TextSource;
  sources: string[];
}

export interface EnrichBases {
  deezer: string;
  musicbrainz: string;
  coverart: string;
  wikipedia: string;
}

interface DzAlbum {
  id: number;
  title: string;
  cover_xl?: string;
  cover_big?: string;
  nb_tracks?: number;
  release_date?: string;
  label?: string;
  genres?: { data?: { name: string }[] };
  artist?: { name: string };
}

interface DzArtist {
  id: number;
  name: string;
  picture_xl?: string;
  picture_big?: string;
  nb_fan?: number;
}

interface WikiSummary {
  type?: string;
  title?: string;
  description?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
}

/** Strip "(Deluxe Edition)", "[Remastered]" etc. for matching. */
export function baseTitle(s: string): string {
  return s
    .replace(/\s*[([][^)\]]*(edition|remaster|deluxe|expanded|anniversary|version|bonus)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(single|ep)$/i, '')
    .trim();
}

const ARTIST_WORDS = /\b(singer|songwriter|band|musician|rapper|composer|group|duo|trio|dj|producer|guitarist|pianist|vocalist|orchestra|ensemble|artist|music)\b/i;
const ALBUM_WORDS = /\b(album|ep|soundtrack|mixtape|compilation|record)\b/i;

/** Pick the Wikipedia article that is clearly about this artist / album (or null). */
export function pickWiki(cands: WikiSummary[], kind: 'artist' | 'album', name: string, artist?: string): WikiSummary | null {
  const scored = cands
    .filter((c) => c.type !== 'disambiguation' && c.extract && c.title)
    .map((c) => {
      const desc = `${c.description ?? ''} ${c.extract!.slice(0, 300)}`;
      let s = similarity(baseTitle(c.title!.replace(/\s*\([^)]*\)$/, '')), baseTitle(name));
      if (kind === 'artist' ? ARTIST_WORDS.test(desc) : ALBUM_WORDS.test(desc)) s += 0.5;
      if (kind === 'album' && artist && norm(desc).includes(norm(artist))) s += 0.5;
      return { c, s };
    })
    .sort((a, b) => b.s - a.s);
  const best = scored[0];
  if (!best || best.s < (kind === 'album' ? 1.5 : 1.3)) return null;
  // Two near-equal candidates: ambiguous.
  if (scored[1] && scored[1].s >= best.s - 0.05) return null;
  return best.c;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Two-sentence summary, at most ~420 characters. */
export function shorten(text: string, max = 420): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [clean];
  let out = '';
  for (const s of sentences) {
    if ((out + s).length > max) break;
    out += s;
  }
  return (out || `${clean.slice(0, max - 1)}…`).trim();
}

export type EnrichService = ReturnType<typeof createEnrichService>;

export function createEnrichService(opts: { http: HttpClient; bases: EnrichBases; cache: TtlCache; groq: Groq | null; allowAi: () => boolean }) {
  const { http, bases, cache, groq, allowAi } = opts;
  const WEEK = 7 * 24 * 3600_000;

  const safe = async <T>(p: Promise<T>): Promise<T | null> => {
    try {
      return await p;
    } catch {
      return null;
    }
  };

  async function wikiSearch(query: string): Promise<WikiSummary[]> {
    const r = await safe(http.json<{ query?: { search?: { title: string }[] } }>(`${bases.wikipedia}/w/api.php${qs({ action: 'query', list: 'search', srsearch: query, srlimit: 4, format: 'json' })}`));
    const titles = (r?.query?.search ?? []).map((x) => x.title);
    const pages = await Promise.all(titles.map((t) => safe(http.json<WikiSummary>(`${bases.wikipedia}/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, '_'))}`))));
    return pages.filter((p): p is WikiSummary => !!p);
  }

  /** Heuristic pick; ask the AI to choose only when it's ambiguous. */
  async function chooseWiki(cands: WikiSummary[], kind: 'artist' | 'album', name: string, artist?: string): Promise<WikiSummary | null> {
    const picked = pickWiki(cands, kind, name, artist);
    if (picked || !cands.length || !groq || !allowAi()) return picked;
    const options = cands.filter((c) => c.type !== 'disambiguation' && c.extract).slice(0, 4);
    if (!options.length) return null;
    try {
      const r = await groq.chatJson<{ index: number }>(
        'You match music metadata to Wikipedia articles. Answer with the index of the article that is about exactly this ' +
          (kind === 'artist' ? 'music artist' : 'album') +
          ', or -1 if none is. Never guess.',
        JSON.stringify({ looking_for: kind === 'artist' ? { artist: name } : { album: name, artist }, articles: options.map((o, i) => ({ index: i, title: o.title, description: o.description, start: o.extract!.slice(0, 240) })) }),
        'wiki_pick',
        { type: 'object', additionalProperties: false, required: ['index'], properties: { index: { type: 'integer' } } },
      );
      return options[r.index] ?? null;
    } catch {
      return null;
    }
  }

  async function album(artist: string, title: string): Promise<AlbumInfo> {
    return cache.wrap(`enrich:al:${norm(artist)}|${norm(title)}`, WEEK, async () => {
      const t = baseTitle(title);
      const out: AlbumInfo = { title, artist, genres: [], sources: [] };

      // Deezer: cover, date, label, genres.
      const s = await safe(http.json<{ data?: DzAlbum[] }>(`${bases.deezer}/search/album${qs({ q: `artist:"${artist}" album:"${t}"`, limit: 6 })}`));
      const hit = (s?.data ?? [])
        .map((a) => ({ a, s: similarity(baseTitle(a.title), t) + similarity(a.artist?.name ?? '', artist) }))
        .sort((x, y) => y.s - x.s)[0];
      if (hit && hit.s >= 1.4) {
        const full = await safe(http.json<DzAlbum>(`${bases.deezer}/album/${hit.a.id}`));
        const a = { ...hit.a, ...(full ?? {}) };
        out.cover = a.cover_xl ?? a.cover_big;
        out.releaseDate = a.release_date;
        out.year = a.release_date?.slice(0, 4);
        out.label = a.label || undefined;
        out.genres = (a.genres?.data ?? []).map((g) => g.name).slice(0, 4);
        out.trackCount = a.nb_tracks;
        out.sources.push('Deezer');
      }

      // MusicBrainz / Cover Art Archive when Deezer doesn't know it.
      if (!out.cover || !out.year) {
        const mb = await safe(
          http.json<{ 'release-groups'?: { id: string; title: string; score?: number; 'first-release-date'?: string; 'artist-credit'?: { name: string }[] }[] }>(
            `${bases.musicbrainz}/ws/2/release-group/${qs({ query: `releasegroup:"${t}" AND artist:"${artist}"`, fmt: 'json', limit: 3 })}`,
          ),
        );
        const rg = (mb?.['release-groups'] ?? []).find((g) => (g.score ?? 0) >= 90 && similarity(baseTitle(g.title), t) >= 0.8);
        if (rg) {
          out.year ??= rg['first-release-date']?.slice(0, 4) || undefined;
          out.cover ??= `${bases.coverart}/release-group/${rg.id}/front-500`;
          out.sources.push('MusicBrainz');
        }
      }

      // Wikipedia text.
      const wiki = await chooseWiki(await wikiSearch(`"${t}" ${artist} album`), 'album', t, artist);
      if (wiki?.extract) {
        out.summary = shorten(wiki.extract);
        out.summarySource = { name: 'Wikipedia', url: wiki.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(wiki.title ?? t)}` };
        out.sources.push('Wikipedia');
      }
      return out;
    });
  }

  async function artistInfo(name: string): Promise<ArtistInfo> {
    return cache.wrap(`enrich:ar:${norm(name)}`, WEEK, async () => {
      const out: ArtistInfo = { name, genres: [], sources: [] };
      const s = await safe(http.json<{ data?: DzArtist[] }>(`${bases.deezer}/search/artist${qs({ q: name, limit: 5 })}`));
      const hit = (s?.data ?? []).find((a) => norm(a.name) === norm(name)) ?? (s?.data ?? []).find((a) => similarity(a.name, name) >= 0.85);
      if (hit) {
        // Deezer's placeholder silhouette has an empty hash in its URL.
        const img = hit.picture_xl ?? hit.picture_big;
        out.image = img && !/\/artist\/\//.test(img) ? img : undefined;
        out.fans = hit.nb_fan;
        out.sources.push('Deezer');
      }
      const wiki = await chooseWiki(await wikiSearch(`${name} musician OR band OR singer`), 'artist', name);
      if (wiki?.extract) {
        out.summary = shorten(wiki.extract);
        out.summarySource = { name: 'Wikipedia', url: wiki.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(wiki.title ?? name)}` };
        out.sources.push('Wikipedia');
      }
      return out;
    });
  }

  return { album, artist: artistInfo };
}
