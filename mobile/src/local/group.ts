import type { Track } from '@/api/types';
import { assess, specOf } from '../lib/quality';

/** Albums and artists from the songs on the phone (pure, unit-tested). */

export interface LocalAlbum {
  id: string;
  title: string;
  /** Album artist: the main artist, or "Various Artists" for compilations. */
  artist: { id: string; name: string };
  tracks: Track[];
  artwork: Track['artwork'];
  year?: string;
  genre?: string;
  durationMs: number;
  /** "Hi-Res 24/96", "Lossless 16/44.1", "MP3 320"… for the best file on the album. */
  quality?: string;
}

export interface LocalArtist {
  id: string;
  name: string;
  tracks: Track[];
  albums: LocalAlbum[];
  artwork: Track['artwork'];
}

const cmp = (a = '', b = '') => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
export const hasArt = (t: Track) => !!(t.artwork.large ?? t.artwork.medium ?? t.artwork.small);

export function groupAlbums(tracks: Track[]): LocalAlbum[] {
  const by = new Map<string, Track[]>();
  for (const t of tracks) {
    if (!t.album) continue;
    const list = by.get(t.album.id);
    if (list) list.push(t);
    else by.set(t.album.id, [t]);
  }
  const out: LocalAlbum[] = [];
  for (const [id, list] of by) {
    list.sort((a, b) => (a.local?.tags.trackNo ?? 999) - (b.local?.tags.trackNo ?? 999) || cmp(a.title, b.title));
    const counts = new Map<string, { n: number; ref: { id: string; name: string } }>();
    for (const t of list) {
      const a = t.artists[0];
      if (!a) continue;
      const c = counts.get(a.id);
      if (c) c.n++;
      else counts.set(a.id, { n: 1, ref: a });
    }
    const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
    const artist = top && (counts.size === 1 || top.n > list.length / 2) ? top.ref : { id: 'local-artist:various', name: 'Various Artists' };
    const best = list.map((t) => assess(specOf(t))).sort((a, b) => b.bars - a.bars)[0];
    out.push({
      id,
      title: list[0]!.album!.title,
      artist,
      tracks: list,
      artwork: list.find(hasArt)?.artwork ?? {},
      year: list.find((t) => t.releaseDate)?.releaseDate?.slice(0, 4),
      genre: list.find((t) => t.genre)?.genre,
      durationMs: list.reduce((s, t) => s + (t.durationMs || 0), 0),
      quality: best ? `${best.label}${best.short ? ` ${best.short}` : ''}` : undefined,
    });
  }
  return out.sort((a, b) => cmp(a.title, b.title));
}

export function groupArtists(tracks: Track[], albums: LocalAlbum[]): LocalArtist[] {
  const by = new Map<string, LocalArtist>();
  for (const t of tracks) {
    for (const a of t.artists.slice(0, 1)) {
      let e = by.get(a.id);
      if (!e) {
        e = { id: a.id, name: a.name, tracks: [], albums: [], artwork: {} };
        by.set(a.id, e);
      }
      e.tracks.push(t);
    }
  }
  for (const al of albums) {
    const ids = new Set(al.tracks.map((t) => t.artists[0]?.id).filter(Boolean));
    for (const id of ids) by.get(id!)?.albums.push(al);
  }
  for (const e of by.values()) e.artwork = e.albums.find((a) => a.artwork.large ?? a.artwork.medium)?.artwork ?? e.tracks.find(hasArt)?.artwork ?? {};
  return [...by.values()].filter((a) => a.id !== 'local-artist:unknown').sort((a, b) => cmp(a.name, b.name));
}
