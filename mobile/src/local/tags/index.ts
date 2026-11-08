import { ascii } from './bytes';
import { readFlac, readMp4, readOgg, readRiff } from './containers';
import { id3v2Length, parseId3v1, parseId3v2 } from './id3';
import { findFirstFrame, mp3Info } from './mp3';
import { type ByteSource, type TagResult, merge } from './types';

export type { AudioFormat, ByteSource, Picture, SyncedLine, TagResult } from './types';
export { parseFilename } from './filename';
export { lrcToLines, looksLikeLrc } from './lrc';

/** Wrap an in-memory buffer as a ByteSource (tests, web). */
export function memorySource(b: Uint8Array): ByteSource {
  return { size: b.length, read: async (o, n) => b.subarray(Math.max(0, o), Math.min(b.length, o + n)) };
}

/**
 * Read tags, embedded artwork/lyrics and duration from an audio file.
 * Detects the container by magic bytes (never the extension), reads only the
 * bytes it needs, and never throws: a damaged tag just yields fewer fields.
 */
export async function readTags(src: ByteSource): Promise<TagResult> {
  const out: TagResult = { format: 'unknown' };
  if (src.size < 16) return out;
  try {
    let head = await src.read(0, Math.min(src.size, 64 * 1024));
    let start = 0;

    // A leading ID3v2 tag (MP3, but also seen in front of FLAC/AAC).
    const id3len = id3v2Length(head);
    if (id3len > 0) {
      const tag = id3len <= head.length ? head.subarray(0, id3len) : await src.read(0, Math.min(id3len, 24 * 1024 * 1024));
      merge(out, parseId3v2(tag));
      start = id3len;
      head = await src.read(start, Math.min(src.size - start, 64 * 1024));
    }

    const magic4 = ascii(head, 0, 4);
    if (magic4 === 'fLaC') {
      // Native FLAC tags win over a stray ID3 tag; ID3 only fills the gaps.
      return finish(Object.assign(out, await readFlac(src, start)));
    }
    if (start === 0) {
      if (magic4 === 'OggS') return finish(Object.assign(out, await readOgg(src)));
      if (ascii(head, 4, 4) === 'ftyp') return finish(Object.assign(out, await readMp4(src)));
      if (magic4 === 'RIFF' && ascii(head, 8, 4) === 'WAVE') return finish(Object.assign(out, await readRiff(src, false)));
      if (magic4 === 'FORM' && (ascii(head, 8, 4) === 'AIFF' || ascii(head, 8, 4) === 'AIFC')) return finish(Object.assign(out, await readRiff(src, true)));
    }

    // MPEG audio (or raw ADTS AAC).
    const tail = src.size > 128 ? await src.read(src.size - 128, 128) : new Uint8Array(0);
    const hasV1 = ascii(tail, 0, 3) === 'TAG';
    if (head[0] === 0xff && (head[1]! & 0xf6) === 0xf0) {
      out.format = 'aac';
      out.codec = 'AAC (ADTS)';
    } else if (findFirstFrame(head)) {
      out.format = 'mp3';
      const info = mp3Info(head, src.size - start - (hasV1 ? 128 : 0));
      if (info) merge(out, info);
    }
    if (hasV1) merge(out, parseId3v1(tail));
    out.audioStart = start;
  } catch {
    /* partial result is fine */
  }
  return finish(out);
}

function finish(t: TagResult): TagResult {
  if (t.durationSec !== undefined && (!Number.isFinite(t.durationSec) || t.durationSec <= 0 || t.durationSec > 24 * 3600)) t.durationSec = undefined;
  if (t.bitrateKbps !== undefined && (!Number.isFinite(t.bitrateKbps) || t.bitrateKbps <= 0)) t.bitrateKbps = undefined;
  return t;
}
