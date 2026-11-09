import { create } from 'zustand';
import { castNative } from '../../modules/aura-cast';
import { type McInfo, type McStatus, parseFeatures, parseStatus } from './yxc';

/**
 * Yamaha MusicCast receivers (RX-V485 and friends) expose the "Yamaha Extended
 * Control" HTTP/JSON API next to DLNA: power, input, volume in dB, Pure Direct,
 * sound programs, zones. Aura finds its URL in the DLNA description
 * (`yamaha:X_yxcControlURL`) and drives it with the LAN-only HTTP client.
 */

export type { McInfo, McStatus, McZone } from './yxc';

type Json = Record<string, unknown>;

const ERRORS: Record<number, string> = {
  1: 'Initializing',
  2: 'Internal error',
  3: 'Invalid request',
  4: 'Invalid parameter',
  5: 'Guarded (not available in this state)',
  6: 'Timed out',
};

export class McError extends Error {}

/** One API call; throws McError on a non-zero response_code. */
export async function call(base: string, path: string, params: Record<string, string | number | boolean> = {}): Promise<Json> {
  if (!castNative) throw new McError('Receiver control needs the latest Android app');
  const q = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const url = `${base.replace(/\/?$/, '/')}${path}${q ? `?${q}` : ''}`;
  const r = await castNative.request('GET', url, { Accept: 'application/json' }, null, 4000);
  if (r.status !== 200) throw new McError(`Receiver answered ${r.status}`);
  let j: Json;
  try {
    j = JSON.parse(r.body) as Json;
  } catch {
    throw new McError('Unexpected answer from the receiver');
  }
  const code = Number(j.response_code ?? 0);
  if (code !== 0) throw new McError(ERRORS[code] ?? `Receiver error ${code}`);
  return j;
}

/* ───────────────────────── Store ───────────────────────── */

interface McState {
  udn: string | null;
  info: McInfo | null;
  zone: string;
  status: Record<string, McStatus>;
  loading: boolean;
  error?: string;
}

export const useMusicCast = create<McState>(() => ({ udn: null, info: null, zone: 'main', status: {}, loading: false }));

export async function openReceiver(udn: string, base: string) {
  const s = useMusicCast.getState();
  if (s.udn === udn && s.info) {
    void refresh();
    return;
  }
  useMusicCast.setState({ udn, info: null, status: {}, zone: 'main', loading: true, error: undefined });
  try {
    const [dev, features, names] = await Promise.all([
      call(base, 'system/getDeviceInfo').catch(() => null),
      call(base, 'system/getFeatures'),
      call(base, 'system/getNameText').catch(() => null),
    ]);
    const info = parseFeatures(features, names, base, typeof dev?.model_name === 'string' ? dev.model_name : undefined);
    if (useMusicCast.getState().udn !== udn) return;
    useMusicCast.setState({ info, zone: info.zones[0]?.id ?? 'main' });
    await refresh();
  } catch (e) {
    useMusicCast.setState({ error: e instanceof Error ? e.message : 'Couldn’t reach the receiver' });
  } finally {
    useMusicCast.setState({ loading: false });
  }
}

export async function refresh(zone = useMusicCast.getState().zone) {
  const info = useMusicCast.getState().info;
  if (!info) return;
  try {
    const st = parseStatus(await call(info.base, `${zone}/getStatus`));
    useMusicCast.setState((s) => ({ status: { ...s.status, [zone]: st }, error: undefined }));
  } catch (e) {
    useMusicCast.setState({ error: e instanceof Error ? e.message : 'Couldn’t reach the receiver' });
  }
}

/** Optimistically apply, send, then re-read. */
async function send(path: string, params: Record<string, string | number | boolean>, optimistic: Partial<McStatus>) {
  const { info, zone } = useMusicCast.getState();
  if (!info) return;
  useMusicCast.setState((s) => ({ status: { ...s.status, [zone]: { ...(s.status[zone] ?? { power: 'standby', volume: 0, mute: false }), ...optimistic } } }));
  try {
    await call(info.base, `${zone}/${path}`, params);
  } catch (e) {
    useMusicCast.setState({ error: e instanceof Error ? e.message : 'Command failed' });
  }
  void refresh(zone);
}

export const mc = {
  setZone: (zone: string) => {
    useMusicCast.setState({ zone });
    void refresh(zone);
  },
  power: (on: boolean) => send('setPower', { power: on ? 'on' : 'standby' }, { power: on ? 'on' : 'standby' }),
  volume: (v: number) => send('setVolume', { volume: Math.round(v) }, { volume: Math.round(v) }),
  mute: (m: boolean) => send('setMute', { enable: m }, { mute: m }),
  input: (id: string) => send('setInput', { input: id }, { input: id }),
  program: (id: string) => send('setSoundProgram', { program: id }, { soundProgram: id }),
  pureDirect: (on: boolean) => send('setPureDirect', { enable: on }, { pureDirect: on }),
  direct: (on: boolean) => send('setDirect', { enable: on }, { direct: on }),
  enhancer: (on: boolean) => send('setEnhancer', { enable: on }, { enhancer: on }),
  sleep: (min: number) => send('setSleep', { sleep: min }, { sleep: min }),
};
