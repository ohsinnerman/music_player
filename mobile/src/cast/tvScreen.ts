import { fetchLyrics } from '@/api/queries';
import type { Lyrics, Track } from '@/api/types';
import { assess, specOf } from '@/lib/quality';
import { getPalette } from '@/lib/palette';

/**
 * What Aura's TV screen (the Custom Web Receiver served at /cast/receiver)
 * shows besides title / artist / cover: a background from the cover's
 * colours, the quality badge, synced lyrics and what's up next.
 * The default receiver ignores all of it.
 */
export interface TvData {
  aura: 1;
  palette: string[];
  quality?: string;
  /** [ms, line] pairs — compact, the whole song is usually a few KB. */
  lyrics: [number, string][] | null;
  next: { title: string; artist?: string } | null;
}

/** Google Cast devices (every model so far) decode up to 96 kHz. */
export const GCAST_MAX_RATE = 96000;

export function qualityLabel(t: Track): string | undefined {
  const a = assess(specOf(t));
  if (a.tier === 'hires') return `HI-RES ${a.short}`;
  if (a.tier === 'lossless') return `LOSSLESS ${a.short}`;
  return t.local || t.streamKind === 'full' ? a.short.toUpperCase() : undefined;
}

export const syncedLines = (l: Lyrics | null | undefined): [number, string][] | null =>
  l?.synced?.length ? l.synced.slice(0, 600).map((x) => [Math.round(x.timeMs), x.text.slice(0, 200)] as [number, string]) : null;

const within = <T,>(p: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([p.catch(() => undefined), new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

/**
 * Data for the load request. Anything slow (lyrics from the network, the AI
 * identification of an imported song) is not waited for: `later` resolves when
 * it arrives, and the caller sends it as a message.
 */
export async function tvData(t: Track, next?: Track): Promise<{ data: TvData; later: Promise<[number, string][] | null> }> {
  const art = t.artwork.large ?? t.artwork.medium ?? t.artwork.small;
  const lyricsP = fetchLyrics(t).then(syncedLines, () => null);
  const [pal, quick] = await Promise.all([art ? within(getPalette(art), 600) : Promise.resolve(undefined), within(lyricsP, 400)]);
  return {
    data: {
      aura: 1,
      palette: pal ? [pal.dark, pal.dominant, pal.vibrant] : [],
      quality: qualityLabel(t),
      lyrics: quick ?? null,
      next: next ? { title: next.title, artist: next.artists.map((a) => a.name).join(', ') || undefined } : null,
    },
    later: quick !== undefined ? Promise.resolve(quick) : lyricsP,
  };
}
