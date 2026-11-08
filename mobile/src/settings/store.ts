import Constants from 'expo-constants';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from '@/lib/storage';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; allowCleartext?: boolean };
export const BUILD_API_URL = (extra.apiUrl ?? '').replace(/\/+$/, '');
export const ALLOW_CLEARTEXT = !!extra.allowCleartext;

export type UrlProblem = 'empty' | 'invalid' | 'insecure' | null;

/** Validate a server URL. Plain http is refused unless the build explicitly allows it (LAN testing). */
export function checkServerUrl(raw: string): { url: string; problem: UrlProblem } {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return { url: '', problem: 'empty' };
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { url: trimmed, problem: 'invalid' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { url: trimmed, problem: 'invalid' };
  if (u.username || u.password) return { url: trimmed, problem: 'invalid' };
  if (u.protocol === 'http:' && !ALLOW_CLEARTEXT) return { url: trimmed, problem: 'insecure' };
  return { url: `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`, problem: null };
}

interface SettingsState {
  serverUrl: string;
  onboarded: boolean;
  haptics: boolean;
  reduceTransparency: boolean;
  /** Animated artwork background in the player. */
  livingBackground: boolean;
  recentSearches: string[];
  setServerUrl: (url: string) => void;
  setOnboarded: (v: boolean) => void;
  toggle: (key: 'haptics' | 'reduceTransparency' | 'livingBackground') => void;
  pushRecentSearch: (q: string) => void;
  clearRecentSearches: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      serverUrl: BUILD_API_URL,
      onboarded: false,
      haptics: true,
      reduceTransparency: false,
      livingBackground: true,
      recentSearches: [],
      setServerUrl: (serverUrl) => set({ serverUrl }),
      setOnboarded: (onboarded) => set({ onboarded }),
      toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<SettingsState>),
      pushRecentSearch: (q) =>
        set((s) => {
          const v = q.trim();
          if (!v) return s;
          return { recentSearches: [v, ...s.recentSearches.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 12) };
        }),
      clearRecentSearches: () => set({ recentSearches: [] }),
    }),
    {
      name: 'aura.settings',
      storage: persistStorage,
      version: 1,
      partialize: ({ serverUrl, onboarded, haptics, reduceTransparency, livingBackground, recentSearches }) => ({
        serverUrl,
        onboarded,
        haptics,
        reduceTransparency,
        livingBackground,
        recentSearches,
      }),
    },
  ),
);

export const getServerUrl = () => useSettings.getState().serverUrl || BUILD_API_URL;
