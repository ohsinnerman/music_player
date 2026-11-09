import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { playUrl } from '@/api/client';
import type { Track } from '@/api/types';
import { persistStorage } from '@/lib/storage';
import { castNative } from '../../modules/aura-cast';
import { AVT, MEDIA_RENDERER, RC, type Renderer, describeFault, didl, formatTime, mimeFor, parseDescription, parseSoapResponse, parseTime, soapEnvelope, soapHeaders } from './upnp';

/**
 * DLNA "Play on…": the receiver (e.g. a Yamaha RX-V485) pulls the original file
 * from the phone over Wi-Fi and decodes it itself. Android's decoder, mixer and
 * resampler aren't involved, so it's bit-perfect up to the receiver's DAC.
 */

export type CastStatus = 'idle' | 'connecting' | 'buffering' | 'playing' | 'paused' | 'stopped' | 'error';

interface CastState {
  devices: Renderer[];
  scanning: boolean;
  scanError?: string;
  active: Renderer | null;
  status: CastStatus;
  volume: number | null;
  error?: string;
  /** Last receiver used, offered first next time. */
  lastUdn?: string;
}

export const useCast = create<CastState>()(
  persist(
    (): CastState => ({ devices: [], scanning: false, active: null, status: 'idle', volume: null }),
    { name: 'aura.cast', storage: persistStorage, version: 1, partialize: (s) => ({ lastUdn: s.lastUdn, devices: s.devices }) },
  ),
);

export const castAvailable = !!castNative;

export interface CastHooks {
  onProgress(position: number, duration: number, playing: boolean, buffering: boolean): void;
  onEnded(): void;
  onLost(message: string): void;
}
let hooks: CastHooks | null = null;
export const setCastHooks = (h: CastHooks) => {
  hooks = h;
};

const native = () => {
  if (!castNative) throw new Error('Playing on Wi-Fi speakers needs the latest Android app');
  return castNative;
};

async function soap(dev: Renderer, svc: 'av' | 'rc', action: string, args: Record<string, string | number>, timeoutMs = 6000) {
  const url = svc === 'av' ? dev.avTransport : dev.renderingControl;
  const type = svc === 'av' ? dev.avServiceType || AVT : dev.rcServiceType || RC;
  if (!url) throw new Error('Not supported by this device');
  const r = await native().request('POST', url, soapHeaders(type, action), soapEnvelope(type, action, args), timeoutMs);
  return parseSoapResponse(r.status, r.body, action);
}

/* ───────────────────────── Discovery ───────────────────────── */

let scanning: Promise<void> | null = null;

