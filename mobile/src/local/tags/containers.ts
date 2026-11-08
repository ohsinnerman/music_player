import { ascii, clean, concat, latin1, lastIndexOf, bytesOf, u16be, u16le, u24be, u32be, u32le, u64be, u64le, utf8 } from './bytes';
import { parseId3v2, sniffImage } from './id3';
import { type ByteSource, type TagResult, ID3V1_GENRES, genreName, yearOf } from './types';
import { parseFlacPicture, parseVorbisComments } from './vorbis';

const MAX_META = 24 * 1024 * 1024; // never pull more than this into memory for tags

/* ───────────────────────── FLAC ───────────────────────── */

export async function readFlac(src: ByteSource, start: number): Promise<Partial<TagResult>> {
  const out: Partial<TagResult> = { format: 'flac', codec: 'FLAC' };
  let pos = start + 4;
  let budget = MAX_META;
  for (let n = 0; n < 128 && pos + 4 <= src.size; n++) {
    const h = await src.read(pos, 4);
    const last = (h[0]! & 0x80) !== 0;
    const type = h[0]! & 0x7f;
    const len = u24be(h, 1);
    if (type === 0 || type === 4 || (type === 6 && !out.picture)) {
      if (len > budget) break;
      budget -= len;
      const d = await src.read(pos + 4, len);
      if (type === 0 && d.length >= 18) {
        const sampleRate = (d[10]! << 12) | (d[11]! << 4) | (d[12]! >> 4);
        const channels = ((d[12]! >> 1) & 7) + 1;
        const total = (d[13]! & 0x0f) * 2 ** 32 + u32be(d, 14);
        out.sampleRate = sampleRate;
        out.channels = channels;
        if (sampleRate > 0 && total > 0) out.durationSec = total / sampleRate;
      } else if (type === 4) Object.assign(out, stripUndefined(parseVorbisComments(d)));
      else if (type === 6) {
        const pic = parseFlacPicture(d);
        if (pic) out.picture = pic.pic;
      }
    }
    pos += 4 + len;
    if (last) break;
  }
  if (out.durationSec && out.durationSec > 0) out.bitrateKbps = Math.round(((src.size - pos) * 8) / out.durationSec / 1000);
  return out;
}

/* ───────────────────────── Ogg (Vorbis / Opus / FLAC-in-Ogg) ───────────────────────── */

export async function readOgg(src: ByteSource): Promise<Partial<TagResult>> {
  const out: Partial<TagResult> = { format: 'ogg' };
  // Header packets live in the first pages; cover art can make the comment packet big.
  let size = Math.min(src.size, 512 * 1024);
  let packets: Uint8Array[] = [];
  let serial = -1;
  for (;;) {
    const buf = await src.read(0, size);
    ({ packets, serial } = oggPackets(buf, 2));
    if (packets.length >= 2 || size >= Math.min(src.size, 8 * 1024 * 1024)) break;
    size = Math.min(src.size, size * 4);
  }
  const id = packets[0];
  if (!id) return out;
  let rate = 0;
  let preSkip = 0;
  let commentStart = -1;
  if (ascii(id, 1, 6) === 'vorbis') {
    out.codec = 'Vorbis';
    out.channels = id[11];
    rate = u32le(id, 12);
    commentStart = 7;
  } else if (ascii(id, 0, 8) === 'OpusHead') {
    out.format = 'opus';
    out.codec = 'Opus';
    out.channels = id[9];
    preSkip = u16le(id, 10);
    rate = 48000;
    commentStart = 8;
  }
  out.sampleRate = rate || undefined;
  const c = packets[1];
  if (c && commentStart > 0) Object.assign(out, stripUndefined(parseVorbisComments(c.subarray(commentStart))));

  // Duration = granule position of the last page / sample rate.
  if (rate > 0) {
    const tailLen = Math.min(src.size, 64 * 1024);
    const tail = await src.read(src.size - tailLen, tailLen);
    let i = lastIndexOf(tail, bytesOf('OggS'));
    while (i >= 0) {
      if (i + 27 <= tail.length && (serial < 0 || u32le(tail, i + 14) === serial)) {
        const granule = u64le(tail, i + 6);
        if (granule > 0 && granule < 2 ** 52) {
          out.durationSec = Math.max(0, granule - preSkip) / rate;
          break;
        }
      }
      i = lastIndexOf(tail.subarray(0, i), bytesOf('OggS'));
    }
    if (out.durationSec) out.bitrateKbps = Math.round((src.size * 8) / out.durationSec / 1000);
  }
  return out;
}

