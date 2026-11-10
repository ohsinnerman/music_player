import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { playUrl } from '@/api/client';
import type { Track } from '@/api/types';
import { persistStorage } from '@/lib/storage';
import { usePlayer } from '@/player/store';
import { GCAST_MAX_RATE, tvData } from './tvScreen';
import { castNative, type GcDevice, type GcLoad, type GcStatusEvent, googleCastSupported } from '../../modules/aura-cast';
import { AVT, MEDIA_RENDERER, RC, type Renderer, describeFault, didl, formatTime, mimeFor, parseDescription, parseSoapResponse, parseTime, soapEnvelope, soapHeaders } from './upnp';

/**
 * DLNA "Play on…": the receiver (e.g. a Yamaha RX-V485) pulls the original file
 * from the phone over Wi-Fi and decodes it itself. Android's decoder, mixer and
 * resampler aren't involved, so it's bit-perfect up to the receiver's DAC.
 */

export type CastStatus = 'idle' | 'connecting' | 'buffering' | 'playing' | 'paused' | 'stopped' | 'error';

interface CastState {
  devices: Renderer[];
  /** Google Cast devices seen right now (live while the picker is open). */
  tvs: Renderer[];
  scanning: boolean;
  scanError?: string;
  active: Renderer | null;
  status: CastStatus;
  volume: number | null;
  error?: string;
  /** Google Cast: which screen the TV shows for this session. */
  screen?: 'aura' | 'google';
  /** Last receiver used, offered first next time. */
  lastUdn?: string;
}

export const useCast = create<CastState>()(
  persist(
    (): CastState => ({ devices: [], tvs: [], scanning: false, active: null, status: 'idle', volume: null }),
    { name: 'aura.cast', storage: persistStorage, version: 1, partialize: (s) => ({ lastUdn: s.lastUdn, devices: s.devices.filter((d) => !isG(d)) }) },
  ),
);

export const castAvailable = !!castNative;
export const gcastAvailable = googleCastSupported;
const isG = (d: Renderer | null | undefined) => d?.kind === 'gcast';

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

/* ───────────────────────── Google Cast ───────────────────────── */

const toRenderer = (d: GcDevice): Renderer => ({
  kind: 'gcast',
  gcKind: d.kind,
  gcId: d.id,
  gcAuraScreen: d.auraScreen ?? null,
  udn: `gcast:${d.id}`,
  name: d.name,
  model: d.model ?? d.description ?? undefined,
  manufacturer: 'Google Cast',
  location: '',
  avTransport: '',
  avServiceType: '',
});

let gcReady: Promise<boolean> | null = null;
let gcWaiter: { resolve: () => void; reject: (e: Error) => void } | null = null;
let gcEnding = false;
let gcLast: { state: string; sawPlaying: boolean; duration: number } = { state: '', sawPlaying: false, duration: 0 };

/** Initialise the Cast framework once and listen to its events. */
function gcInit(): Promise<boolean> {
  if (!googleCastSupported || !castNative?.gcInit) return Promise.resolve(false);
  gcReady ??= castNative
    .gcInit()
    .then(() => {
      castNative!.addListener?.('onCastDevices', (e) => useCast.setState({ tvs: e.devices.map(toRenderer).sort((a, b) => a.name.localeCompare(b.name)) }));
      castNative!.addListener?.('onCastSession', (e) => {
        if (e.state === 'connected') {
          useCast.setState({ screen: e.auraScreen ? 'aura' : 'google' });
          gcWaiter?.resolve();
        }
        else if (e.state === 'failed') gcWaiter?.reject(new Error(e.error ?? 'Couldn’t connect'));
        if (e.state === 'connected' || e.state === 'failed') gcWaiter = null;
        const active = useCast.getState().active;
        if (e.state === 'ended' && isG(active) && !gcEnding) {
          void disconnect().then(() => hooks?.onLost(e.error ?? `Disconnected from ${active!.name}`));
        }
      });
      castNative!.addListener?.('onCastStatus', onGcStatus);
      return true;
    })
    .catch(() => false);
  return gcReady;
}

function onGcStatus(e: GcStatusEvent) {
  if (!isG(useCast.getState().active) || busy) return;
  const playing = e.state === 'playing';
  const buffering = e.state === 'buffering';
  if (playing) gcLast.sawPlaying = true;
  const duration = e.duration > 0 ? e.duration : gcLast.duration;
  if (e.volume >= 0) useCast.setState({ volume: Math.round(e.volume * 100) });
  useCast.setState({ status: playing ? 'playing' : buffering ? 'buffering' : e.state === 'paused' ? 'paused' : e.state === 'idle' ? 'stopped' : useCast.getState().status });
  if (playing || buffering || e.state === 'paused') hooks?.onProgress(e.position, duration, playing, buffering);
  const wasActive = gcLast.state === 'playing' || gcLast.state === 'buffering';
  gcLast = { ...gcLast, state: e.state, duration };
  if (e.state === 'idle' && wasActive && gcLast.sawPlaying && (e.idleReason === 'finished' || e.idleReason === 'error')) {
    gcLast.sawPlaying = false;
    if (e.idleReason === 'error') useCast.setState({ error: `${useCast.getState().active?.name ?? 'The device'} couldn’t play this file` });
    hooks?.onEnded();
  }
}