export function scan(): Promise<void> {
  if (scanning) return scanning;
  scanning = (async () => {
    useCast.setState({ scanning: true, scanError: undefined });
    try {
      const hits = await native().discover(3500, MEDIA_RENDERER);
      const locations = [...new Set(hits.map((h) => h.location).filter((l) => /^http:\/\//i.test(l)))];
      const found = await Promise.all(
        locations.map(async (loc) => {
          try {
            const r = await native().request('GET', loc, {}, null, 3500);
            return r.status === 200 ? parseDescription(r.body, loc) : null;
          } catch {
            return null;
          }
        }),
      );
      const unique = new Map<string, Renderer>();
      for (const d of found) if (d && !unique.has(d.udn)) unique.set(d.udn, d);
      const devices = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
      useCast.setState({ devices });
    } catch (e) {
      useCast.setState({ scanError: e instanceof Error ? e.message : 'Couldn’t search the network' });
    } finally {
      useCast.setState({ scanning: false });
      scanning = null;
    }
  })();
  return scanning;
}

/* ───────────────────────── Session ───────────────────────── */

let poll: ReturnType<typeof setInterval> | null = null;
let loadSeq = 0;
let last = { state: '', position: 0, duration: 0, sawPlaying: false };
let misses = 0;
let busy = false;

const mediaFor = (t: Track) => (t.local ? mimeFor(t.local.format) : { mime: 'audio/mpeg', ext: 'mp3' });

function serveTrack(t: Track): { url: string; art?: string } {
  const n = native();
  const { mime, ext } = mediaFor(t);
  const url = t.local ? n.serve(t.local.uri, mime, ext, false) : n.serve(playUrl(t.id), mime, ext, true);
  const artSrc = t.artwork.large ?? t.artwork.medium ?? t.artwork.small;
  let art: string | undefined;
  if (artSrc) {
    try {
      art = artSrc.startsWith('file://') ? n.serve(artSrc, 'image/jpeg', 'jpg', false) : /^https?:/.test(artSrc) ? n.serve(artSrc, 'image/jpeg', 'jpg', true) : undefined;
    } catch {
      art = undefined;
    }
  }
  return { url, art };
}

export async function connect(dev: Renderer) {
  const n = native();
  useCast.setState({ active: dev, status: 'connecting', error: undefined, lastUdn: dev.udn });
  try {
    await n.startServer();
    n.startService(`Playing on ${dev.name}`, 'Aura is sending the original file over Wi-Fi');
  } catch (e) {
    useCast.setState({ active: null, status: 'error', error: e instanceof Error ? e.message : 'Couldn’t start' });
    throw e;
  }
  void refreshVolume();
  startPolling();
}

export async function disconnect(): Promise<void> {
  const dev = useCast.getState().active;
  stopPolling();
  loadSeq++;
  useCast.setState({ active: null, status: 'idle', volume: null });
  if (!castNative) return;
  if (dev) await soap(dev, 'av', 'Stop', { InstanceID: 0 }, 3000).catch(() => undefined);
  try {
    castNative.stopService();
    castNative.stopServer();
  } catch {
    /* ignore */
  }
}

/** Send a song to the receiver and (optionally) start it at a position. */
export async function load(t: Track, startAt = 0, autoplay = true): Promise<boolean> {
  const dev = useCast.getState().active;
  if (!dev) return false;
  const seq = ++loadSeq;
  busy = true;
  last = { state: 'TRANSITIONING', position: startAt, duration: t.durationMs / 1000, sawPlaying: false };
  useCast.setState({ status: 'buffering', error: undefined });
  hooks?.onProgress(startAt, t.durationMs / 1000, false, true);
  try {
    native().clearServed();
    const { url, art } = serveTrack(t);
    const { mime } = mediaFor(t);
    const meta = didl({
      id: t.id,
      title: t.title,
      artist: t.artists.map((a) => a.name).join(', '),
      album: t.album?.title,
      artUrl: art,
      url,
      mime,
      durationSec: t.durationMs ? t.durationMs / 1000 : undefined,
      sizeBytes: t.local?.sizeBytes,
      sampleRate: t.local?.sampleRate,
      channels: t.local?.channels,
      bitsPerSample: t.local?.lossless ? t.local.bitsPerSample : undefined,
    });
    await soap(dev, 'av', 'Stop', { InstanceID: 0 }, 3000).catch(() => undefined);
    if (seq !== loadSeq) return false;
    await soap(dev, 'av', 'SetAVTransportURI', { InstanceID: 0, CurrentURI: url, CurrentURIMetaData: meta }, 8000);
    if (seq !== loadSeq) return false;
    if (autoplay) await soap(dev, 'av', 'Play', { InstanceID: 0, Speed: '1' });
    if (startAt > 2 && seq === loadSeq) {
      await waitForState(dev, ['PLAYING', 'PAUSED_PLAYBACK'], 6000);
      await soap(dev, 'av', 'Seek', { InstanceID: 0, Unit: 'REL_TIME', Target: formatTime(startAt) }).catch(() => undefined);
    }
    useCast.setState({ status: autoplay ? 'playing' : 'paused' });
    return true;
  } catch (e) {
    if (seq !== loadSeq) return false;
    const msg = describeFault(e, dev.name);
    useCast.setState({ status: 'error', error: msg });
    throw new Error(msg);
  } finally {
    if (seq === loadSeq) busy = false;
  }
}

async function waitForState(dev: Renderer, states: string[], timeoutMs: number) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await soap(dev, 'av', 'GetTransportInfo', { InstanceID: 0 }, 2500);
      if (states.includes(r.CurrentTransportState ?? '')) return;
    } catch {
      /* keep trying */
    }
    await new Promise((res) => setTimeout(res, 300));
  }
}

