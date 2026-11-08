import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type AudioPlaylist,
  type AudioPlaylistStatus,
  createAudioPlaylist,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { Platform } from 'react-native';
import { playUrl } from '@/api/client';
import type { PlayContext, Track } from '@/api/types';
import { toast } from '@/components/ui/Toast';
import { recordPlay } from '@/library/hooks';
import { type RepeatMode, clock, usePlayer, useProgress } from './store';

/**
 * The player engine: a thin, careful wrapper around expo-audio's native
 * AudioPlaylist (ExoPlayer on Android). The native playlist is the source of
 * truth for what's playing; the zustand store mirrors it 1:1 for the UI.
 *
 * Each source is the backend's stable /play URL, which 302s to a freshly
 * signed stream, so queued tracks never fail on expired links.
 */

const MAX_QUEUE = 200;
const PERSIST_KEY = 'aura.queue.v1';

let pl: AudioPlaylist | null = null;
let lockScreenActive = false;
let askedNotifications = false;
let resumeAt: number | null = null;
let lastRecorded: string | null = null;
let lastErrorIndex = -1;
let lastMetaId: string | null = null;
/** While rebuilding the native queue, ignore index events until this index shows up. */
let pending: { index: number; until: number } | null = null;

const source = (t: Track) => ({ uri: playUrl(t.id), name: t.title });

function metadata(t: Track) {
  return {
    title: t.title,
    artist: t.artists.map((a) => a.name).join(', '),
    albumTitle: t.album?.title,
    artworkUrl: t.artwork.large ?? t.artwork.medium ?? t.artwork.small,
  };
}

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function onIndex(index: number) {
  if (pending) {
    if (index !== pending.index && Date.now() < pending.until) return;
    pending = null;
  }
  const s = usePlayer.getState();
  if (index < 0 || index >= s.queue.length) return;
  if (index !== s.index) usePlayer.setState({ index });
  const t = s.queue[index]!;
  // Status events arrive ~4×/s; only react when the track actually changed.
  if (lastMetaId === t.id) return;
  if (sleepAtEndOfTrack && lastMetaId !== null) {
    sleepAtEndOfTrack = false;
    pl?.pause();
    usePlayer.setState({ sleepAt: null });
    toast('Sleep timer: paused', 'info');
  }
  lastMetaId = t.id;
  if (lockScreenActive) pl?.updateLockScreenMetadata(metadata(t));
  if (lastRecorded !== t.id) {
    lastRecorded = t.id;
    recordPlay(t);
  }
  persistSoon();
}

function onStatus(st: AudioPlaylistStatus & { error?: { message?: string } | string }) {
  const now = Date.now();
  clock.base.value = st.currentTime;
  clock.at.value = now;
  clock.playing.value = st.playing;
  if (st.duration > 0) clock.duration.value = st.duration;
  // The frame clock only runs while playing; keep the paused position exact.
  if (!st.playing && !clock.scrubbing.value) clock.position.value = st.currentTime;
  useProgress.setState({ position: st.currentTime, duration: st.duration > 0 ? st.duration : useProgress.getState().duration });

  const s = usePlayer.getState();
  if (s.isPlaying !== st.playing || s.isBuffering !== st.isBuffering) {
    usePlayer.setState({ isPlaying: st.playing, isBuffering: st.isBuffering });
    if (!st.playing) persistSoon();
  }
  if (typeof st.currentIndex === 'number') onIndex(st.currentIndex);

  if (st.error) {
    const { index, queue } = usePlayer.getState();
    if (lastErrorIndex === index) return;
    lastErrorIndex = index;
    toast(index < queue.length - 1 ? 'Couldn’t play this song — skipping' : 'Couldn’t play this song', 'error');
    if (index < queue.length - 1) pl?.next();
  } else if (st.playing) {
    lastErrorIndex = -1;
  }
}

function ensure(): AudioPlaylist {
  if (pl) return pl;
  pl = createAudioPlaylist({ sources: [], loop: 'none', updateInterval: 250 });
  pl.addListener('playlistStatusUpdate', onStatus as (s: AudioPlaylistStatus) => void);
  pl.addListener('trackChanged', ({ currentIndex }) => onIndex(currentIndex));
  return pl;
}

let audioModeSet = false;
async function prepareSession() {
  if (!audioModeSet) {
    audioModeSet = true;
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch(() => undefined);
  }
  if (Platform.OS === 'android' && !askedNotifications) {
    askedNotifications = true;
    // Android 13+: needed to show the media notification with controls.
    requestNotificationPermissionsAsync().catch(() => undefined);
  }
}

function activateLockScreen(t: Track) {
  const p = ensure();
  lastMetaId = t.id;
  if (!lockScreenActive) {
    p.setActiveForLockScreen(true, metadata(t), { showNextTrack: true, showPreviousTrack: true });
    lockScreenActive = true;
  } else {
    p.updateLockScreenMetadata(metadata(t));
  }
}

function loadNative(queue: Track[], index: number) {
  const p = ensure();
  pending = { index, until: Date.now() + 1500 };
  p.clear();
  for (const t of queue) p.add(source(t));
  if (index > 0) p.skipTo(index);
}

