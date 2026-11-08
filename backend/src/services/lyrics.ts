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

  async function lookup(q: { title: string; artist: string; album?: string; durationSec?: number }, trackId?: string): Promise<Lyrics> {
    const title = cleanTitle(q.title);
    const key = `lyrics:${q.artist.toLowerCase()}|${title.toLowerCase()}|${q.durationSec ?? ''}`;
    return cache.wrap(key, 24 * 60 * 60_000, async () => {
      // 1) Exact signature match (fast, cached on LRCLIB's side).
      try {
        const rec = await http.json<LrcLibRecord>(
          `${root}/get${qs({ track_name: title, artist_name: q.artist, album_name: q.album, duration: q.durationSec })}`,
        );
        if (rec && (rec.syncedLyrics || rec.plainLyrics || rec.instrumental)) return toLyrics(rec, trackId);
      } catch (e) {
        if (!(e instanceof AppError && e.status === 404)) throw e;
      }
      // 2) Fuzzy search, prefer synced lyrics with a close duration.
      const results = await http.json<LrcLibRecord[]>(`${root}/search${qs({ track_name: title, artist_name: q.artist })}`);
      const scored = (results ?? [])
        .filter((r) => r.syncedLyrics || r.plainLyrics)
        .map((r) => {
          const dd = q.durationSec && r.duration ? Math.abs(r.duration - q.durationSec) : 0;
          return { r, score: (r.syncedLyrics ? 0 : 50) + Math.min(dd, 60) };
        })
        .sort((a, b) => a.score - b.score);
      const best = scored[0];
      if (!best || (q.durationSec && best.r.duration && Math.abs(best.r.duration - q.durationSec) > 15)) {
        throw notFound('No lyrics found for this song');
      }
      return toLyrics(best.r, trackId);
    });
  }

  return {
    lookup,
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
