import { Directory, File, Paths } from 'expo-file-system';
import type { Track } from '@/api/types';

/**
 * Playback safety net for songs on the phone.
 *
 * Normally the player streams the file straight from its content:// URI. Some
 * file pickers / storage providers hand out URIs the media player can't open
 * even though the app can read them. When that happens we copy the file into
 * the app's cache once and play the copy (file://), which always works. The
 * cache is capped and the OS may clear it; the original is never touched.
 */

const MAX_CACHE_BYTES = 1.5 * 1024 * 1024 * 1024;

function dir(): Directory {
  const d = new Directory(Paths.cache, 'playback');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

const safe = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_');

function ext(t: Track): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(t.local?.fileName ?? '');
  if (m) return m[1]!.toLowerCase();
  const f = t.local?.format;
  return f && f !== 'unknown' ? (f === 'm4a' ? 'm4a' : f) : 'audio';
}

function copyFile(t: Track): File {
  return new File(dir(), `${safe(t.id)}.${ext(t)}`);
}

/** URI to give the player: the cached copy if we made one, else the original. */
export function playableUri(t: Track): string {
  if (!t.local) return '';
  if (preferCopies) {
    try {
      const c = copyFile(t);
      if (c.exists) return c.uri;
    } catch {
      /* fall through */
    }
  }
  return t.local.uri;
}

/** Set once we learn this phone's player can't open picked files directly. */
let preferCopies = false;
export const setPreferCopies = (v: boolean) => {
  preferCopies = v;
};
export const prefersCopies = () => preferCopies;

const inflight = new Map<string, Promise<string | null>>();

/** Copy the song into the playback cache (once). Resolves to its file:// URI, or null. */
export function ensurePlayableCopy(t: Track): Promise<string | null> {
  if (!t.local) return Promise.resolve(null);
  let p = inflight.get(t.id);
  if (!p) {
    p = (async () => {
      try {
        const dest = copyFile(t);
        if (dest.exists && (dest.size ?? 0) > 0) return dest.uri;
        const src = new File(t.local!.uri);
        evict(src.size ?? 0);
        await src.copy(dest);
        return dest.exists ? dest.uri : null;
      } catch {
        return null;
      } finally {
        inflight.delete(t.id);
      }
    })();
    inflight.set(t.id, p);
  }
  return p;
}

/** Keep the cache under its cap, oldest copies first. */
function evict(incoming: number) {
  try {
    const files = dir()
      .list()
      .filter((f): f is File => f instanceof File)
      .map((f) => ({ f, size: f.size ?? 0, at: f.modificationTime ?? 0 }))
      .sort((a, b) => a.at - b.at);
    let total = files.reduce((n, x) => n + x.size, 0) + incoming;
    for (const x of files) {
      if (total <= MAX_CACHE_BYTES) break;
      try {
        x.f.delete();
        total -= x.size;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/** "6-channel 24-bit 192 kHz FLAC" — for error messages. */
export function describeFormat(t: Track): string {
  const l = t.local;
  if (!l) return 'this stream';
  const parts: string[] = [];
  if (l.channels && l.channels > 2) parts.push(`${l.channels}-channel`);
  if (l.bitsPerSample && l.lossless) parts.push(`${l.bitsPerSample}-bit`);
  if (l.sampleRate) parts.push(`${l.sampleRate % 1000 ? (l.sampleRate / 1000).toFixed(1) : l.sampleRate / 1000} kHz`);
  parts.push(l.codec ?? l.format.toUpperCase());
  return parts.join(' ');
}
