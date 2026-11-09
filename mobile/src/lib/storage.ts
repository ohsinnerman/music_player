import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import type { PersistStorage, StorageValue } from 'zustand/middleware';

/**
 * Persistence for zustand stores (settings, library, songs on this phone…).
 * Tokens never go here.
 *
 * zustand's default JSON storage stringifies and writes the whole store on
 * every change. With a few thousand imported songs that's ~1–2 MB of JSON per
 * like / lyrics lookup / import batch — visible jank. Here writes are
 * coalesced: we keep the latest state object, and serialise + write it once
 * things go quiet (or immediately when the app goes to the background).
 */

const DELAY_MS = 700;
const pending = new Map<string, StorageValue<unknown>>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!pending.size) return;
  const batch = [...pending.entries()];
  pending.clear();
  const pairs: [string, string][] = [];
  for (const [k, v] of batch) {
    try {
      pairs.push([k, JSON.stringify(v)]);
    } catch {
      /* unserialisable: skip */
    }
  }
  try {
    await AsyncStorage.multiSet(pairs);
  } catch {
    /* storage full / unavailable: keep running */
  }
}

/** Write everything now (used before the app is backgrounded). */
export const flushPersisted = flush;

AppState.addEventListener('change', (s) => {
  if (s !== 'active') void flush();
});

function createLazyStorage<S>(): PersistStorage<S> {
  return {
    async getItem(name) {
      const p = pending.get(name);
      if (p) return p as StorageValue<S>;
      const raw = await AsyncStorage.getItem(name);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StorageValue<S>;
      } catch {
        return null;
      }
    },
    setItem(name, value) {
      pending.set(name, value as StorageValue<unknown>);
      if (!timer) timer = setTimeout(() => void flush(), DELAY_MS);
    },
    async removeItem(name) {
      pending.delete(name);
      await AsyncStorage.removeItem(name);
    },
  };
}

/** Shared lazy storage instance (typed loosely; each store narrows it). */
export const persistStorage: PersistStorage<any> = createLazyStorage();
