/**
 * Audio quality: what a song *is* (source spec + tier) and how this phone
 * actually *renders* it (decode → mix → output), Poweramp-style.
 *
 * Pure functions (no React / native imports) so they're unit-tested.
 */

/** Mirrors modules/aura-audio-route (kept structural so this file stays pure). */
export interface OutputDeviceLike {
  type: string;
  name: string | null;
  sampleRates: number[];
  encodings: string[];
}
export interface OutputInfoLike {
  available: boolean;
  mixerSampleRate?: number | null;
  device?: OutputDeviceLike | null;
  bitPerfectCapable?: boolean;
}

export interface SourceSpec {
  kind: 'file' | 'stream' | 'preview';
  codec: string;
  format?: string;
  lossless: boolean;
  bitsPerSample?: number;
  sampleRate?: number;
  channels?: number;
  bitrateKbps?: number;
  vbr?: boolean;
  encoder?: string;
  /** Numbers are typical for the provider, not measured from this exact stream. */
  approximate?: boolean;
  note?: string;
}

/** Minimal track shape this module needs. */
export interface TrackLike {
  provider: string;
  streamKind: 'full' | 'preview';
  local?: {
    format: string;
    codec?: string;
    bitrateKbps?: number;
    sampleRate?: number;
    bitsPerSample?: number;
    channels?: number;
    lossless?: boolean;
    encoder?: string;
    vbr?: boolean;
  };
}

export type Tier = 'hires' | 'lossless' | 'high' | 'standard' | 'low';

export interface Assessment {
  tier: Tier;
  label: string;
  /** "24-bit / 96 kHz", "MP3 · 320 kbps" */
  spec: string;
  /** Compact badge text: "24/96", "16/44.1", "320". */
  short: string;
  /** 1–5 bars for the meter. */
  bars: number;
  blurb: string;
}

export type StepState = 'good' | 'info' | 'warn' | 'loss';

export interface PathStep {
  key: 'source' | 'decode' | 'mix' | 'output';
  title: string;
  value: string;
  detail: string;
  state: StepState;
}

export interface SignalPath {
  steps: PathStep[];
  /** What reaches the output, e.g. "16-bit / 48 kHz → Bluetooth". */
  effective: string;
  verdict: string;
  state: StepState;
  tips: string[];
}

const LOSSLESS_CODECS = new Set(['FLAC', 'ALAC', 'PCM', 'PCM float']);

export const khz = (hz: number | undefined | null): string => {
  if (!hz) return '?';
  const k = hz / 1000;
  return Number.isInteger(k) ? String(k) : k.toFixed(1).replace(/\.0$/, '');
};

/** What we know about a song's audio, for imported files and catalog streams alike. */
export function specOf(t: TrackLike): SourceSpec {
  const l = t.local;
  if (l) {
    const codec = l.codec ?? l.format.toUpperCase();
    return {
      kind: 'file',
      codec,
      format: l.format,
      lossless: l.lossless ?? LOSSLESS_CODECS.has(codec),
      bitsPerSample: l.bitsPerSample,
      sampleRate: l.sampleRate,
      channels: l.channels,
      bitrateKbps: l.bitrateKbps,
      vbr: l.vbr,
      encoder: l.encoder,
    };
  }
  if (t.streamKind === 'preview') {
    return { kind: 'preview', codec: 'MP3', lossless: false, bitrateKbps: 128, sampleRate: 44100, channels: 2, note: '30-second preview' };
  }
  switch (t.provider) {
    case 'audius':
      return { kind: 'stream', codec: 'MP3', lossless: false, bitrateKbps: 320, sampleRate: 44100, channels: 2, approximate: true, note: 'Audius stream' };
    case 'jamendo':
      return { kind: 'stream', codec: 'MP3', lossless: false, bitrateKbps: 96, sampleRate: 44100, channels: 2, approximate: true, note: 'Jamendo stream' };
    default:
      return { kind: 'stream', codec: 'MP3', lossless: false, approximate: true, note: 'Stream' };
  }
}

/** Bitrate (kbps) at which each lossy codec reaches "high" / "standard". */
const LOSSY_THRESHOLDS: Record<string, [number, number]> = {
  MP3: [256, 160],
  AAC: [192, 128],
  Vorbis: [192, 128],
  Opus: [128, 96],
};

