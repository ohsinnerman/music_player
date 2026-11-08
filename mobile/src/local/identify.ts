import { File, UploadType } from 'expo-file-system';
import { ApiError, apiBase, qs } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import type { Identification, Lyrics, Track } from '@/api/types';
import { tokenStorage } from '@/auth/tokenStorage';
import { usePlayer, useProgress } from '@/player/store';
import { useSettings } from '@/settings/store';
import { openSource, readLyricsFile, tempFile, writeLyricsFile } from './files';
import { type IdentityState, useDeviceMusic } from './store';
import { makeClip, readTags } from './tags';
import { MIME_EXT } from './tags/mime';

/**
 * Lyrics for a song imported from the device:
 *   1. lyrics embedded in the file / cached from before (instant, offline)
 *   2. server /identify: tags + file name → LRCLIB, with Groq AI cleaning up messy metadata
 *   3. server /identify/audio: a ~20 s clip → Whisper → AI → LRCLIB (once per song, if allowed)
 * What we learn about the song (real title / artist) is written back to the library.
 */

export class NoLyricsError extends Error {
  constructor(public readonly ident: IdentityState | undefined) {
    super('No lyrics found for this song');
    this.name = 'NoLyricsError';
  }
}

const RETRY_AFTER_MS = 3 * 24 * 60 * 60_000;
const inflight = new Map<string, Promise<Lyrics>>();

