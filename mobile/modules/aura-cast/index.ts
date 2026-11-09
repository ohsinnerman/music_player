import { requireOptionalNativeModule } from 'expo';

export interface SsdpHit {
  location: string;
  usn?: string;
  server?: string;
  st?: string;
  address?: string;
}

export interface LanResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

interface Native {
  discover(timeoutMs: number, st: string): Promise<SsdpHit[]>;
  request(method: string, url: string, headers: Record<string, string>, body: string | null, timeoutMs: number): Promise<LanResponse>;
  startServer(): Promise<{ host: string; port: number }>;
  serve(uri: string, mime: string, ext: string, proxy: boolean): string;
  clearServed(): void;
  stopServer(): void;
  wifiAddress(): string | null;
  startService(title: string, text: string): void;
  stopService(): void;
}

/** Null on web / iOS / APKs built before DLNA support. */
export const castNative = requireOptionalNativeModule<Native>('AuraCast');
export const castSupported = !!castNative;
