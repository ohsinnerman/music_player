import { type EventSubscription, requireOptionalNativeModule } from 'expo';

export type OutputKind =
  | 'speaker'
  | 'earpiece'
  | 'wired'
  | 'bluetooth'
  | 'bluetooth-le'
  | 'bluetooth-call'
  | 'usb'
  | 'hdmi'
  | 'line'
  | 'dock'
  | 'hearing-aid'
  | 'cast'
  | 'other';

export interface OutputDevice {
  id: number;
  type: OutputKind;
  name: string | null;
  /** Empty = the device accepts any rate (Android's convention). */
  sampleRates: number[];
  channelCounts: number[];
  encodings: string[];
}

export interface OutputInfo {
  available: boolean;
  sdk?: number;
  /** The Android mixer's native output rate (usually 48 000 Hz). */
  mixerSampleRate?: number | null;
  framesPerBuffer?: number | null;
  device?: OutputDevice | null;
  devices?: OutputDevice[];
  /** Android 14+: the active device offers a bit-perfect mixer path. */
  bitPerfectCapable?: boolean;
}

/** What the player's output stage (AuraDsp) is doing for the current song. */
export interface DspState {
  /** The patched player is using Aura's output stage. */
  hooked?: boolean;
  active?: boolean;
  inputEncoding?: string;
  inputBits?: number;
  inputChannels?: number;
  outputChannels?: number;
  sampleRate?: number;
  downmixed?: boolean;
  replayGain?: { mode: number; source: 'off' | 'none' | 'track' | 'album'; gainDb: number; trackGain?: number | null; albumGain?: number | null };
  eqFilters?: number;
  bitPerfect?: { state: 'off' | 'no-usb' | 'bit-perfect' | 'native-rate' | 'unsupported-rate'; sampleRate?: number; device?: string | null; encoding?: string | null };
}

interface NativeModule {
  getOutputInfo(): OutputInfo;
  setSoundConfig?(json: string): void;
  getDspState?(): DspState;
  displayNames(uris: string[]): Promise<(string | null)[]>;
  addListener(event: 'onRouteChange', fn: (info: OutputInfo) => void): EventSubscription;
}

// Null on web, iOS, and APKs built before this module existed.
const native = requireOptionalNativeModule<NativeModule>('AuraAudioRoute');
const mod = native;

export function getOutputInfo(): OutputInfo {
  try {
    return native?.getOutputInfo() ?? { available: false };
  } catch {
    return { available: false };
  }
}

export function addRouteListener(fn: (info: OutputInfo) => void): () => void {
  if (!native) return () => undefined;
  const sub = native.addListener('onRouteChange', fn);
  return () => sub.remove();
}

/** Fallback name from a URI: last path segment, decoded ("primary:Music/Song.flac" → "Song.flac"). */
export function nameFromUri(uri: string): string {
  let last = uri.split(/[?#]/)[0]!.split('/').pop() ?? uri;
  try {
    last = decodeURIComponent(last);
  } catch {
    /* keep encoded */
  }
  const base = last.split('/').pop()!;
  // Document ids look like "primary:Music/Song.flac" or "audio:1234"; plain file paths keep their colons.
  return (uri.startsWith('content:') ? base.replace(/^[^:]*:/, '') : base) || last;
}

/** Real display names for content:// URIs (falls back to decoding the URI). */
export async function displayNames(uris: string[]): Promise<string[]> {
  let native: (string | null)[] = [];
  try {
    native = (await mod?.displayNames(uris)) ?? [];
  } catch {
    native = [];
  }
  return uris.map((u, i) => native[i] || nameFromUri(u));
}

/** Push sound settings (ReplayGain, EQ, downmix, bit-perfect) to the player. No-op where unsupported. */
export function setSoundConfig(cfg: object) {
  try {
    native?.setSoundConfig?.(JSON.stringify(cfg));
  } catch {
    /* older build */
  }
}

export function getDspState(): DspState {
  try {
    return native?.getDspState?.() ?? {};
  } catch {
    return {};
  }
}