const withDevice = async (fn: (d: Renderer) => Promise<unknown>) => {
  const dev = useCast.getState().active;
  if (!dev) return;
  try {
    await fn(dev);
  } catch (e) {
    useCast.setState({ error: describeFault(e, dev.name) });
  }
};

export const play = () => withDevice((d) => soap(d, 'av', 'Play', { InstanceID: 0, Speed: '1' }).then(() => useCast.setState({ status: 'playing' })));
export const pause = () => withDevice((d) => soap(d, 'av', 'Pause', { InstanceID: 0 }).then(() => useCast.setState({ status: 'paused' })));
export const seek = (sec: number) => withDevice((d) => soap(d, 'av', 'Seek', { InstanceID: 0, Unit: 'REL_TIME', Target: formatTime(sec) }));

export async function refreshVolume() {
  const dev = useCast.getState().active;
  if (!dev?.renderingControl) return;
  try {
    const r = await soap(dev, 'rc', 'GetVolume', { InstanceID: 0, Channel: 'Master' }, 3000);
    const v = Number(r.CurrentVolume);
    if (Number.isFinite(v)) useCast.setState({ volume: v });
  } catch {
    useCast.setState({ volume: null });
  }
}

let volTimer: ReturnType<typeof setTimeout> | null = null;
/** 0–100. Debounced so dragging a slider doesn't flood the receiver. */
export function setVolume(v: number) {
  const vol = Math.round(Math.min(100, Math.max(0, v)));
  useCast.setState({ volume: vol });
  if (volTimer) clearTimeout(volTimer);
  volTimer = setTimeout(() => {
    void withDevice((d) => soap(d, 'rc', 'SetVolume', { InstanceID: 0, Channel: 'Master', DesiredVolume: vol }));
  }, 120);
}

function startPolling() {
  stopPolling();
  misses = 0;
  poll = setInterval(() => void tick(), 1000);
}

function stopPolling() {
  if (poll) clearInterval(poll);
  poll = null;
}

async function tick() {
  const dev = useCast.getState().active;
  if (!dev || busy) return;
  try {
    const [ti, pi] = await Promise.all([soap(dev, 'av', 'GetTransportInfo', { InstanceID: 0 }, 2500), soap(dev, 'av', 'GetPositionInfo', { InstanceID: 0 }, 2500)]);
    misses = 0;
    if (busy || useCast.getState().active !== dev) return;
    const state = ti.CurrentTransportState ?? '';
    const position = parseTime(pi.RelTime);
    const duration = parseTime(pi.TrackDuration) || last.duration;
    const playing = state === 'PLAYING';
    const buffering = state === 'TRANSITIONING';
    if (playing) last.sawPlaying = true;

    // The song finished on the receiver: it went from playing to stopped near the end.
    const ended =
      last.sawPlaying &&
      (state === 'STOPPED' || state === 'NO_MEDIA_PRESENT') &&
      (last.state === 'PLAYING' || last.state === 'TRANSITIONING') &&
      (duration <= 0 || last.position >= duration - 4 || position === 0);
    last = { state, position: playing || buffering ? position : last.position, duration, sawPlaying: last.sawPlaying };
    useCast.setState({ status: playing ? 'playing' : buffering ? 'buffering' : state === 'PAUSED_PLAYBACK' ? 'paused' : 'stopped' });
    hooks?.onProgress(position, duration, playing, buffering);
    if (ended) {
      last.sawPlaying = false;
      hooks?.onEnded();
    }
  } catch {
    if (++misses >= 4) {
      const name = dev.name;
      await disconnect();
      hooks?.onLost(`Lost connection to ${name}`);
    }
  }
}
