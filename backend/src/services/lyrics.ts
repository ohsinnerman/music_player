import type { LyricLine, Lyrics, Track } from '../domain/types.js';
import type { TtlCache } from '../lib/cache.js';
import { AppError, notFound } from '../lib/errors.js';
import { type HttpClient, qs } from '../lib/http.js';

/**
 * Parse LRC text ("[01:23.45]line") into sorted lines. Handles multiple
 * timestamps per line, [offset:±ms] tags, and ignores metadata tags.
 */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  let offset = 0;
  const stamp = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const rawLine of lrc.split(/\r?\n/)) {
    const off = /^\[offset:\s*([+-]?\d+)\s*\]/i.exec(rawLine);
    if (off) {
      offset = Number(off[1]);
      continue;
    }
    const times: number[] = [];
    let m: RegExpExecArray | null;
    let lastIndex = 0;
    stamp.lastIndex = 0;
    while ((m = stamp.exec(rawLine)) && m.index === lastIndex) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const frac = m[3] ? Number(m[3].padEnd(3, '0')) : 0;
      times.push(min * 60_000 + sec * 1000 + frac);
      lastIndex = stamp.lastIndex;
    }
    if (!times.length) continue;
    const text = rawLine.slice(lastIndex).trim();
    for (const t of times) lines.push({ timeMs: Math.max(0, t - offset), text });
  }
  lines.sort((a, b) => a.timeMs - b.timeMs);
  return lines;
}

interface LrcLibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

/** Strip "(feat. X)", "- Remastered 2011" etc. which hurt lyric matching. */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([](feat\.?|ft\.?|with|prod\.?)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(remaster(ed)?|live|radio edit|single version|mono|stereo)\b.*$/i, '')
    .trim();
}

export type { LrcLibRecord };

function pickBest(results: LrcLibRecord[], durationSec: number | undefined, maxDelta: number): LrcLibRecord | null {
  const scored = results
    .filter((r) => r.syncedLyrics || r.plainLyrics || r.instrumental)
    .map((r) => {
      const dd = durationSec && r.duration ? Math.abs(r.duration - durationSec) : 0;
      return { r, dd, score: (r.syncedLyrics ? 0 : 50) + Math.min(dd, 60) };
    })
    .sort((a, b) => a.score - b.score);
  const best = scored[0];
  if (!best) return null;
  if (durationSec && best.r.duration && best.dd > maxDelta) {
    // The synced one may be off; accept the closest-duration one if it fits.
    const close = scored.filter((s) => s.dd <= maxDelta).sort((a, b) => a.dd - b.dd)[0];
    return close ? close.r : null;
  }
  return best.r;
}

export function createLyricsService(http: HttpClient, base: string, cache: TtlCache) {
  const root = base.replace(/\/$/, '');

  const toLyrics = (r: LrcLibRecord, trackId?: string): Lyrics => {
    const synced = r.syncedLyrics ? parseLrc(r.syncedLyrics) : null;
    return {
      trackId,
      synced: synced && synced.length ? synced : null,
      plain: r.plainLyrics ?? null,
      instrumental: !!r.instrumental,
      source: 'lrclib',
    };
  };

  type Query = { title: string; artist: string; album?: string; durationSec?: number };
  type Found = { lyrics: Lyrics; record: LrcLibRecord };

  /** Best LRCLIB record for a title + artist, or null. Never throws "not found". */
  async function find(q: Query, trackId?: string): Promise<Found | null> {
    const title = cleanTitle(q.title);
    if (!title || !q.artist.trim()) return null;
    const key = `lrc:${q.artist.toLowerCase()}|${title.toLowerCase()}|${q.album?.toLowerCase() ?? ''}|${q.durationSec ?? ''}`;
    const rec = await cache.wrap(key, 24 * 60 * 60_000, async (): Promise<LrcLibRecord | null> => {
      // 1) Exact signature match (fast, cached on LRCLIB's side).
      try {
        const r = await http.json<LrcLibRecord>(
          `${root}/get${qs({ track_name: title, artist_name: q.artist, album_name: q.album, duration: q.durationSec })}`,
        );
        if (r && (r.syncedLyrics || r.plainLyrics || r.instrumental)) return r;
      } catch (e) {
        if (!(e instanceof AppError && e.status === 404)) throw e;
      }
      // 2) Fuzzy search, prefer synced lyrics with a close duration.
      const results = await http.json<LrcLibRecord[]>(`${root}/search${qs({ track_name: title, artist_name: q.artist })}`);
      return pickBest(results ?? [], q.durationSec, 15);
    });
    return rec ? { lyrics: toLyrics(rec, trackId), record: rec } : null;
  }

  /** Free-text LRCLIB search ("artist title" or a cleaned file name). */
  async function search(text: string, durationSec?: number): Promise<Found | null> {
    const q = text.trim().slice(0, 200);
    if (q.length < 3) return null;
    const key = `lrcq:${q.toLowerCase()}|${durationSec ?? ''}`;
    const rec = await cache.wrap(key, 24 * 60 * 60_000, async () => {
      const results = await http.json<LrcLibRecord[]>(`${root}/search${qs({ q })}`).catch((e: unknown) => {
        if (e instanceof AppError && e.status === 404) return [] as LrcLibRecord[];
        throw e;
      });
      // Without an artist to anchor on, insist on a tight duration match.
      return durationSec ? pickBest(results ?? [], durationSec, 3) : null;
    });
    return rec ? { lyrics: toLyrics(rec), record: rec } : null;
  }

  async function lookup(q: Query, trackId?: string): Promise<Lyrics> {
    const found = await find(q, trackId);
    if (!found) throw notFound('No lyrics found for this song');
    return found.lyrics;
  }

  return {
    lookup,
    find,
    search,
    forTrack: (t: Track) =>
      lookup(
        {
          title: t.title,
          artist: t.artists[0]?.name ?? '',
          album: t.album?.title,
          durationSec: t.durationMs ? Math.round(t.durationMs / 1000) : undefined,
        },
        t.id,
      ),
  };
}

export type LyricsService = ReturnType<typeof createLyricsService>;
