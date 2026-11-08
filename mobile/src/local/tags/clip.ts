import { ascii, bytesOf, concat, indexOf, u32be, u32le, u64le } from './bytes';
import { findFirstFrame } from './mp3';
import type { ByteSource, TagResult } from './types';

/**
 * Cut a short, self-contained, decodable excerpt (~25 s) out of an audio file
 * so the server can "listen" to it (Whisper) without uploading the whole song.
 * Taken from ~30% in, where vocals usually are. Returns null for containers we
 * can't cut safely (the caller then simply skips listening).
 */
export interface Clip {
  bytes: Uint8Array;
  mime: string;
}

export const MAX_CLIP_BYTES = 3_500_000;
const SECONDS = 25;

export async function makeClip(src: ByteSource, tags: TagResult): Promise<Clip | null> {
  try {
    switch (tags.format) {
      case 'mp3':
        return await mp3Clip(src, tags);
      case 'flac':
        return await flacClip(src, tags);
      case 'wav':
        return await wavClip(src);
      case 'ogg':
      case 'opus':
        return await oggClip(src, tags);
      case 'm4a':
        return await mp4Clip(src);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

const bytesFor = (tags: TagResult, fallbackKbps: number) => Math.min(MAX_CLIP_BYTES, Math.round(((tags.bitrateKbps || fallbackKbps) * 1000 * SECONDS) / 8));

function startAt(src: ByteSource, from: number, want: number) {
  const usable = src.size - from;
  return usable <= want ? from : from + Math.floor((usable - want) * 0.3);
}

async function mp3Clip(src: ByteSource, tags: TagResult): Promise<Clip | null> {
  const audioStart = tags.audioStart ?? 0;
  const want = bytesFor(tags, 192);
  const at = startAt(src, audioStart, want);
  const window = await src.read(at, Math.min(src.size - at, want + 8192));
  const first = findFirstFrame(window);
  if (!first) return null;
  return { bytes: window.subarray(first.offset, first.offset + want), mime: 'audio/mpeg' };
}

async function flacClip(src: ByteSource, tags: TagResult): Promise<Clip | null> {
  const start = tags.audioStart ?? 0;
  const head = await src.read(start, 42);
  if (ascii(head, 0, 4) !== 'fLaC' || (head[4]! & 0x7f) !== 0) return null;
  // fLaC + STREAMINFO only, marked as the last metadata block.
  const header = new Uint8Array(head.subarray(0, 42));
  header[4] = 0x80;
  // Metadata length: skip all blocks to find where frames start.
  let pos = start + 4;
  for (let n = 0; n < 128; n++) {
    const h = await src.read(pos, 4);
    pos += 4 + ((h[1]! << 16) | (h[2]! << 8) | h[3]!);
    if (h[0]! & 0x80) break;
  }
  const want = bytesFor(tags, 900);
  const at = startAt(src, pos, want);
  const window = await src.read(at, Math.min(src.size - at, want + 65536));
  // First real frame: sync code + a header whose CRC-8 checks out (sync patterns also occur in audio data).
  let i = 0;
  while (i < window.length - 16 && !isFlacFrame(window, i)) i++;
  if (i >= window.length - 16) return null;
  // End on a frame boundary too, so the last frame isn't cut in half.
  let end = Math.min(window.length, i + want);
  for (let j = end - 2; j > i + 16; j--) {
    if (isFlacFrame(window, j)) {
      end = j;
      break;
    }
  }
  return { bytes: concat([header, window.subarray(i, end)]), mime: 'audio/flac' };
}

const CRC8 = (() => {
  const t = new Uint8Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
    t[n] = c;
  }
  return t;
})();

/** Validate a FLAC frame header at `o` (RFC 9639 §9.1), including its CRC-8. */
export function isFlacFrame(b: Uint8Array, o: number): boolean {
  if (b[o] !== 0xff || (b[o + 1]! & 0xfe) !== 0xf8) return false;
  const bs = b[o + 2]! >> 4;
  const sr = b[o + 2]! & 0x0f;
  const ch = b[o + 3]! >> 4;
  const ss = (b[o + 3]! >> 1) & 0x07;
  if (bs === 0 || sr === 0x0f || ch > 10 || ss === 3 || (b[o + 3]! & 1) !== 0) return false;
  // Coded frame/sample number: UTF-8-style, 1–7 bytes.
  let p = o + 4;
  const lead = b[p]!;
  let extra = 0;
  if (lead >= 0x80) {
    if ((lead & 0xe0) === 0xc0) extra = 1;
    else if ((lead & 0xf0) === 0xe0) extra = 2;
    else if ((lead & 0xf8) === 0xf0) extra = 3;
    else if ((lead & 0xfc) === 0xf8) extra = 4;
    else if ((lead & 0xfe) === 0xfc) extra = 5;
    else if (lead === 0xfe) extra = 6;
    else return false;
  }
  for (let k = 1; k <= extra; k++) if ((b[p + k]! & 0xc0) !== 0x80) return false;
  p += 1 + extra;
  if (bs === 6) p += 1;
  else if (bs === 7) p += 2;
  if (sr === 12) p += 1;
  else if (sr === 13 || sr === 14) p += 2;
  if (p >= b.length) return false;
  let crc = 0;
  for (let k = o; k < p; k++) crc = CRC8[crc ^ b[k]!]!;
  return crc === b[p];
}

async function wavClip(src: ByteSource): Promise<Clip | null> {
  let p = 12;
  let fmt: Uint8Array | null = null;
  for (let n = 0; n < 64 && p + 8 <= src.size; n++) {
    const h = await src.read(p, 8);
    const id = ascii(h, 0, 4);
    const size = u32le(h, 4);
    if (id === 'fmt ') fmt = await src.read(p + 8, Math.min(size, 64));
    if (id === 'data') {
      if (!fmt) return null;
      const blockAlign = fmt[12]! | (fmt[13]! << 8);
      const byteRate = u32le(fmt, 8);
      if (!blockAlign || !byteRate) return null;
      const dataStart = p + 8;
      const dataSize = size === 0 || size === 0xffffffff || dataStart + size > src.size ? src.size - dataStart : size;
      // PCM is big: 15 s is plenty and keeps the upload small.
      let want = Math.min(MAX_CLIP_BYTES, byteRate * 15, dataSize);
      want -= want % blockAlign;
      let at = dataStart + Math.floor((dataSize - want) * 0.3);
      at -= (at - dataStart) % blockAlign;
      const pcm = await src.read(at, want);
      const header = new Uint8Array(44);
      const dv = new DataView(header.buffer);
      header.set(bytesOf('RIFF'), 0);
      dv.setUint32(4, 36 + pcm.length, true);
      header.set(bytesOf('WAVEfmt '), 8);
      dv.setUint32(16, 16, true);
      header.set(fmt.subarray(0, 16), 20);
      // WAVE_FORMAT_EXTENSIBLE → plain PCM/float header is enough for decoders.
      if ((fmt[0]! | (fmt[1]! << 8)) === 0xfffe) dv.setUint16(20, (fmt[24] ?? 1) | ((fmt[25] ?? 0) << 8), true);
      header.set(bytesOf('data'), 36);
      dv.setUint32(40, pcm.length, true);
      return { bytes: concat([header, pcm]), mime: 'audio/wav' };
    }
    p += 8 + size + (size & 1);
  }
  return null;
}

async function oggClip(src: ByteSource, tags: TagResult): Promise<Clip | null> {
  // Header pages are those before the first page with a positive granule position.
  const head = await src.read(0, Math.min(src.size, 1024 * 1024));
  let p = 0;
  while (p + 27 <= head.length && ascii(head, p, 4) === 'OggS') {
    const granule = u64le(head, p + 6);
    const nseg = head[p + 26]!;
    let len = 27 + nseg;
    for (let k = 0; k < nseg; k++) len += head[p + 27 + k]!;
    const noPacketEnds = u32le(head, p + 6) === 0xffffffff && u32le(head, p + 10) === 0xffffffff;
    if (granule > 0 && !noPacketEnds) break;
    p += len;
  }
  if (p === 0 || p > 900 * 1024) return null; // huge embedded cover in the headers: don't bother
  const headers = head.subarray(0, p);
  const want = Math.min(MAX_CLIP_BYTES - headers.length, bytesFor(tags, 160));
  const at = startAt(src, p, want);
  const window = await src.read(at, Math.min(src.size - at, want + 65536));
  const sync = indexOf(window, bytesOf('OggS'));
  if (sync < 0) return null;
  return { bytes: concat([headers, window.subarray(sync, sync + want)]), mime: tags.format === 'opus' ? 'audio/opus' : 'audio/ogg' };
}

async function mp4Clip(src: ByteSource): Promise<Clip | null> {
  // Only "fast start" files (moov before mdat) stay decodable when truncated.
  let p = 0;
  for (let n = 0; n < 32 && p + 8 <= src.size; n++) {
    const h = await src.read(p, 16);
    let size = u32be(h, 0);
    const type = ascii(h, 4, 4);
    if (size === 1) size = u32be(h, 8) * 2 ** 32 + u32be(h, 12);
    else if (size === 0) size = src.size - p;
    if (type === 'mdat') return null;
    if (type === 'moov') break;
    if (size < 8) return null;
    p += size;
  }
  return { bytes: await src.read(0, Math.min(src.size, MAX_CLIP_BYTES)), mime: 'audio/mp4' };
}
