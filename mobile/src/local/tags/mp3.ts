import { ascii, u32be } from './bytes';

const BITRATES: Record<string, number[]> = {
  // [version][layer] → kbps by index. V1 = MPEG-1, V2 = MPEG-2/2.5.
  V1L1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  V1L2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  V1L3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  V2L1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  V2L2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  V2L3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

export interface MpegFrame {
  version: number; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
  layer: number; // 1, 2, 3
  bitrate: number; // kbps
  sampleRate: number;
  channels: number;
  samplesPerFrame: number;
  length: number;
}

export function frameAt(b: Uint8Array, o: number): MpegFrame | null {
  if (o + 4 > b.length || b[o] !== 0xff || (b[o + 1]! & 0xe0) !== 0xe0) return null;
  const version = (b[o + 1]! >> 3) & 3;
  const layerBits = (b[o + 1]! >> 1) & 3;
  const brIdx = b[o + 2]! >> 4;
  const srIdx = (b[o + 2]! >> 2) & 3;
  if (version === 1 || layerBits === 0 || brIdx === 0 || brIdx === 15 || srIdx === 3) return null;
  const layer = 4 - layerBits;
  const bitrate = BITRATES[`${version === 3 ? 'V1' : 'V2'}L${layer}`]![brIdx]!;
  const sampleRate = RATES[version]![srIdx]!;
  const padding = (b[o + 2]! >> 1) & 1;
  const channels = b[o + 3]! >> 6 === 3 ? 1 : 2;
  const samplesPerFrame = layer === 1 ? 384 : layer === 2 ? 1152 : version === 3 ? 1152 : 576;
  const length = layer === 1 ? Math.floor((12 * bitrate * 1000) / sampleRate + padding) * 4 : Math.floor(((samplesPerFrame / 8) * bitrate * 1000) / sampleRate) + padding;
  return { version, layer, bitrate, sampleRate, channels, samplesPerFrame, length };
}

/** First frame that's followed by another valid frame (avoids false syncs in junk). */
export function findFirstFrame(b: Uint8Array, from = 0): { offset: number; frame: MpegFrame } | null {
  for (let i = from; i < b.length - 4; i++) {
    if (b[i] !== 0xff) continue;
    const f = frameAt(b, i);
    if (!f || f.length < 24) continue;
    const next = i + f.length;
    if (next + 4 > b.length || frameAt(b, next)) return { offset: i, frame: f };
  }
  return null;
}

/**
 * Duration from the Xing/Info (LAME) or VBRI header if present, otherwise a
 * constant-bitrate estimate from the audio byte length. `head` starts at the
 * first byte after any ID3v2 tag; `audioBytes` counts from there to the end
 * (minus an ID3v1 trailer).
 */
export function mp3Info(head: Uint8Array, audioBytes: number) {
  const first = findFirstFrame(head, 0);
  if (!first) return null;
  const { offset, frame } = first;
  const sideInfo = frame.version === 3 ? (frame.channels === 1 ? 17 : 32) : frame.channels === 1 ? 9 : 17;
  const x = offset + 4 + sideInfo;
  let frames: number | undefined;
  let encoder: string | undefined;
  let vbr = false;
  const tag = ascii(head, x, 4);
  if (tag === 'Xing' || tag === 'Info') {
    const flags = u32be(head, x + 4);
    if (flags & 1) frames = u32be(head, x + 8);
    // LAME/Lavc extension follows the Xing fields.
    const lame = x + 8 + (flags & 1 ? 4 : 0) + (flags & 2 ? 4 : 0) + (flags & 4 ? 100 : 0) + (flags & 8 ? 4 : 0);
    const enc = ascii(head, lame, 9).replace(/[^\x20-\x7e]/g, '').trim();
    if (/^(LAME|Lavc|Lavf|GOGO|L3\.99)/.test(enc)) encoder = enc;
    const method = (head[lame + 9] ?? 0) & 0x0f;
    vbr = tag === 'Xing' && !(method === 1 || method === 8);
  } else if (ascii(head, offset + 36, 4) === 'VBRI') {
    frames = u32be(head, offset + 36 + 14);
    vbr = true;
    encoder = 'Fraunhofer (VBRI)';
  }
  const durationSec = frames ? (frames * frame.samplesPerFrame) / frame.sampleRate : ((audioBytes - offset) * 8) / (frame.bitrate * 1000);
  // CBR: the frame header is exact. VBR: average over the whole stream.
  const bitrateKbps = vbr && frames && durationSec > 0 ? Math.round(((audioBytes - offset) * 8) / durationSec / 1000) : frame.bitrate;
  const codec = frame.layer === 3 ? 'MP3' : `MPEG-${frame.version === 3 ? 1 : 2} Layer ${frame.layer}`;
  return { durationSec, sampleRate: frame.sampleRate, channels: frame.channels, bitrateKbps, codec, encoder, vbr };
}