/* ───────────────────────── Public API ───────────────────────── */

export const player = {
  /** Replace the queue and start playing. */
  async playQueue(tracks: Track[], startIndex = 0, context: PlayContext | null = null, opts: { shuffle?: boolean } = {}) {
    if (!tracks.length) return;
    let queue = tracks.slice(0, MAX_QUEUE);
    let index = Math.min(Math.max(0, startIndex), queue.length - 1);
    const shuffle = opts.shuffle ?? usePlayer.getState().shuffle;
    let original: Track[] | null = null;
    if (shuffle) {
      original = queue;
      const first = opts.shuffle && startIndex === 0 ? queue[Math.floor(Math.random() * queue.length)]! : queue[index]!;
      queue = [first, ...shuffled(queue.filter((t) => t.id !== first.id))];
      index = 0;
    }
    try {
      await prepareSession();
      resumeAt = null;
      usePlayer.setState({ queue, original, index, context, shuffle, isBuffering: true });
      clock.base.value = 0;
      clock.position.value = 0;
      clock.at.value = Date.now();
      useProgress.setState({ position: 0, duration: queue[index]!.durationMs / 1000 });
      clock.duration.value = queue[index]!.durationMs / 1000;
      loadNative(queue, index);
      activateLockScreen(queue[index]!);
      ensure().play();
      onIndex(index);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Playback failed', 'error');
    }
  },

  /** Play a single track; continue with radio-style suggestions if given. */
  playTrack(track: Track, context: PlayContext | null = null, rest: Track[] = []) {
    return player.playQueue([track, ...rest.filter((t) => t.id !== track.id)], 0, context, { shuffle: false });
  },

  play() {
    const s = usePlayer.getState();
    if (s.index < 0) return;
    void prepareSession();
    const p = ensure();
    activateLockScreen(s.queue[s.index]!);
    // Finished the last song (repeat off)? Pressing play starts it again.
    const { position, duration } = useProgress.getState();
    if (resumeAt === null && duration > 0 && position >= duration - 0.75) {
      void player.seek(0);
    }
    p.play();
    if (resumeAt !== null) {
      const at = resumeAt;
      resumeAt = null;
      setTimeout(() => p.seekTo(at).catch(() => undefined), 350);
    }
  },
  pause() {
    pl?.pause();
  },
  toggle() {
    if (usePlayer.getState().isPlaying) player.pause();
    else player.play();
  },

  next() {
    const { index, queue, repeat } = usePlayer.getState();
    if (index < queue.length - 1) ensure().next();
    else if (repeat === 'all' && queue.length) player.skipTo(0);
  },
  previous() {
    const p = ensure();
    const { index } = usePlayer.getState();
    if (useProgress.getState().position > 3 || index === 0) void p.seekTo(0);
    else p.previous();
  },
  skipTo(i: number) {
    const { queue } = usePlayer.getState();
    if (i < 0 || i >= queue.length) return;
    pending = { index: i, until: Date.now() + 1200 };
    ensure().skipTo(i);
    usePlayer.setState({ index: i });
    onIndex(i);
    if (!usePlayer.getState().isPlaying) player.play();
  },
  async seek(seconds: number) {
    const s = Math.max(0, seconds);
    clock.base.value = s;
    clock.position.value = s;
    clock.at.value = Date.now();
    useProgress.setState({ position: s });
    await ensure().seekTo(s).catch(() => undefined);
  },

  playNext(track: Track) {
    const s = usePlayer.getState();
    if (s.index < 0) return player.playQueue([track]);
    const at = s.index + 1;
    const queue = [...s.queue.slice(0, at), track, ...s.queue.slice(at)];
    usePlayer.setState({ queue, original: s.original ? [...s.original, track] : null });
    ensure().insert(source(track), at);
    toast('Playing next', 'success');
  },
  addToQueue(tracks: Track | Track[]) {
    const list = Array.isArray(tracks) ? tracks : [tracks];
    const s = usePlayer.getState();
    if (s.index < 0) return player.playQueue(list);
    const room = MAX_QUEUE - s.queue.length;
    const add = list.slice(0, Math.max(0, room));
    if (!add.length) return toast('Your queue is full', 'error');
    usePlayer.setState({ queue: [...s.queue, ...add], original: s.original ? [...s.original, ...add] : null });
    const p = ensure();
    for (const t of add) p.add(source(t));
    toast(add.length === 1 ? 'Added to queue' : `Added ${add.length} songs to queue`, 'success');
  },
  removeAt(i: number) {
    const s = usePlayer.getState();
    if (i === s.index || i < 0 || i >= s.queue.length) return;
    const removed = s.queue[i]!;
    const queue = s.queue.filter((_, k) => k !== i);
    const index = i < s.index ? s.index - 1 : s.index;
    pending = { index, until: Date.now() + 800 };
    usePlayer.setState({ queue, index, original: s.original?.filter((t) => t.id !== removed.id) ?? null });
    ensure().remove(i);
    persistSoon();
  },
  /** Move an upcoming track to play right after the current one. */
  moveToNext(i: number) {
    const s = usePlayer.getState();
    if (i <= s.index + 1 || i >= s.queue.length) return;
    const t = s.queue[i]!;
    const queue = s.queue.slice();
    queue.splice(i, 1);
    queue.splice(s.index + 1, 0, t);
    usePlayer.setState({ queue });
    const p = ensure();
    p.remove(i);
    p.insert(source(t), s.index + 1);
  },
  clearUpNext() {
    const s = usePlayer.getState();
    const p = ensure();
    for (let i = s.queue.length - 1; i > s.index; i--) p.remove(i);
    usePlayer.setState({ queue: s.queue.slice(0, s.index + 1), original: null, shuffle: false });
  },

  toggleShuffle() {
    const s = usePlayer.getState();
    if (s.index < 0) return usePlayer.setState({ shuffle: !s.shuffle });
    const current = s.queue[s.index]!;
    const p = ensure();
    // Keep the current track playing; rebuild everything around it.
    for (let i = s.queue.length - 1; i > s.index; i--) p.remove(i);
    for (let i = s.index - 1; i >= 0; i--) p.remove(i);
    if (!s.shuffle) {
      const rest = shuffled(s.queue.filter((_, k) => k !== s.index));
      for (const t of rest) p.add(source(t));
      pending = { index: 0, until: Date.now() + 1000 };
      usePlayer.setState({ shuffle: true, original: s.queue, queue: [current, ...rest], index: 0 });
    } else {
      const orig = s.original ?? s.queue;
      const pos = Math.max(0, orig.findIndex((t) => t.id === current.id));
      orig.slice(0, pos).forEach((t, k) => p.insert(source(t), k));
      orig.slice(pos + 1).forEach((t) => p.add(source(t)));
      pending = { index: pos, until: Date.now() + 1000 };
      usePlayer.setState({ shuffle: false, original: null, queue: orig, index: pos });
    }
    persistSoon();
  },
  cycleRepeat() {
    const order: RepeatMode[] = ['off', 'all', 'one'];
    const next = order[(order.indexOf(usePlayer.getState().repeat) + 1) % order.length]!;
    usePlayer.setState({ repeat: next });
    ensure().loop = next === 'off' ? 'none' : next === 'all' ? 'all' : 'single';
    persistSoon();
  },

  stop() {
    pl?.pause();
    pl?.clear();
    if (lockScreenActive) pl?.clearLockScreenControls();
    lockScreenActive = false;
    usePlayer.setState({ queue: [], original: null, index: -1, context: null, isPlaying: false });
    AsyncStorage.removeItem(PERSIST_KEY).catch(() => undefined);
  },

  /** Restore last session (paused) on launch. */
  async restore() {
    try {
      const raw = await AsyncStorage.getItem(PERSIST_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        queue: Track[];
        original: Track[] | null;
        index: number;
        position: number;
        context: PlayContext | null;
        repeat: RepeatMode;
        shuffle: boolean;
      };
      if (!saved.queue?.length || saved.index < 0 || saved.index >= saved.queue.length) return;
      usePlayer.setState({
        queue: saved.queue,
        original: saved.original,
        index: saved.index,
        context: saved.context,
        repeat: saved.repeat ?? 'off',
        shuffle: !!saved.shuffle,
        isPlaying: false,
      });
      lastRecorded = saved.queue[saved.index]!.id;
      resumeAt = saved.position > 5 ? saved.position : null;
      const d = saved.queue[saved.index]!.durationMs / 1000;
      clock.base.value = saved.position;
      clock.position.value = saved.position;
      clock.duration.value = d;
      useProgress.setState({ position: saved.position, duration: d });
      loadNative(saved.queue, saved.index);
      if (saved.repeat && saved.repeat !== 'off') ensure().loop = saved.repeat === 'all' ? 'all' : 'single';
    } catch {
      /* corrupted or server not configured: start fresh */
    }
  },
};

/* ───────────────────────── Sleep timer ───────────────────────── */

let sleepTimer: ReturnType<typeof setTimeout> | null = null;
let sleepAtEndOfTrack = false;

/** Pause after `minutes`, at the end of the current song ('track'), or cancel (null). */
export function setSleepTimer(value: number | 'track' | null) {
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = null;
  sleepAtEndOfTrack = value === 'track';
  usePlayer.setState({ sleepAt: typeof value === 'number' ? Date.now() + value * 60_000 : value === 'track' ? -1 : null });
  if (typeof value === 'number') {
    sleepTimer = setTimeout(() => {
      player.pause();
      usePlayer.setState({ sleepAt: null });
      toast('Sleep timer: paused', 'info');
    }, value * 60_000);
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistSoon() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const s = usePlayer.getState();
    if (s.index < 0) return;
    const data = {
      queue: s.queue,
      original: s.original,
      index: s.index,
      position: useProgress.getState().position,
      context: s.context,
      repeat: s.repeat,
      shuffle: s.shuffle,
    };
    AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(data)).catch(() => undefined);
  }, 1500);
}
