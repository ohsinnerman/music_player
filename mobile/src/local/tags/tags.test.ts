import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bytesToBase64, base64ToBytes, utf16, utf8 } from './bytes';
import { MAX_CLIP_BYTES, makeClip } from './clip';
import { parseId3v2 } from './id3';
import { looksLikeLrc, lrcToLines, memorySource, parseFilename, readTags } from './index';

const fx = (name: string) => memorySource(new Uint8Array(readFileSync(join(__dirname, '__fixtures__', name))));
const near = (v: number | undefined, target: number, tol = 0.15) => {
  expect(v).toBeDefined();
  expect(Math.abs(v! - target)).toBeLessThan(tol);
};

describe('readTags', () => {
  it('MP3 / ID3v2.3: text, cover, LRC lyrics, Xing duration', async () => {
    const t = await readTags(fx('v23.mp3'));
    expect(t.format).toBe('mp3');
    expect(t.title).toBe('Midnight City');
    expect(t.artist).toBe('M83');
    expect(t.album).toBe("Hurry Up, We're Dreaming");
    expect(t.year).toBe('2011');
    expect(t.trackNo).toBe(4);
    expect(t.genre).toBe('Electronic');
    expect(t.picture?.mime).toBe('image/jpeg');
    expect(t.picture!.data.length).toBeGreaterThan(1000);
    expect(looksLikeLrc(t.lyrics)).toBe(true);
    expect(lrcToLines(t.lyrics!)[1]).toEqual({ timeMs: 1200, text: 'Second line' });
    near(t.durationSec, 2, 0.1);
  });

  it('MP3 / ID3v2.4 UTF-8 (non-Latin text)', async () => {
    const t = await readTags(fx('v24.mp3'));
    expect(t.title).toBe('夜に駆ける');
    expect(t.artist).toBe('YOASOBI');
    expect(t.album).toBe('Ça va – été');
  });

  it('MP3 without Xing header falls back to CBR estimate; no tags at all', async () => {
    const t = await readTags(fx('01 - Daft_Punk - One More Time (Official Video).mp3'));
    expect(t.format).toBe('mp3');
    expect(t.title).toBeUndefined();
    near(t.durationSec, 2, 0.2);
    expect(t.bitrateKbps).toBe(32);
  });

  it('MP3 with only an ID3v1 trailer', async () => {
    const t = await readTags(fx('v1only.mp3'));
    expect(t.title).toBe('Old School');
    expect(t.artist).toBe('V1 Artist');
    expect(t.year).toBe('1999');
    expect(t.trackNo).toBe(7);
  });

  it('FLAC: vorbis comments, picture, STREAMINFO duration', async () => {
    const t = await readTags(fx('tagged.flac'));
    expect(t.format).toBe('flac');
    expect(t.title).toBe('Clair de Lune');
    expect(t.artist).toBe('Claude Debussy');
    expect(t.albumArtist).toBe('Various');
    expect(t.year).toBe('1905');
    expect(t.trackNo).toBe(3);
    expect(t.lyrics).toBe('instrumental');
    expect(t.picture?.mime).toBe('image/png');
    expect(t.sampleRate).toBe(8000);
    near(t.durationSec, 2, 0.01);
  });

  it('Ogg Vorbis and Opus', async () => {
    const v = await readTags(fx('vorbis.ogg'));
    expect(v.format).toBe('ogg');
    expect(v.codec).toBe('Vorbis');
    expect(v.title).toBe('Vorbis Song');
    expect(v.artist).toBe('Ogg Artist');
    near(v.durationSec, 2, 0.05);

    const o = await readTags(fx('song.opus'));
    expect(o.format).toBe('opus');
    expect(o.title).toBe('Opus Song');
    near(o.durationSec, 2, 0.05);
  });

  it('M4A (AAC): ilst atoms, cover, lyrics, mvhd duration', async () => {
    const t = await readTags(fx('aac.m4a'));
    expect(t.format).toBe('m4a');
    expect(t.codec).toBe('AAC');
    expect(t.title).toBe('Blinding Lights');
    expect(t.artist).toBe('The Weeknd');
    expect(t.album).toBe('After Hours');
    expect(t.year).toBe('2020');
    expect(t.trackNo).toBe(9);
    expect(t.picture?.mime).toBe('image/jpeg');
    expect(looksLikeLrc(t.lyrics)).toBe(true);
    near(t.durationSec, 2, 0.1);
  });

  it('M4A (ALAC)', async () => {
    const t = await readTags(fx('alac.m4a'));
    expect(t.codec).toBe('ALAC');
    expect(t.title).toBe('Lossless');
    near(t.durationSec, 2, 0.05);
  });

  it('WAV: LIST/INFO tags and exact duration', async () => {
    const t = await readTags(fx('tagged.wav'));
    expect(t.format).toBe('wav');
    expect(t.title).toBe('Wave Title');
    expect(t.artist).toBe('Wave Artist');
    expect(t.album).toBe('Wave Album');
    expect(t.sampleRate).toBe(8000);
    near(t.durationSec, 2, 0.01);
  });

  it('AIFF: COMM duration + ID3 chunk', async () => {
    const t = await readTags(fx('tagged.aiff'));
    expect(t.format).toBe('aiff');
    expect(t.title).toBe('Aiff Title');
    expect(t.artist).toBe('Aiff Artist');
    near(t.durationSec, 2, 0.01);
  });

  it('audio quality: bit depth, sample rate, lossless, encoder', async () => {
    const flac = await readTags(fx('hires.flac'));
    expect(flac).toMatchObject({ codec: 'FLAC', lossless: true, bitsPerSample: 24, sampleRate: 96000, channels: 1 });
    expect(flac.encoder).toMatch(/Lavf|libFLAC/);
    near(flac.durationSec, 0.5, 0.01);

    const alac = await readTags(fx('hires.m4a'));
    expect(alac).toMatchObject({ codec: 'ALAC', lossless: true, bitsPerSample: 24, sampleRate: 96000 });

    const wav = await readTags(fx('hires.wav'));
    expect(wav).toMatchObject({ codec: 'PCM', lossless: true, bitsPerSample: 24, sampleRate: 48000 });

    const cbr = await readTags(fx('cbr320.mp3'));
    expect(cbr).toMatchObject({ codec: 'MP3', lossless: false, bitrateKbps: 320, sampleRate: 44100, vbr: false });
    expect(cbr.bitsPerSample).toBeUndefined();
    expect(cbr.encoder).toMatch(/^(LAME|Lavc)/);

    const aac = await readTags(fx('aac.m4a'));
    expect(aac).toMatchObject({ codec: 'AAC', lossless: false });
    const lo = await readTags(fx('tagged.flac'));
    expect(lo).toMatchObject({ bitsPerSample: 16, lossless: true });
  });

  it('never throws on junk', async () => {
    const junk = new Uint8Array(4096).map((_, i) => (i * 7919) & 0xff);
    await expect(readTags(memorySource(junk))).resolves.toMatchObject({ format: 'unknown' });
    const truncated = new Uint8Array(readFileSync(join(__dirname, '__fixtures__', 'v23.mp3'))).subarray(0, 300);
    await expect(readTags(memorySource(truncated))).resolves.toBeDefined();
  });
});

