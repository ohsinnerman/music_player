/**
 * Yamaha Extended Control (MusicCast) payload parsing — pure, unit-tested.
 * See musiccast.ts for the client.
 */

export interface McZone {
  id: string;
  name: string;
  funcs: string[];
  inputs: { id: string; name: string }[];
  programs: { id: string; name: string }[];
  volume: { min: number; max: number; step: number };
  /** Hardware dB range, when the receiver reports one. */
  db?: { min: number; max: number; step: number };
}

export interface McInfo {
  base: string;
  model?: string;
  zones: McZone[];
}

export interface McStatus {
  power: 'on' | 'standby';
  volume: number;
  maxVolume?: number;
  mute: boolean;
  input?: string;
  soundProgram?: string;
  pureDirect?: boolean;
  direct?: boolean;
  enhancer?: boolean;
  sleep?: number;
  /** "-35.5 dB" style reading. */
  db?: number;
}

/** Friendly fallbacks when the receiver has no name text for an id. */
const LABELS: Record<string, string> = {
  server: 'Server (DLNA)',
  net_radio: 'Net Radio',
  bluetooth: 'Bluetooth',
  usb: 'USB',
  airplay: 'AirPlay',
  spotify: 'Spotify',
  mc_link: 'MusicCast Link',
  tuner: 'Tuner',
  av1: 'AV 1',
  av2: 'AV 2',
  audio1: 'Audio 1',
  audio2: 'Audio 2',
  optical: 'Optical',
  coaxial: 'Coaxial',
  aux: 'AUX',
  tv: 'TV',
  straight: 'Straight',
  '2ch_stereo': '2ch Stereo',
  all_ch_stereo: 'All-Ch Stereo',
  surr_decoder: 'Surround Decoder',
  standard: 'Standard',
  main: 'Main',
  zone2: 'Zone 2',
  zone3: 'Zone 3',
  zone4: 'Zone 4',
};

export function label(id: string, names?: Map<string, string>): string {
  const n = names?.get(id);
  if (n) return n;
  if (LABELS[id]) return LABELS[id]!;
  const m = /^(hdmi|av|audio|phono|usb)(\d+)$/.exec(id);
  if (m) return `${m[1]!.toUpperCase()} ${m[2]}`;
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

type Json = Record<string, unknown>;
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Json[]) : []);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** getFeatures + getNameText → zones with readable names. */
export function parseFeatures(features: Json, nameText: Json | null, base: string, model?: string): McInfo {
  const names = new Map<string, string>();
  for (const list of ['zone_list', 'input_list', 'sound_program_list']) {
    for (const x of arr(nameText?.[list])) if (typeof x.id === 'string' && typeof x.text === 'string' && x.text.trim()) names.set(x.id, x.text.trim());
  }
  const zones = arr(features.zone).map((z) => {
    const id = String(z.id);
    const range = (k: string) => arr(z.range_step).find((r) => r.id === k);
    const v = range('volume');
    const db = range('actual_volume_db');
    return {
      id,
      name: label(id, names),
      funcs: strs(z.func_list),
      inputs: strs(z.input_list).map((i) => ({ id: i, name: label(i, names) })),
      programs: strs(z.sound_program_list).map((p) => ({ id: p, name: label(p, names) })),
      volume: { min: Number(v?.min ?? 0), max: Number(v?.max ?? 100), step: Number(v?.step ?? 1) || 1 },
      db: db ? { min: Number(db.min), max: Number(db.max), step: Number(db.step) || 0.5 } : undefined,
    };
  });
  return { base, model, zones };
}

export function parseStatus(j: Json): McStatus {
  const actual = j.actual_volume as Json | undefined;
  return {
    power: j.power === 'on' ? 'on' : 'standby',
    volume: Number(j.volume ?? 0),
    maxVolume: j.max_volume !== undefined ? Number(j.max_volume) : undefined,
    mute: j.mute === true,
    input: typeof j.input === 'string' ? j.input : undefined,
    soundProgram: typeof j.sound_program === 'string' ? j.sound_program : undefined,
    pureDirect: typeof j.pure_direct === 'boolean' ? j.pure_direct : undefined,
    direct: typeof j.direct === 'boolean' ? j.direct : undefined,
    enhancer: typeof j.enhancer === 'boolean' ? j.enhancer : undefined,
    sleep: typeof j.sleep === 'number' ? j.sleep : undefined,
    db: actual && actual.unit === 'dB' && typeof actual.value === 'number' ? actual.value : undefined,
  };
}
