import { Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';
import type { Lyrics, Track } from '@/api/types';
import { toast } from '@/components/ui/Toast';
import { usePlayer } from '@/player/store';
import { deleteLocalFiles, openSource, saveArtwork, writeLyricsFile } from './files';
import { useDeviceMusic } from './store';
import { looksLikeLrc, lrcToLines, parseFilename, readTags, type TagResult } from './tags';

const AUDIO_EXT = /\.(mp3|flac|m4a|m4b|mp4|aac|ogg|oga|opus|wav|wave|aif|aiff|aifc|3gp|amr|mka|webm)$/i;
const MAX_FILES = 3000;
const MAX_DEPTH = 8;

/** Stable id from the file URI (FNV-1a, two seeds → 64 bits of hex). */
export function localId(uri: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < uri.length; i++) {
    const c = uri.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 15);
  }
  return `local:${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'unknown';

const isAudio = (f: File) => AUDIO_EXT.test(f.name) || (f.type ?? '').startsWith('audio/');

/** Lyrics carried inside the file (USLT / SYLT / LYRICS / ©lyr). */
export function embeddedLyrics(tags: TagResult): Lyrics | null {
  if (tags.syncedLyrics?.length) return { synced: tags.syncedLyrics, plain: null, instrumental: false, source: 'embedded' };
  const text = tags.lyrics?.trim();
  if (!text) return null;
  if (/^\[?instrumental\]?$/i.test(text)) return { synced: null, plain: null, instrumental: true, source: 'embedded' };
  if (looksLikeLrc(text)) {
    const lines = lrcToLines(text);
    if (lines.length) return { synced: lines, plain: null, instrumental: false, source: 'embedded' };
  }
  return text.length >= 20 ? { synced: null, plain: text, instrumental: false, source: 'embedded' } : null;
}

async function toTrack(file: File): Promise<Track | null> {
  const id = localId(file.uri);
  let tags: TagResult = { format: 'unknown' };
  const src = openSource(file);
  try {
    tags = await readTags(src);
  } finally {
    src.close();
  }
  const guess = parseFilename(file.name);
  const title = tags.title ?? guess.title ?? file.name;
  const artist = tags.artist ?? tags.albumArtist ?? guess.artist;
  const cover = tags.picture ? saveArtwork(id, tags.picture) : undefined;

  const lyrics = embeddedLyrics(tags);
  if (lyrics) {
    writeLyricsFile(id, lyrics);
    useDeviceMusic.getState().setIdent(id, { status: 'found', lyricsSource: 'embedded', at: new Date().toISOString() });
  }

  return {
    kind: 'track',
    id,
    title,
    artists: [{ id: `local-artist:${slug(artist ?? 'unknown')}`, name: artist ?? 'Unknown artist' }],
    album: tags.album ? { id: `local-album:${slug(tags.album)}`, title: tags.album } : undefined,
    durationMs: Math.round((tags.durationSec ?? 0) * 1000),
    artwork: cover ? { small: cover, medium: cover, large: cover } : {},
    explicit: false,
    streamKind: 'full',
    provider: 'local',
    genre: tags.genre,
    releaseDate: tags.year,
    local: {
      uri: file.uri,
      fileName: file.name,
      sizeBytes: file.size ?? 0,
      format: tags.format,
      codec: tags.codec,
      bitrateKbps: tags.bitrateKbps,
      sampleRate: tags.sampleRate,
      bitsPerSample: tags.bitsPerSample,
      channels: tags.channels,
      lossless: tags.lossless,
      encoder: tags.encoder,
      vbr: tags.vbr,
      tags: { title: tags.title, artist: tags.artist, album: tags.album, year: tags.year, genre: tags.genre, trackNo: tags.trackNo },
      addedAt: new Date().toISOString(),
    },
  };
}

function collect(d: Directory, out: File[], depth = 0) {
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
  let items: (Directory | File)[] = [];
  try {
    items = d.list();
  } catch {
    return;
  }
  for (const it of items) {
    if (out.length >= MAX_FILES) return;
    if (it instanceof Directory) collect(it, out, depth + 1);
    else if (isAudio(it)) out.push(it);
  }
}

let running = false;

async function importMany(files: File[]): Promise<number> {
  const store = useDeviceMusic.getState();
  const known = new Set(store.tracks.map((t) => t.local?.uri));
  const fresh = files.filter((f) => !known.has(f.uri));
  if (!fresh.length) {
    toast(files.length ? 'Those songs are already in your library' : 'No audio files found there', 'info');
    return 0;
  }
  let added = 0;
  let failed = 0;
  let batch: Track[] = [];
  store.setImporting({ done: 0, total: fresh.length, label: fresh[0]!.name });
  for (let i = 0; i < fresh.length; i++) {
    const f = fresh[i]!;
    try {
      const t = await toTrack(f);
      if (t) batch.push(t);
    } catch {
      failed++;
    }
    if (batch.length >= 25 || i === fresh.length - 1) {
      useDeviceMusic.getState().add(batch);
      added += batch.length;
      batch = [];
    }
    useDeviceMusic.getState().setImporting({ done: i + 1, total: fresh.length, label: fresh[i + 1]?.name ?? f.name });
    // Let the UI breathe between files.
    if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
  }
  useDeviceMusic.getState().setImporting(null);
  toast(`Added ${added} ${added === 1 ? 'song' : 'songs'}${failed ? ` · ${failed} couldn’t be read` : ''}`, added ? 'success' : 'error');
  return added;
}

async function guarded(fn: () => Promise<number>): Promise<number> {
  if (Platform.OS === 'web') {
    toast('Adding songs from your device works in the Android app', 'info');
    return 0;
  }
  if (running) {
    toast('Already adding songs…', 'info');
    return 0;
  }
  running = true;
  try {
    return await fn();
  } catch (e) {
    useDeviceMusic.getState().setImporting(null);
    const msg = e instanceof Error ? e.message : '';
    if (!/cancel/i.test(msg)) toast('Couldn’t open those files', 'error');
    return 0;
  } finally {
    running = false;
  }
}

/** Pick one or more audio files (FLAC, WAV, MP3, M4A, OGG, Opus, AIFF…). */
export function importFiles() {
  return guarded(async () => {
    const res = await File.pickFileAsync({ multipleFiles: true, mimeTypes: ['audio/*'] });
    if (res.canceled) return 0;
    return importMany(res.result.filter(isAudio));
  });
}

/** Pick a folder; every audio file inside it (and its subfolders) is added. */
export function importFolder() {
  return guarded(async () => {
    const d = await Directory.pickDirectoryAsync();
    if (!d) return 0;
    useDeviceMusic.getState().setImporting({ done: 0, total: 0, label: 'Looking for music…' });
    await new Promise((r) => setTimeout(r, 16));
    const files: File[] = [];
    collect(d, files);
    return importMany(files);
  });
}

/** Remove songs from Aura (the files on the phone are left untouched). */
export function removeDeviceTracks(ids: string[]) {
  useDeviceMusic.getState().remove(ids);
  ids.forEach(deleteLocalFiles);
  toast(ids.length === 1 ? 'Removed from Aura · the file is still on your phone' : `Removed ${ids.length} songs from Aura`, 'success');
}

/**
 * Re-read a file's audio properties (format, bit depth, rate, encoder…). Used
 * by the Audio quality sheet so songs imported by older versions get the full
 * details, and so the numbers always describe the file as it is now.
 */
export async function refreshFileInfo(track: Track): Promise<Track> {
  if (!track.local || Platform.OS === 'web') return track;
  const src = openSource(new File(track.local.uri));
  let tags: TagResult;
  try {
    tags = await readTags(src);
  } finally {
    src.close();
  }
  const local = {
    ...track.local,
    format: tags.format,
    codec: tags.codec,
    bitrateKbps: tags.bitrateKbps,
    sampleRate: tags.sampleRate,
    bitsPerSample: tags.bitsPerSample,
    channels: tags.channels,
    lossless: tags.lossless,
    encoder: tags.encoder,
    vbr: tags.vbr,
  };
  const patch: Partial<Track> = { local, durationMs: track.durationMs || Math.round((tags.durationSec ?? 0) * 1000) };
  useDeviceMusic.getState().patchTrack(track.id, patch);
  const q = usePlayer.getState().queue;
  if (q.some((t) => t.id === track.id)) usePlayer.setState({ queue: q.map((t) => (t.id === track.id ? { ...t, ...patch } : t)) });
  return { ...track, ...patch };
}