describe('ID3 edge cases', () => {
  const frame = (id: string, body: number[]) => [...Array.from(id, (c) => c.charCodeAt(0)), 0, 0, (body.length >> 8) & 0xff, body.length & 0xff, 0, 0, ...body];
  const tag = (frames: number[], major = 3, flags = 0) => {
    const size = frames.length;
    return new Uint8Array([0x49, 0x44, 0x33, major, 0, flags, (size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f, ...frames]);
  };

  it('SYLT millisecond lyrics and UTF-16 text', () => {
    const utf16le = (s: string) => [0xff, 0xfe, ...Array.from(s).flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8])];
    const sylt = [0, ...'eng'.split('').map((c) => c.charCodeAt(0)), 2, 1, 0, ...[...'Hello'].map((c) => c.charCodeAt(0)), 0, 0, 0, 0x03, 0xe8, ...[...'World'].map((c) => c.charCodeAt(0)), 0, 0, 0, 0x07, 0xd0];
    const t = parseId3v2(tag([...frame('TIT2', [1, ...utf16le('Ünïcode'), 0, 0]), ...frame('SYLT', sylt)]));
    expect(t.title).toBe('Ünïcode');
    expect(t.syncedLyrics).toEqual([
      { timeMs: 1000, text: 'Hello' },
      { timeMs: 2000, text: 'World' },
    ]);
  });

  it('ID3v2.2 three-letter frames', () => {
    const f22 = (id: string, body: number[]) => [...Array.from(id, (c) => c.charCodeAt(0)), 0, 0, body.length, ...body];
    const t = parseId3v2(tag([...f22('TT2', [0, ...[...'Old Tag'].map((c) => c.charCodeAt(0))]), ...f22('TP1', [0, 65, 66])], 2));
    expect(t.title).toBe('Old Tag');
    expect(t.artist).toBe('AB');
  });

  it('USLT lyrics (language + empty descriptor)', () => {
    const text = [...'line one\nline two'].map((c) => c.charCodeAt(0));
    const t = parseId3v2(tag(frame('USLT', [0, 101, 110, 103, 0, ...text])));
    expect(t.lyrics).toBe('line one\nline two');
  });

  it('numeric genres', () => {
    const t = parseId3v2(tag(frame('TCON', [0, ...[...'(17)'].map((c) => c.charCodeAt(0))])));
    expect(t.genre).toBe('Rock');
  });
});

