import { type EventSubscription, requireOptionalNativeModule } from 'expo';

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

/** A Google Cast device (Chromecast, Google TV, Nest speaker, Cast-enabled TV / receiver, group). */
export interface GcDevice {
  id: string;
  name: string;
  description?: string | null;
  model?: string | null;
  kind: 'tv' | 'speaker' | 'group';
  connecting?: boolean;
  selected?: boolean;
}

export interface GcSessionEvent {
  state: 'connecting' | 'connected' | 'failed' | 'ended' | 'suspended';
  name?: string | null;
  error?: string | null;
}

export interface GcStatusEvent {
  state: 'playing' | 'paused' | 'buffering' | 'idle' | 'unknown';
  idleReason?: 'finished' | 'error' | 'canceled' | 'interrupted' | null;
  position: number;
  duration: number;
  /** 0–1, or −1 if unknown. */
  volume: number;
  contentId?: string | null;
}

export interface GcLoad {
  url: string;
  mime: string;
  title: string;
  artist?: string;
  album?: string;
  art?: string;
  duration?: number;
  startAt?: number;
  autoplay?: boolean;
  /** For Aura's TV screen: { aura: 1, palette, quality, lyrics, next }. */
  customData?: Record<string, unknown>;
}

interface Native {
  gcInit?(): Promise<boolean>;
  gcStartDiscovery?(): void;
  gcStopDiscovery?(): void;
  gcDevices?(): GcDevice[];
  gcConnect?(id: string): Promise<boolean>;
  gcDisconnect?(): void;
  gcLoad?(o: GcLoad): Promise<boolean>;
  gcSetReceiver?(appId: string): Promise<string>;
  gcReceiver?(): string;
  gcSend?(json: string): void;
  gcPlay?(): void;
  gcPause?(): void;
  gcSeek?(sec: number): void;
  gcStop?(): void;
  gcSetVolume?(v: number): void;
  addListener?(event: 'onCastDevices', fn: (e: { devices: GcDevice[] }) => void): EventSubscription;
  addListener?(event: 'onCastSession', fn: (e: GcSessionEvent) => void): EventSubscription;
  addListener?(event: 'onCastStatus', fn: (e: GcStatusEvent) => void): EventSubscription;
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

/** Google Cast is in this build (older APKs only have DLNA). */
export const googleCastSupported = !!castNative?.gcInit;
