import { ascii, base64ToBytes, clean, latin1, u32be, u32le, utf8 } from './bytes';
import { sniffImage } from './id3';
import { type Picture, type TagResult, firstNumber, genreName, yearOf } from './types';

/** FLAC METADATA_BLOCK_PICTURE (also used base64-encoded inside Ogg comments). */
export function parseFlacPicture(b: Uint8Array): { type: number; pic: Picture } | null {
  try {
    let p = 0;
    const type = u32be(b, p);
    p += 4;
    const mimeLen = u32be(b, p);
    p += 4;
    const mime = latin1(b.subarray(p, p + mimeLen));
    p += mimeLen;
    const descLen = u32be(b, p);
    p += 4 + descLen + 16; // description + width/height/depth/colours
    const len = u32be(b, p);
    p += 4;
    const data = b.subarray(p, p + len);
    if (data.length < 32 || mime === '-->') return null;
    return { type, pic: { mime: sniffImage(data) ?? (mime || 'image/jpeg'), data } };
  } catch {
    return null;
  }
}

/**
 * Vorbis comment block (FLAC VORBIS_COMMENT, Ogg Vorbis/Opus comment header).
 * `b` starts at the vendor-length field.
 */
export function parseVorbisComments(b: Uint8Array): Partial<TagResult> {
  const out: Partial<TagResult> = {};
  const multi: Record<string, string[]> = {};
  let p = 0;
  if (b.length < 8) return out;
  const vendorLen = u32le(b, p);
  p += 4 + vendorLen;
  if (p + 4 > b.length) return out;
  const count = u32le(b, p);
  p += 4;
  const pictures: { type: number; pic: Picture }[] = [];
  for (let i = 0; i < count && p + 4 <= b.length; i++) {
    const len = u32le(b, p);
    p += 4;
    if (p + len > b.length) break;
    const entry = b.subarray(p, p + len);
    p += len;
    const eq = entry.indexOf(0x3d);
    if (eq <= 0) continue;
    const key = ascii(entry, 0, eq).toUpperCase();
    if (key === 'METADATA_BLOCK_PICTURE') {
      const pic = parseFlacPicture(base64ToBytes(ascii(entry, eq + 1, entry.length - eq - 1)));
      if (pic) pictures.push(pic);
      continue;
    }
    const value = clean(utf8(entry.subarray(eq + 1)));
    if (value) (multi[key] ??= []).push(value);
  }
  const one = (...keys: string[]) => {
    for (const k of keys) if (multi[k]?.length) return multi[k]!.join(', ');
    return undefined;
  };
  out.title = one('TITLE');
  out.artist = one('ARTIST', 'PERFORMER');
  out.album = one('ALBUM');
  out.albumArtist = one('ALBUMARTIST', 'ALBUM ARTIST', 'ALBUM_ARTIST');
  out.year = yearOf(one('DATE', 'YEAR', 'ORIGINALDATE'));
  out.genre = genreName(multi.GENRE?.[0]);
  out.trackNo = firstNumber(one('TRACKNUMBER', 'TRACK'));
  out.discNo = firstNumber(one('DISCNUMBER', 'DISC'));
  out.lyrics = multi.SYNCEDLYRICS?.[0] ?? multi.LYRICS?.[0] ?? multi.UNSYNCEDLYRICS?.[0];
  if (pictures.length) out.picture = pictures.sort((a, b) => (a.type === 3 ? -1 : b.type === 3 ? 1 : 0))[0]!.pic;
  return out;
}
