import { Directory, File, FileMode, Paths } from 'expo-file-system';
import type { Lyrics } from '@/api/types';
import type { ByteSource, Picture } from './tags';

/**
 * On-disk helpers for imported songs. The audio files themselves are never
 * copied: we read them in place (persistent SAF permission on Android).
 */

function dir(name: string): Directory {
  const d = new Directory(Paths.document, 'device-music', name);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

const safe = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_');

/** Random-access reader over a file, so tag parsing only touches the bytes it needs. */
export function openSource(file: File): ByteSource & { close: () => void } {
  const h = file.open(FileMode.ReadOnly);
  const size = h.size ?? file.size ?? 0;
  return {
    size,
    async read(offset: number, length: number) {
      if (offset >= size || length <= 0) return new Uint8Array(0);
      h.offset = Math.max(0, offset);
      return h.readBytes(Math.min(length, size - offset));
    },
    close: () => {
      try {
        h.close();
      } catch {
        /* already closed */
      }
    },
  };
}

export function saveArtwork(id: string, pic: Picture): string | undefined {
  try {
    const ext = pic.mime.includes('png') ? 'png' : pic.mime.includes('webp') ? 'webp' : 'jpg';
    const f = new File(dir('art'), `${safe(id)}.${ext}`);
    f.write(pic.data);
    return f.uri;
  } catch {
    return undefined;
  }
}

export function readLyricsFile(id: string): Lyrics | null {
  try {
    const f = new File(dir('lyrics'), `${safe(id)}.json`);
    if (!f.exists) return null;
    return JSON.parse(f.textSync()) as Lyrics;
  } catch {
    return null;
  }
}

export function writeLyricsFile(id: string, lyrics: Lyrics) {
  try {
    new File(dir('lyrics'), `${safe(id)}.json`).write(JSON.stringify(lyrics));
  } catch {
    /* best effort */
  }
}

export function deleteLocalFiles(id: string) {
  for (const [d, exts] of [
    ['art', ['jpg', 'png', 'webp']],
    ['lyrics', ['json']],
  ] as const) {
    for (const ext of exts) {
      try {
        const f = new File(dir(d), `${safe(id)}.${ext}`);
        if (f.exists) f.delete();
      } catch {
        /* ignore */
      }
    }
  }
}

/** Temporary file for an upload (cache dir; the OS may clean it). */
export function tempFile(name: string, bytes: Uint8Array): File {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.write(bytes);
  return f;
}
