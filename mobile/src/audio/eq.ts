/**
 * EQ maths shared by the Sound screen (curve drawing, auto preamp) and the
 * native filters (modules/aura-audio-route → Dsp.kt uses the same RBJ
 * cookbook formulas, so what you see is what you hear).
 */

export type FilterType = 'PK' | 'LSC' | 'HSC';

export interface EqFilter {
  type: FilterType;
  fc: number;
  gainDb: number;
  q: number;
}

/** Headphone correction from AutoEq. */
export interface HeadphoneProfile {
  name: string;
  source: string;
  rig?: string;
  path: string;
  preampDb: number;
  filters: EqFilter[];
}

/** 10-band graphic EQ centre frequencies (octaves). */
export const BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const BAND_LABELS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
export const BAND_RANGE = 12;
/** Q for one-octave peaking bands. */
const BAND_Q = 1.41;

export const PRESETS: { id: string; name: string; bands: number[] }[] = [
  { id: 'flat', name: 'Flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass', name: 'Bass boost', bands: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: 'less-bass', name: 'Less bass', bands: [-5, -4, -3, -1, 0, 0, 0, 0, 0, 0] },
  { id: 'treble', name: 'Treble boost', bands: [0, 0, 0, 0, 0, 0, 1, 3, 4, 5] },
  { id: 'vocal', name: 'Vocal', bands: [-2, -2, -1, 0, 2, 3, 3, 2, 0, -1] },
  { id: 'loudness', name: 'Loudness', bands: [5, 4, 2, 0, -1, -1, 0, 1, 3, 4] },
  { id: 'acoustic', name: 'Acoustic', bands: [3, 3, 2, 1, 1, 1, 2, 2, 2, 1] },
  { id: 'electronic', name: 'Electronic', bands: [4, 4, 1, 0, -2, 1, 0, 1, 3, 4] },
  { id: 'classical', name: 'Classical', bands: [3, 2, 1, 0, 0, 0, -1, -1, 1, 2] },
  { id: 'spoken', name: 'Podcast', bands: [-4, -3, -1, 1, 3, 4, 3, 1, -1, -3] },
];

export function bandsToFilters(bands: readonly number[]): EqFilter[] {
  return BANDS.map((fc, i) => ({ type: 'PK' as const, fc, gainDb: bands[i] ?? 0, q: BAND_Q })).filter((f) => Math.abs(f.gainDb) >= 0.05);
}

interface Coeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** RBJ cookbook biquad (same as Dsp.kt's Biquad.design). */
export function design(f: EqFilter, sampleRate: number): Coeffs | null {
  if (Math.abs(f.gainDb) < 0.01 || f.fc <= 0 || f.fc >= sampleRate / 2 || f.q <= 0) return null;
  const A = 10 ** (f.gainDb / 40);
  const w = (2 * Math.PI * f.fc) / sampleRate;
  const cw = Math.cos(w);
  const alpha = Math.sin(w) / (2 * f.q);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (f.type === 'LSC' || f.type === 'HSC') {
    const s = 2 * Math.sqrt(A) * alpha;
    const sign = f.type === 'LSC' ? 1 : -1;
    b0 = A * (A + 1 - sign * (A - 1) * cw + s);
    b1 = sign * 2 * A * (A - 1 - sign * (A + 1) * cw);
    b2 = A * (A + 1 - sign * (A - 1) * cw - s);
    a0 = A + 1 + sign * (A - 1) * cw + s;
    a1 = -sign * 2 * (A - 1 + sign * (A + 1) * cw);
    a2 = A + 1 + sign * (A - 1) * cw - s;
  } else {
    b0 = 1 + alpha * A;
    b1 = -2 * cw;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cw;
    a2 = 1 - alpha / A;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Combined magnitude response (dB) of a filter chain at frequency `f`. */
export function responseDb(filters: readonly EqFilter[], f: number, sampleRate = 48000): number {
  const w = (2 * Math.PI * f) / sampleRate;
  const c1 = Math.cos(w);
  const s1 = -Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = -Math.sin(2 * w);
  let db = 0;
  for (const flt of filters) {
    const q = design(flt, sampleRate);
    if (!q) continue;
    const nr = q.b0 + q.b1 * c1 + q.b2 * c2;
    const ni = q.b1 * s1 + q.b2 * s2;
    const dr = 1 + q.a1 * c1 + q.a2 * c2;
    const di = q.a1 * s1 + q.a2 * s2;
    db += 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
  }
  return db;
}

/** Log-spaced frequencies 20 Hz – 20 kHz. */
export function freqs(n = 96): number[] {
  return Array.from({ length: n }, (_, i) => 20 * 1000 ** (i / (n - 1)));
}

/** Negative preamp that keeps the loudest boost of the curve at 0 dBFS. */
export function autoPreamp(filters: readonly EqFilter[]): number {
  let peak = 0;
  for (const f of freqs(160)) peak = Math.max(peak, responseDb(filters, f));
  return -Math.round(peak * 10) / 10;
}

/** All active filters: headphone correction first, then the graphic bands. */
export function chain(bands: readonly number[], headphone: HeadphoneProfile | null): EqFilter[] {
  return [...(headphone?.filters ?? []), ...bandsToFilters(bands)];
}