/** Reassemble the first `want` packets of the first logical stream. */
function oggPackets(b: Uint8Array, want: number): { packets: Uint8Array[]; serial: number } {
  const packets: Uint8Array[] = [];
  let current: Uint8Array[] = [];
  let p = 0;
  let serial = -1;
  while (p + 27 <= b.length && packets.length < want) {
    if (ascii(b, p, 4) !== 'OggS') break;
    const s = u32le(b, p + 14);
    const nseg = b[p + 26]!;
    if (p + 27 + nseg > b.length) break;
    const lacing = b.subarray(p + 27, p + 27 + nseg);
    let body = p + 27 + nseg;
    const pageLen = lacing.reduce((n, x) => n + x, 0);
    if (body + pageLen > b.length) break;
    if (serial < 0) serial = s;
    if (s === serial) {
      let segStart = body;
      let segLen = 0;
      for (const l of lacing) {
        segLen += l;
        if (l < 255) {
          current.push(b.subarray(segStart, segStart + segLen));
          packets.push(concat(current));
          current = [];
          segStart += segLen;
          segLen = 0;
          if (packets.length >= want) break;
        }
      }
      if (segLen > 0) current.push(b.subarray(segStart, segStart + segLen));
    }
    body += pageLen;
    p = body;
  }
  return { packets, serial };
}

/* ───────────────────────── MP4 / M4A (AAC, ALAC) ───────────────────────── */

interface Atom {
  type: string;
  start: number; // payload start
  end: number;
}

function atoms(b: Uint8Array, from: number, to: number): Atom[] {
  const list: Atom[] = [];
  let p = from;
  while (p + 8 <= to) {
    let size = u32be(b, p);
    const type = latin1(b.subarray(p + 4, p + 8));
    let header = 8;
    if (size === 1) {
      if (p + 16 > to) break;
      size = u64be(b, p + 8);
      header = 16;
    } else if (size === 0) size = to - p;
    if (size < header || p + size > to) break;
    list.push({ type, start: p + header, end: p + size });
    p += size;
  }
  return list;
}

const child = (b: Uint8Array, a: Atom | undefined, type: string, skip = 0) => (a ? atoms(b, a.start + skip, a.end).find((x) => x.type === type) : undefined);

export async function readMp4(src: ByteSource): Promise<Partial<TagResult>> {
  const out: Partial<TagResult> = { format: 'm4a' };
  // Walk top-level atoms by reading only their headers, then load moov (it may sit after mdat).
  let p = 0;
  let moov: Uint8Array | null = null;
  for (let n = 0; n < 64 && p + 8 <= src.size; n++) {
    const h = await src.read(p, 16);
    let size = u32be(h, 0);
    const type = latin1(h.subarray(4, 8));
    if (size === 1) size = u64be(h, 8);
    else if (size === 0) size = src.size - p;
    if (size < 8) break;
    if (type === 'moov') {
      if (size > MAX_META) break;
      moov = await src.read(p, size);
      break;
    }
    p += size;
  }
  if (!moov) return out;
  const root = atoms(moov, 0, moov.length)[0];
  if (!root) return out;

  const mvhd = child(moov, root, 'mvhd');
  if (mvhd) {
    const v = moov[mvhd.start]!;
    const timescale = v === 1 ? u32be(moov, mvhd.start + 20) : u32be(moov, mvhd.start + 12);
    const duration = v === 1 ? u64be(moov, mvhd.start + 24) : u32be(moov, mvhd.start + 16);
    if (timescale > 0 && duration > 0) out.durationSec = duration / timescale;
  }

  // Codec + sample rate from the first audio sample description.
  const trak = child(moov, root, 'trak');
  const stbl = child(moov, child(moov, child(moov, trak, 'mdia'), 'minf'), 'stbl');
  const stsd = child(moov, stbl, 'stsd');
  if (stsd) {
    const entry = atoms(moov, stsd.start + 8, stsd.end)[0];
    if (entry) {
      out.codec = entry.type === 'alac' ? 'ALAC' : entry.type === 'mp4a' ? 'AAC' : entry.type;
      out.channels = u16be(moov, entry.start + 16) || undefined;
      out.sampleRate = u16be(moov, entry.start + 24) || undefined;
    }
  }

  const udta = child(moov, root, 'udta');
  let meta = child(moov, udta, 'meta');
  if (!meta) return finishMp4(out, src.size);
  // 'meta' is a full box (4 bytes version/flags) in MP4, but not in old QuickTime files.
  const skip = latin1(moov.subarray(meta.start + 4, meta.start + 8)) === 'hdlr' ? 0 : 4;
  meta = { ...meta, start: meta.start + skip };
  const ilst = child(moov, meta, 'ilst');
  if (!ilst) return finishMp4(out, src.size);

  for (const item of atoms(moov, ilst.start, ilst.end)) {
    let key = item.type;
    if (key === '----') {
      // Freeform "----" items: mean / name / data
      const name = child(moov, item, 'name');
      if (name) key = `----:${utf8(moov.subarray(name.start + 4, name.end)).toUpperCase()}`;
    }
    const data = atoms(moov, item.start, item.end).find((x) => x.type === 'data');
    if (!data) continue;
    const kind = u32be(moov, data.start) & 0xffffff;
    const payload = moov.subarray(data.start + 8, data.end);
    const text = () => clean(utf8(payload));
    switch (key) {
      case '©nam':
        out.title ??= text();
        break;
      case '©ART':
        out.artist ??= text();
        break;
      case '©alb':
        out.album ??= text();
        break;
      case 'aART':
        out.albumArtist ??= text();
        break;
      case '©day':
        out.year ??= yearOf(text());
        break;
      case '©gen':
        out.genre ??= text();
        break;
      case 'gnre':
        if (payload.length >= 2) out.genre ??= ID3V1_GENRES[u16be(payload, 0) - 1];
        break;
      case 'trkn':
        if (payload.length >= 4) out.trackNo ??= u16be(payload, 2) || undefined;
        break;
      case 'disk':
        if (payload.length >= 4) out.discNo ??= u16be(payload, 2) || undefined;
        break;
      case '©lyr':
      case '----:LYRICS':
        out.lyrics ??= text();
        break;
      case 'covr':
        if (!out.picture && payload.length > 32) {
          const mime = sniffImage(payload) ?? (kind === 14 ? 'image/png' : 'image/jpeg');
          out.picture = { mime, data: payload };
        }
        break;
    }
  }
  out.genre = genreName(out.genre);
  return finishMp4(out, src.size);
}