export function assess(s: SourceSpec): Assessment {
  if (s.lossless) {
    const bits = s.bitsPerSample ?? 16;
    const rate = s.sampleRate ?? 44100;
    const spec = `${bits}-bit / ${khz(rate)} kHz`;
    const short = `${bits}/${khz(rate)}`;
    if (bits > 16 || rate > 48000) {
      return { tier: 'hires', label: 'Hi-Res Lossless', spec, short, bars: 5, blurb: 'More detail than a CD: every bit of the studio master is in the file.' };
    }
    const cd = bits === 16 && rate === 44100;
    return { tier: 'lossless', label: 'Lossless', spec, short, bars: 4, blurb: cd ? 'CD quality, bit for bit — nothing thrown away.' : 'Nothing thrown away: an exact copy of the original audio.' };
  }

  const kbps = s.bitrateKbps;
  const spec = `${s.codec}${kbps ? ` · ${s.approximate ? '~' : ''}${kbps} kbps` : ''}${s.vbr ? ' VBR' : ''}`;
  const short = kbps ? `${s.codec === 'MP3' ? 'MP3' : s.codec} ${kbps}` : s.codec;
  const [hi, std] = LOSSY_THRESHOLDS[s.codec] ?? [256, 160];
  if (!kbps) return { tier: 'standard', label: 'Lossy', spec, short, bars: 2, blurb: 'Compressed audio: small files, some detail removed when it was encoded.' };
  if (kbps >= hi) return { tier: 'high', label: 'High quality', spec, short, bars: 3, blurb: 'Compressed, but hard to tell apart from the original on most gear.' };
  if (kbps >= std) return { tier: 'standard', label: 'Standard', spec, short, bars: 2, blurb: 'Compressed: fine everyday quality, some detail lost in cymbals and reverb.' };
  return { tier: 'low', label: 'Low bitrate', spec, short, bars: 1, blurb: 'Heavily compressed: you may hear swishy highs and smeared detail.' };
}

/** The player's decoder outputs 16-bit PCM (Media3 default without float output). */
export const DECODE_BITS = 16;
/** Android's mixer runs at 48 kHz on almost every phone. */
const DEFAULT_MIXER = 48000;

const OUTPUT_NAMES: Record<string, string> = {
  speaker: 'Phone speaker',
  earpiece: 'Earpiece',
  wired: 'Wired headphones',
  bluetooth: 'Bluetooth',
  'bluetooth-le': 'Bluetooth LE Audio',
  'bluetooth-call': 'Bluetooth (call mode)',
  usb: 'USB audio',
  hdmi: 'HDMI',
  line: 'Line out',
  dock: 'Dock',
  'hearing-aid': 'Hearing aid',
  cast: 'Casting',
  other: 'Audio output',
};

export function outputName(d: OutputDeviceLike | null | undefined): string {
  if (!d) return 'Unknown output';
  const base = OUTPUT_NAMES[d.type] ?? 'Audio output';
  const name = d.name?.trim();
  // Built-in devices report the phone's model name, which isn't helpful.
  if (!name || d.type === 'speaker' || d.type === 'earpiece' || d.type === 'wired') return base;
  return `${base} · ${name}`;
}

const worst = (states: StepState[]): StepState => (['loss', 'warn', 'info', 'good'] as const).find((s) => states.includes(s)) ?? 'good';