export function getLocalLyrics(track: Track, opts: { listen?: boolean; force?: boolean } = {}): Promise<Lyrics> {
  const key = `${track.id}|${opts.listen ? 'l' : ''}|${opts.force ? 'f' : ''}`;
  let p = inflight.get(key);
  if (!p) {
    p = resolve(track, opts).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

const durationOf = (t: Track) => {
  if (t.durationMs > 0) return Math.round(t.durationMs / 1000);
  const s = usePlayer.getState();
  if (s.queue[s.index]?.id === t.id && useProgress.getState().duration > 0) return Math.round(useProgress.getState().duration);
  return undefined;
};

const hints = (t: Track) => {
  const tags = t.local?.tags ?? {};
  return {
    title: tags.title || undefined,
    artist: tags.artist || undefined,
    album: tags.album || undefined,
    duration: durationOf(t),
    filename: t.local?.fileName,
  };
};

async function resolve(track: Track, opts: { listen?: boolean; force?: boolean }): Promise<Lyrics> {
  if (!opts.force) {
    const cached = readLyricsFile(track.id);
    if (cached) return cached;
  }
  const store = useDeviceMusic.getState();
  const ident = store.ident[track.id];
  const recent = ident && Date.now() - Date.parse(ident.at) < RETRY_AFTER_MS;
  if (!opts.listen && !opts.force && ident?.status === 'nolyrics' && recent) throw new NoLyricsError(ident);

  let canListen = ident?.canListen ?? false;
  if (!opts.listen) {
    const h = hints(track);
    if (!h.title && !h.filename) throw new NoLyricsError(ident);
    store.setIdent(track.id, { ...(ident ?? {}), status: 'pending', at: new Date().toISOString() });
    let res: Identification;
    try {
      res = await endpoints.identify(h);
    } catch (e) {
      store.setIdent(track.id, { ...(ident ?? {}), status: 'error', at: new Date().toISOString() });
      throw e;
    }
    apply(track, res, {});
    if (res.lyrics) return save(track, res.lyrics);
    canListen = res.canListen;
  }

  const listened = useDeviceMusic.getState().ident[track.id]?.listened;
  const allowed = useSettings.getState().aiListen;
  if (opts.listen || (canListen && allowed && !listened)) {
    const res = await listen(track);
    if (res) {
      apply(track, res, { listened: true });
      if (res.lyrics) return save(track, res.lyrics);
    } else {
      const cur = useDeviceMusic.getState().ident[track.id];
      useDeviceMusic.getState().setIdent(track.id, { ...(cur ?? { status: 'nolyrics' }), listened: true, canListen: false, at: new Date().toISOString() });
    }
  }
  throw new NoLyricsError(useDeviceMusic.getState().ident[track.id]);
}

function save(track: Track, lyrics: Lyrics): Lyrics {
  writeLyricsFile(track.id, lyrics);
  return lyrics;
}

function apply(track: Track, res: Identification, extra: Partial<IdentityState>) {
  const store = useDeviceMusic.getState();
  const prev = store.ident[track.id];
  store.setIdent(track.id, {
    status: res.lyrics ? 'found' : 'nolyrics',
    match: res.match ?? prev?.match ?? null,
    lyricsSource: res.lyrics ? 'lrclib' : undefined,
    canListen: res.canListen,
    listened: extra.listened ?? prev?.listened,
    at: new Date().toISOString(),
  });

  // Fill in what the file didn't say. The user's own tags always win.
  const m = res.match;
  const tags = track.local?.tags ?? {};
  if (!m || (tags.title && tags.artist)) return;
  if (m.confidence === 'low' && m.source !== 'audio' && !res.lyrics) return;
  const patch: Partial<Track> = {
    title: tags.title || m.title,
    artists: tags.artist ? track.artists : [{ id: track.artists[0]?.id ?? 'local-artist:unknown', name: m.artist }],
    album: track.album ?? (m.album ? { id: `local-album:${m.album.toLowerCase()}`, title: m.album } : undefined),
  };
  store.patchTrack(track.id, patch);
  // Keep the now-playing queue in sync so the player shows the real name right away.
  const q = usePlayer.getState().queue;
  if (q.some((t) => t.id === track.id)) usePlayer.setState({ queue: q.map((t) => (t.id === track.id ? { ...t, ...patch } : t)) });
}

/** Send a short clip to the server to be "heard" (Whisper). Null if this format can't be clipped. */
async function listen(track: Track): Promise<Identification | null> {
  if (!track.local) return null;
  const file = new File(track.local.uri);
  const src = openSource(file);
  let clip: Awaited<ReturnType<typeof makeClip>>;
  try {
    clip = await makeClip(src, await readTags(src));
  } finally {
    src.close();
  }
  if (!clip) return null;

  const tmp = tempFile(`aura-clip-${Date.now()}.${MIME_EXT[clip.mime] ?? 'bin'}`, clip.bytes);
  try {
    const url = `${apiBase()}/identify/audio${qs(hints(track))}`;
    const headers: Record<string, string> = { 'Content-Type': clip.mime, Accept: 'application/json' };
    const token = tokenStorage.getAccess();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await tmp.upload(url, { httpMethod: 'POST', uploadType: UploadType.BINARY_CONTENT, headers, mimeType: clip.mime });
    let json: { data?: Identification; error?: { code: string; message: string } } = {};
    try {
      json = JSON.parse(res.body);
    } catch {
      /* fall through */
    }
    if (res.status < 200 || res.status >= 300 || !json.data) {
      throw new ApiError(res.status, json.error?.code ?? 'http_error', json.error?.message ?? `Request failed (${res.status})`);
    }
    return json.data;
  } finally {
    try {
      tmp.delete();
    } catch {
      /* ignore */
    }
  }
}

/** Forget what we found (e.g. to search again after fixing tags). */
export function resetIdentity(id: string) {
  const s = useDeviceMusic.getState();
  const ident = { ...s.ident };
  delete ident[id];
  useDeviceMusic.setState({ ident });
}

let batchCancel = false;

/**
 * Look up lyrics for every imported song that doesn't have any yet, gently
 * (one at a time, spaced out) so we stay well inside the server's rate limits.
 * Listening (audio clips) is left for when a song is actually played.
 */
export async function findAllLyrics(): Promise<{ found: number; total: number }> {
  const s = useDeviceMusic.getState();
  if (s.lyricsBatch) {
    batchCancel = true;
    return { found: 0, total: 0 };
  }
  const todo = s.tracks.filter((t) => {
    const st = s.ident[t.id]?.status;
    return st !== 'found' && st !== 'nolyrics';
  });
  batchCancel = false;
  let found = 0;
  for (let i = 0; i < todo.length && !batchCancel; i++) {
    const t = todo[i]!;
    useDeviceMusic.getState().setLyricsBatch({ done: i, total: todo.length, label: t.title });
    try {
      if (!readLyricsFile(t.id)) {
        const res = await endpoints.identify(hints(t));
        apply(t, res, {});
        if (res.lyrics) {
          save(t, res.lyrics);
          found++;
        }
      } else found++;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 429 || e.isNetwork || e.code === 'no_server')) break;
    }
    await new Promise((r) => setTimeout(r, 2200));
  }
  useDeviceMusic.getState().setLyricsBatch(null);
  return { found, total: todo.length };
}