function finishMp4(out: Partial<TagResult>, size: number) {
  if (out.durationSec) out.bitrateKbps = Math.round((size * 8) / out.durationSec / 1000);
  return out;
}

/* ───────────────────────── WAV (RIFF) and AIFF ───────────────────────── */

export async function readRiff(src: ByteSource, big: boolean): Promise<Partial<TagResult>> {
  const out: Partial<TagResult> = { format: big ? 'aiff' : 'wav', codec: 'PCM' };
  const u32 = big ? u32be : u32le;
  let p = 12;
  let byteRate = 0;
  let dataSize = 0;
  for (let n = 0; n < 256 && p + 8 <= src.size; n++) {
    const h = await src.read(p, 8);
    const id = latin1(h.subarray(0, 4));
    let size = u32(h, 4);
    const body = p + 8;
    if (id === 'data' || id === 'SSND') {
      // Streaming writers leave 0 or 0xFFFFFFFF here.
      if (size === 0 || size === 0xffffffff || body + size > src.size) size = src.size - body;
      dataSize = size;
    } else if (id === 'fmt ' && size >= 16) {
      const d = await src.read(body, 16);
      out.channels = u16le(d, 2);
      out.sampleRate = u32le(d, 4);
      byteRate = u32le(d, 8);
      const fmt = u16le(d, 0);
      out.codec = fmt === 1 || fmt === 0xfffe ? 'PCM' : fmt === 3 ? 'PCM float' : `WAV (0x${fmt.toString(16)})`;
    } else if (id === 'COMM' && size >= 18) {
      const d = await src.read(body, 18);
      out.channels = u16be(d, 0);
      const frames = u32be(d, 2);
      const rate = ext80(d.subarray(8, 18));
      if (rate > 0) {
        out.sampleRate = Math.round(rate);
        out.durationSec = frames / rate;
      }
    } else if (id === 'LIST' && size <= 1024 * 1024) {
      const d = await src.read(body, size);
      if (ascii(d, 0, 4) === 'INFO') Object.assign(out, stripUndefined(riffInfo(d.subarray(4))));
    } else if ((id === 'id3 ' || id === 'ID3 ') && size <= MAX_META) {
      const d = await src.read(body, size);
      const tags = parseId3v2(d);
      for (const [k, v] of Object.entries(tags)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
    } else if (big && (id === 'NAME' || id === 'AUTH') && size < 4096) {
      const v = clean(latin1(await src.read(body, size)));
      if (id === 'NAME') out.title ??= v;
      else out.artist ??= v;
    }
    p = body + size + (size & 1);
  }
  if (!big && byteRate > 0 && dataSize > 0) out.durationSec = dataSize / byteRate;
  if (out.durationSec) out.bitrateKbps = Math.round((dataSize * 8) / out.durationSec / 1000) || undefined;
  return out;
}

function riffInfo(b: Uint8Array): Partial<TagResult> {
  const out: Partial<TagResult> = {};
  let p = 0;
  while (p + 8 <= b.length) {
    const id = ascii(b, p, 4);
    const size = u32le(b, p + 4);
    const v = clean(utf8(b.subarray(p + 8, p + 8 + size)));
    if (v) {
      if (id === 'INAM') out.title = v;
      else if (id === 'IART') out.artist = v;
      else if (id === 'IPRD') out.album = v;
      else if (id === 'ICRD') out.year = yearOf(v);
      else if (id === 'IGNR') out.genre = v;
      else if (id === 'ITRK' || id === 'IPRT') out.trackNo = parseInt(v, 10) || undefined;
    }
    p += 8 + size + (size & 1);
  }
  return out;
}

/** 80-bit IEEE 754 extended (AIFF sample rate). */
function ext80(b: Uint8Array): number {
  const exp = ((b[0]! & 0x7f) << 8) | b[1]!;
  const hi = u32be(b, 2);
  const lo = u32be(b, 6);
  if (exp === 0 && hi === 0 && lo === 0) return 0;
  const sign = b[0]! & 0x80 ? -1 : 1;
  return sign * (hi * 2 ** (exp - 16383 - 31) + lo * 2 ** (exp - 16383 - 63));
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const r: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (r as Record<string, unknown>)[k] = v;
  return r;
}

