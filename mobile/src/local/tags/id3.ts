import { ascii, clean, latin1, syncsafe, u24be, u32be, utf16, utf8 } from './bytes';
import { type Picture, type SyncedLine, type TagResult, firstNumber, genreName, yearOf } from './types';

/** Total byte length of the ID3v2 tag whose 10-byte header is given (incl. footer). */
export function id3v2Length(head: Uint8Array): number {
  if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return 0;
  const flags = head[5]!;
  return 10 + syncsafe(head, 6) + (flags & 0x10 ? 10 : 0);
}

function decodeText(b: Uint8Array, enc: number): string {
  switch (enc) {
    case 0:
      return latin1(b);
    case 1:
      return utf16(b);
    case 2:
      return utf16(b, false);
    case 3:
      return utf8(b);
    default:
      return latin1(b);
  }
}

/** Split off a NUL-terminated string (1 or 2 byte terminator depending on encoding). */
function terminated(b: Uint8Array, enc: number, from = 0): [string, number] {
  const wide = enc === 1 || enc === 2;
  let i = from;
  if (wide) {
    while (i + 1 < b.length && !(b[i] === 0 && b[i + 1] === 0)) i += 2;
    return [decodeText(b.subarray(from, i), enc), Math.min(b.length, i + 2)];
  }
  while (i < b.length && b[i] !== 0) i++;
  return [decodeText(b.subarray(from, i), enc), Math.min(b.length, i + 1)];
}

function removeUnsync(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length);
  let o = 0;
  for (let i = 0; i < b.length; i++) {
    out[o++] = b[i]!;
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return out.subarray(0, o);
}

const textFrame = (d: Uint8Array) => {
  if (!d.length) return undefined;
  // v2.4 allows several NUL-separated values; show them joined.
  const values = decodeText(d.subarray(1), d[0]!)
    .split('\u0000')
    .map((s) => s.trim())
    .filter(Boolean);
  return values.length ? values.join(', ') : undefined;
};

const TEXT_IDS: Record<string, keyof TagResult | 'tlen' | 'tyer'> = {
  TIT2: 'title',
  TT2: 'title',
  TPE1: 'artist',
  TP1: 'artist',
  TALB: 'album',
  TAL: 'album',
  TPE2: 'albumArtist',
  TP2: 'albumArtist',
  TCON: 'genre',
  TCO: 'genre',
  TRCK: 'trackNo',
  TRK: 'trackNo',
  TPOS: 'discNo',
  TPA: 'discNo',
  TDRC: 'tyer',
  TYER: 'tyer',
  TYE: 'tyer',
  TDOR: 'tyer',
  TORY: 'tyer',
  TLEN: 'tlen',
  TLE: 'tlen',
};

/**
 * Parse a complete ID3v2.2/2.3/2.4 tag (the bytes starting at "ID3").
 * Unknown, compressed or encrypted frames are skipped, never fatal.
 */