describe('helpers', () => {
  it('decodes text', () => {
    expect(utf8(new Uint8Array([0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x8e, 0xb5]))).toBe('€🎵');
    expect(utf16(new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x00, 0x42]))).toBe('AB');
  });
  it('base64 round-trips', () => {
    const b = new Uint8Array([0, 1, 2, 250, 251, 252, 253]);
    expect(Array.from(base64ToBytes(bytesToBase64(b)))).toEqual(Array.from(b));
    expect(bytesToBase64(new Uint8Array([104, 105]))).toBe('aGk=');
  });
  it('parses file names', () => {
    expect(parseFilename('01 - Daft_Punk - One More Time (Official Video).mp3')).toEqual({ artist: 'Daft Punk', title: 'One More Time', trackNo: 1 });
    expect(parseFilename('03. Clair de Lune.flac')).toEqual({ title: 'Clair de Lune', trackNo: 3 });
    expect(parseFilename('Arijit Singh – Tum Hi Ho [www.SongsPk.com].mp3')).toEqual({ artist: 'Arijit Singh', title: 'Tum Hi Ho', trackNo: undefined });
    expect(parseFilename('1999 - Prince.mp3').trackNo).toBeUndefined();
    expect(parseFilename('Crazy_In_Love_-_Beyoncé_ft._JAY_Z_01.flac')).toEqual({ artist: 'Beyoncé ft. JAY Z', title: 'Crazy In Love', trackNo: 1 });
    expect(parseFilename('AUD-20230708-WA0004.mp3').title).toBe('AUD-20230708-WA0004');
  });
});

describe('makeClip', () => {
  const run = (cmd: string, args: string[]) => spawnSync(cmd, args, { encoding: 'utf8' });
  const hasFfmpeg = run('ffmpeg', ['-version']).status === 0;
  const cases: [string, string][] = [
    ['v23.mp3', 'audio/mpeg'],
    ['tagged.flac', 'audio/flac'],
    ['tagged.wav', 'audio/wav'],
    ['vorbis.ogg', 'audio/ogg'],
    ['song.opus', 'audio/opus'],
    ['faststart.m4a', 'audio/mp4'],
  ];
  for (const [name, mime] of cases) {
    it.skipIf(!hasFfmpeg)(`cuts a decodable clip from ${name}`, async () => {
      const src = fx(name);
      const clip = await makeClip(src, await readTags(src));
      expect(clip?.mime).toBe(mime);
      expect(clip!.bytes.length).toBeLessThanOrEqual(MAX_CLIP_BYTES);
      const dir = mkdtempSync(join(tmpdir(), 'clip-'));
      const out = join(dir, `clip.${name.split('.').pop()}`);
      writeFileSync(out, clip!.bytes);
      const r = run('ffmpeg', ['-v', 'error', '-i', out, '-f', 'null', '-']);
      expect(r.status).toBe(0);
      const probe = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]);
      expect(Number(probe.stdout.trim()) || 0.1).toBeGreaterThan(0);
    });
  }
  it('refuses MP4 with moov after mdat (not decodable when cut)', async () => {
    const src = fx('aac.m4a');
    expect(await makeClip(src, await readTags(src))).toBeNull();
  });
});
