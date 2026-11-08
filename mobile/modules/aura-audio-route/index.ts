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

interface NativeModule {
  getOutputInfo(): OutputInfo;
  addListener(event: 'onRouteChange', fn: (info: OutputInfo) => void): EventSubscription;
}

// Null on web, iOS, and APKs built before this module existed.
const native = requireOptionalNativeModule<NativeModule>('AuraAudioRoute');

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