export function parseId3v2(buf: Uint8Array): Partial<TagResult> {
  const out: Partial<TagResult> = {};
  if (buf.length < 10 || ascii(buf, 0, 3) !== 'ID3') return out;
  const major = buf[3]!;
  if (major < 2 || major > 4) return out;
  const flags = buf[5]!;
  const tagSize = syncsafe(buf, 6);
  let body = buf.subarray(10, Math.min(buf.length, 10 + tagSize));
  // v2.2/2.3: unsynchronisation applies to the whole tag.
  if (flags & 0x80 && major < 4) body = removeUnsync(body);

  let pos = 0;
  if (flags & 0x40 && major >= 3) {
    // Extended header: v2.3 size excludes itself, v2.4 size (syncsafe) includes itself.
    pos = major === 3 ? 4 + u32be(body, 0) : syncsafe(body, 0);
  }

  const idLen = major === 2 ? 3 : 4;
  const headLen = major === 2 ? 6 : 10;
  let pictures: { type: number; pic: Picture }[] = [];
  const synced: SyncedLine[] = [];
  let tlen: number | undefined;

  while (pos + headLen <= body.length) {
    const id = ascii(body, pos, idLen);
    if (!/^[A-Z0-9]+$/.test(id)) break; // padding or garbage
    let size: number;
    if (major === 2) size = u24be(body, pos + 3);
    else if (major === 3) size = u32be(body, pos + 4);
    else {
      // Some v2.4 writers (old iTunes) wrote plain integers; fall back if not syncsafe.
      const raw = body.subarray(pos + 4, pos + 8);
      size = raw.some((x) => x & 0x80) ? u32be(body, pos + 4) : syncsafe(body, pos + 4);
    }
    const fmt = major >= 3 ? body[pos + 9]! : 0;
    const start = pos + headLen;
    pos = start + size;
    if (size <= 0 || start + size > body.length) {
      if (size <= 0) continue;
      break;
    }
    let data = body.subarray(start, start + size);

    if (major === 3) {
      if (fmt & 0xc0) continue; // compressed / encrypted
      if (fmt & 0x20) data = data.subarray(1); // grouping id
    } else if (major === 4) {
      if (fmt & 0x0c) continue; // compressed / encrypted
      if (fmt & 0x40) data = data.subarray(1); // grouping id
      if (fmt & 0x01) data = data.subarray(4); // data length indicator
      if (fmt & 0x02) data = removeUnsync(data);
    }
    if (!data.length) continue;

    const key = TEXT_IDS[id];
    if (key) {
      const v = textFrame(data);
      if (!v) continue;
      if (key === 'tlen') tlen = firstNumber(v);
      else if (key === 'tyer') out.year ??= yearOf(v);
      else if (key === 'trackNo' || key === 'discNo') out[key] ??= firstNumber(v);
      else if (key === 'genre') out.genre ??= genreName(v);
      else (out as Record<string, unknown>)[key] ??= v;
      continue;
    }

    const enc = data[0]!;
    if (id === 'APIC' || id === 'PIC') {
      let mime: string;
      let p: number;
      if (id === 'PIC') {
        const f = ascii(data, 1, 3).toUpperCase();
        mime = f === 'PNG' ? 'image/png' : 'image/jpeg';
        p = 4;
      } else {
        let e = 1;
        while (e < data.length && data[e] !== 0) e++;
        mime = latin1(data.subarray(1, e)).toLowerCase() || 'image/jpeg';
        p = e + 1;
        if (!mime.includes('/')) mime = `image/${mime === 'jpg' ? 'jpeg' : mime}`;
      }
      const type = data[p]!;
      const [, after] = terminated(data, enc, p + 1);
      const img = data.subarray(after);
      if (img.length > 32 && mime !== '-->') pictures.push({ type, pic: { mime: sniffImage(img) ?? mime, data: img } });
    } else if (id === 'USLT' || id === 'ULT') {
      const [, after] = terminated(data, enc, 4); // enc + lang(3) + descriptor
      const text = clean(decodeText(data.subarray(after), enc));
      if (text && (!out.lyrics || text.length > out.lyrics.length)) out.lyrics = text;
    } else if (id === 'SYLT' || id === 'SLT') {
      const stampFormat = data[4];
      if (stampFormat !== 2) continue; // only millisecond stamps
      let [, p] = terminated(data, enc, 6);
      const lines: SyncedLine[] = [];
      while (p < data.length) {
        const [text, next] = terminated(data, enc, p);
        if (next + 4 > data.length) break;
        lines.push({ text: text.replace(/^\n/, ''), timeMs: u32be(data, next) });
        p = next + 4;
      }
      if (lines.length > synced.length) synced.splice(0, synced.length, ...lines);
    } else if (id === 'TXXX' || id === 'TXX') {
      const [desc, after] = terminated(data, enc, 1);
      const value = clean(decodeText(data.subarray(after), enc));
      const d = desc.trim().toUpperCase();
      if (value && (d === 'LYRICS' || d === 'UNSYNCEDLYRICS' || d === 'SYNCEDLYRICS' || d === 'USLT')) out.lyrics ??= value;
      else if (value && d === 'ALBUMARTIST') out.albumArtist ??= value;
    }
  }

  if (pictures.length) {
    pictures = pictures.sort((a, b) => (a.type === 3 ? -1 : b.type === 3 ? 1 : 0));
    out.picture = pictures[0]!.pic;
  }
  if (synced.length) out.syncedLyrics = synced.sort((a, b) => a.timeMs - b.timeMs);
  if (tlen && tlen > 1000) out.durationSec = tlen / 1000;
  for (const k of ['title', 'artist', 'album', 'albumArtist'] as const) out[k] = clean(out[k]);
  return out;
}

/** ID3v1 / v1.1 trailer (last 128 bytes of the file). */
export function parseId3v1(tail: Uint8Array): Partial<TagResult> {
  if (tail.length < 128) return {};
  const b = tail.subarray(tail.length - 128);
  if (ascii(b, 0, 3) !== 'TAG') return {};
  const str = (o: number, n: number) => clean(latin1(b.subarray(o, o + n)));
  const out: Partial<TagResult> = {
    title: str(3, 30),
    artist: str(33, 30),
    album: str(63, 30),
    year: yearOf(str(93, 4)),
  };
  if (b[125] === 0 && b[126]) out.trackNo = b[126];
  if (b[127]! < 255) out.genre = genreName(String(b[127]));
  return out;
}

/** Recognise JPEG/PNG/WebP/GIF by magic bytes (taggers often lie about the MIME). */
export function sniffImage(b: Uint8Array): string | undefined {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'image/webp';
  if (ascii(b, 0, 3) === 'GIF') return 'image/gif';
  return undefined;
}