/** Start / stop looking for Google Cast devices (call while the picker is open). */
export async function watchGoogleCast(on: boolean) {
  if (!(await gcInit())) return;
  if (on) {
    castNative!.gcStartDiscovery?.();
    try {
      const now = castNative!.gcDevices?.() ?? [];
      if (now.length) useCast.setState({ tvs: now.map(toRenderer).sort((a, b) => a.name.localeCompare(b.name)) });
    } catch {
      // older APK read MediaRouter off the main thread; the onCastDevices event fills the list
    }
  } else if (!isG(useCast.getState().active)) castNative!.gcStopDiscovery?.();
}

async function gcConnect(dev: Renderer) {
  if (!(await gcInit()) || !dev.gcId) throw new Error('Google Cast isn’t available on this phone');
  const connected = new Promise<void>((resolve, reject) => {
    gcWaiter = { resolve, reject };
    setTimeout(() => reject(new Error(`${dev.name} didn’t answer`)), 20000);
  });
  await castNative!.gcConnect!(dev.gcId);
  await connected;
}

/** Aura's TV screen: the Cast App ID registered for /cast/receiver ("" = Google's default screen). */
export function tvScreenAppId(): string {
  const id = castNative?.gcReceiver?.() ?? '';
  return id === 'CC1AD845' ? '' : id;
}

export async function setTvScreenAppId(appId: string): Promise<string> {
  if (!castNative?.gcSetReceiver) throw new Error('Needs the latest Android app');
  await gcInit();
  const id = await castNative.gcSetReceiver(appId.trim().toUpperCase());
  return id === 'CC1AD845' ? '' : id;
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
    n.startService(`Playing on ${dev.name}`, isG(dev) ? 'Aura is streaming the original file to your Cast device' : 'Aura is sending the original file over Wi-Fi');
    if (isG(dev)) {
      gcEnding = false;
      gcLast = { state: '', sawPlaying: false, duration: 0 };
      await gcConnect(dev);
    }
  } catch (e) {
    try {
      n.stopService();
      n.stopServer();
    } catch {
      /* ignore */
    }
    useCast.setState({ active: null, status: 'error', error: e instanceof Error ? e.message : 'Couldn’t start' });
    throw e;
  }
  if (isG(dev)) return;
  void refreshVolume();
  startPolling();
}

export async function disconnect(): Promise<void> {
  const dev = useCast.getState().active;
  stopPolling();
  loadSeq++;
  useCast.setState({ active: null, status: 'idle', volume: null });
  if (!castNative) return;
  if (isG(dev)) {
    gcEnding = true;
    castNative.gcStop?.();
    castNative.gcDisconnect?.();
    castNative.gcStopDiscovery?.();
  } else if (dev) await soap(dev, 'av', 'Stop', { InstanceID: 0 }, 3000).catch(() => undefined);
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
    if (isG(dev)) {
      // Every Google Cast device decodes up to 96 kHz; say so instead of a silent failure.
      if (t.local?.sampleRate && t.local.sampleRate > GCAST_MAX_RATE) {
        throw new Error(`Google Cast plays up to 96 kHz, this file is ${Math.round(t.local.sampleRate / 1000)} kHz — play it on a DLNA receiver instead`);
      }
      gcLast = { state: 'buffering', sawPlaying: false, duration: t.durationMs / 1000 };
      const p = usePlayer.getState();
      const upNext = p.queue[p.index]?.id === t.id ? p.queue[p.index + 1] : undefined;
      const tv = await tvData(t, upNext);
      if (seq !== loadSeq) return false;
      const load: GcLoad = {
        customData: { ...tv.data },
        url,
        mime,
        title: t.title,
        artist: t.artists.map((a) => a.name).join(', '),
        album: t.album?.title,
        art,
        duration: t.durationMs ? t.durationMs / 1000 : undefined,
        startAt,
        autoplay,
      };
      await native().gcLoad!(JSON.stringify(load));
      if (seq !== loadSeq) return false;
      useCast.setState({ status: autoplay ? 'buffering' : 'paused' });
      // Lyrics that took longer (network / identification) go to the TV screen as a message.
      if (!tv.data.lyrics) {
        void tv.later.then((lyrics) => {
          if (lyrics && seq === loadSeq && isG(useCast.getState().active)) native().gcSend?.(JSON.stringify({ type: 'lyrics', contentId: url, lyrics }));
        });
      }
      return true;
    }
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

export const play = () =>
  withDevice(async (d) => {
    if (isG(d)) native().gcPlay?.();
    else await soap(d, 'av', 'Play', { InstanceID: 0, Speed: '1' });
    useCast.setState({ status: 'playing' });
  });
export const pause = () =>
  withDevice(async (d) => {
    if (isG(d)) native().gcPause?.();
    else await soap(d, 'av', 'Pause', { InstanceID: 0 });
    useCast.setState({ status: 'paused' });
  });
export const seek = (sec: number) => withDevice(async (d) => (isG(d) ? native().gcSeek?.(sec) : soap(d, 'av', 'Seek', { InstanceID: 0, Unit: 'REL_TIME', Target: formatTime(sec) })));

export async function refreshVolume() {
  const dev = useCast.getState().active;
  if (!dev?.renderingControl || isG(dev)) return;
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
    void withDevice(async (d) => (isG(d) ? native().gcSetVolume?.(vol / 100) : soap(d, 'rc', 'SetVolume', { InstanceID: 0, Channel: 'Master', DesiredVolume: vol })));
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
  if (!dev || busy || isG(dev)) return;
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