export function signalPath(s: SourceSpec, out: OutputInfoLike | null): SignalPath {
  const a = assess(s);
  const steps: PathStep[] = [];
  const tips: string[] = [];
  const srcRate = s.sampleRate;
  const mixer = out?.mixerSampleRate || DEFAULT_MIXER;
  const dev = out?.available ? out.device : null;

  // 1 · Source
  steps.push({
    key: 'source',
    title: s.kind === 'file' ? 'File' : s.kind === 'preview' ? 'Preview stream' : 'Stream',
    value: `${s.codec} · ${a.spec.replace(`${s.codec} · `, '')}`,
    detail: s.lossless ? a.blurb : `${a.blurb}${s.approximate ? ' (typical for this source)' : ''}`,
    state: s.lossless ? 'good' : a.tier === 'low' ? 'loss' : a.tier === 'standard' ? 'warn' : 'info',
  });

  // 2 · Decode
  if (s.lossless && (s.bitsPerSample ?? 16) > DECODE_BITS) {
    steps.push({
      key: 'decode',
      title: 'Decode',
      value: `${s.bitsPerSample}-bit → ${DECODE_BITS}-bit PCM`,
      detail: `The player decodes to ${DECODE_BITS}-bit. That still covers 96 dB of dynamic range — more than any real recording uses — but it isn't the full 24-bit file.`,
      state: 'warn',
    });
  } else {
    steps.push({
      key: 'decode',
      title: 'Decode',
      value: `${s.codec} → ${DECODE_BITS}-bit PCM`,
      detail: s.lossless ? 'Decoded exactly, sample for sample.' : 'Decoding restores PCM audio; the detail removed at encoding can’t come back.',
      state: 'good',
    });
  }

  // 3 · Mix
  const resampled = !!srcRate && srcRate !== mixer;
  if (dev?.type === 'usb') {
    const native = !srcRate || !dev.sampleRates.length || dev.sampleRates.includes(srcRate);
    steps.push({
      key: 'mix',
      title: 'Android mixer',
      value: native ? `${khz(srcRate ?? mixer)} kHz possible` : `${khz(srcRate)} → ${khz(Math.max(...dev.sampleRates))} kHz`,
      detail: `${native ? 'Your USB DAC supports this rate, so Android can run it without resampling on most phones.' : 'Your USB DAC doesn’t support this rate, so it will be resampled.'}${out?.bitPerfectCapable ? ' This phone also offers a bit-perfect USB mode (Android 14+).' : ''} Volume is applied digitally.`,
      state: native ? 'good' : 'info',
    });
  } else if (resampled) {
    steps.push({
      key: 'mix',
      title: 'Android mixer',
      value: `${khz(srcRate)} → ${khz(mixer)} kHz`,
      detail: `Android mixes everything at ${khz(mixer)} kHz, so this ${khz(srcRate)} kHz song is resampled. It’s high quality and practically inaudible, but not bit-perfect. Volume and any sound effects are applied here too.`,
      state: srcRate! > mixer ? 'warn' : 'info',
    });
  } else {
    steps.push({
      key: 'mix',
      title: 'Android mixer',
      value: `${khz(mixer)} kHz · no resampling`,
      detail: 'The song already matches the phone’s mixer rate. Volume and any sound effects are applied here.',
      state: 'good',
    });
  }

  // 4 · Output
  const type = dev?.type ?? 'unknown';
  const name = outputName(dev);
  let outState: StepState = 'info';
  let outDetail = 'Couldn’t see the output device on this build. Update to the latest APK for the full signal path.';
  switch (type) {
    case 'wired':
    case 'line':
    case 'dock':
      outState = 'good';
      outDetail = 'Straight out of the phone’s own DAC to your headphones — nothing re-encoded.';
      break;
    case 'usb':
      outState = 'good';
      outDetail = `External DAC${dev?.sampleRates.length ? ` (up to ${khz(Math.max(...dev.sampleRates))} kHz)` : ''} — the best way to hear everything in the file.`;
      break;
    case 'hdmi':
      outState = 'good';
      outDetail = 'Digital output to your TV / receiver.';
      break;
    case 'bluetooth':
      outState = 'loss';
      outDetail = 'Bluetooth re-compresses the audio before sending it (SBC, AAC, aptX or LDAC — picked by your phone and headphones). Lossless detail doesn’t make it through.';
      break;
    case 'bluetooth-le':
      outState = 'loss';
      outDetail = 'LE Audio re-compresses the audio with LC3 before sending it.';
      break;
    case 'bluetooth-call':
      outState = 'loss';
      outDetail = 'Your headset is in call mode (narrow-band audio). Ending any call usually switches it back.';
      break;
    case 'speaker':
    case 'earpiece':
      outState = 'warn';
      outDetail = 'Fine for casual listening; the tiny speaker can’t reproduce deep bass or fine detail.';
      break;
    case 'cast':
      outState = 'info';
      outDetail = 'Audio is being sent to another device.';
      break;
  }
  steps.push({ key: 'output', title: 'Output', value: name, detail: outDetail, state: outState });

  // Verdict
  const effBits = s.lossless ? Math.min(s.bitsPerSample ?? 16, DECODE_BITS) : null;
  const effRate = dev?.type === 'usb' && srcRate ? srcRate : mixer;
  const effective = `${effBits ? `${effBits}-bit / ` : ''}${khz(effRate)} kHz → ${OUTPUT_NAMES[type] ?? 'output'}`;
  let verdict: string;
  if (type === 'bluetooth' || type === 'bluetooth-le') {
    verdict = s.lossless
      ? 'Your file is lossless, but Bluetooth compresses it again on the way to your ears. Wired headphones or a USB DAC will play every bit.'
      : 'Lossy file over Bluetooth: compressed twice. It’s the convenient option, not the best-sounding one.';
    tips.push('Use wired headphones or a USB‑C DAC for lossless playback.');
  } else if (!s.lossless) {
    verdict = `This file is ${a.label.toLowerCase()} compressed audio (${a.spec}), so the path can’t add back what the encoder removed — but nothing else is lost.`;
    if (a.tier !== 'high') tips.push('A FLAC or ALAC copy of this song would sound noticeably cleaner.');
  } else if (a.tier === 'hires') {
    verdict =
      dev?.type === 'usb'
        ? 'Hi-Res file into a USB DAC: as close to the master as this phone gets.'
        : `Hi-Res file, rendered at ${effBits}-bit / ${khz(effRate)} kHz by Android — beyond-CD detail is trimmed, everything audible remains.`;
    if (dev?.type !== 'usb') tips.push('A USB DAC lets the phone run closer to the file’s full resolution.');
  } else if (resampled && dev?.type !== 'usb') {
    verdict = `CD-quality lossless, resampled to ${khz(mixer)} kHz — clean and transparent.`;
  } else {
    verdict = 'Lossless, with no resampling — a clean, transparent path.';
  }
  if (type === 'speaker') tips.push('Headphones will reveal far more of this song than the speaker.');

  return { steps, effective, verdict, state: worst(steps.map((x) => x.state)), tips };
}
