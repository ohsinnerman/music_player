import Constants from 'expo-constants';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from '@/lib/storage';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; allowCleartext?: boolean };
export const BUILD_API_URL = (extra.apiUrl ?? '').replace(/\/+$/, '');
export const ALLOW_CLEARTEXT = !!extra.allowCleartext;

export type ThemeMode = 'system' | 'light' | 'dark';

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
  /** Glass material: 0 = liquid glass, 0.5 = frosted, 1 = opaque. Continuous. */
  glass: number;
  setGlass: (v: number) => void;
  /** Animated artwork background in the player. */
  livingBackground: boolean;
  /** Let the server "listen" to a short clip of an imported song to identify it. */
  aiListen: boolean;
  recentSearches: string[];
  themeMode: ThemeMode;
  setThemeMode: (m: ThemeMode) => void;
  setServerUrl: (url: string) => void;
  setOnboarded: (v: boolean) => void;
  toggle: (key: 'haptics' | 'livingBackground' | 'aiListen') => void;
  pushRecentSearch: (q: string) => void;
  clearRecentSearches: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      serverUrl: BUILD_API_URL,
      onboarded: false,
      haptics: true,
      glass: 0,
      setGlass: (v) => set({ glass: Math.min(1, Math.max(0, Math.round(v * 1000) / 1000)) }),
      livingBackground: true,
      aiListen: true,
      recentSearches: [],
      themeMode: 'system',
      setThemeMode: (themeMode) => set({ themeMode }),
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
      version: 2,
      // v1 had an on/off "Reduce transparency"; v2 has the continuous glass material.
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          s.glass = s.reduceTransparency ? 1 : 0;
          delete s.reduceTransparency;
        }
        return s as unknown as SettingsState;
      },
      partialize: ({ serverUrl, onboarded, haptics, glass, livingBackground, aiListen, recentSearches, themeMode }) => ({
        glass,
        aiListen,
        themeMode,
        serverUrl,
        onboarded,
        haptics,
        livingBackground,
        recentSearches,
      }),
    },
  ),
);

export const getServerUrl = () => useSettings.getState().serverUrl || BUILD_API_URL;
