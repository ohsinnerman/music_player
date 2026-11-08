import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { useSettings } from '@/settings/store';
import { type ColorTokens, darkColors, lightColors } from './tokens';

const ThemeCtx = createContext<ColorTokens>(darkColors);

export const palettes = { dark: darkColors, light: lightColors } as const;

/** Resolves the user's Appearance setting (system / light / dark) into a palette. */
export function useResolvedScheme(): 'dark' | 'light' {
  const mode = useSettings((s) => s.themeMode);
  const system = useColorScheme();
  if (mode === 'light' || mode === 'dark') return mode;
  return system === 'light' ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useResolvedScheme();
  return <ThemeCtx.Provider value={palettes[scheme]}>{children}</ThemeCtx.Provider>;
}

/** Force a scheme for a subtree (the full-screen player is always dark over its artwork). */
export function ThemeScope({ scheme, children }: { scheme: 'dark' | 'light'; children: ReactNode }) {
  return <ThemeCtx.Provider value={palettes[scheme]}>{children}</ThemeCtx.Provider>;
}

export function useColors(): ColorTokens {
  return useContext(ThemeCtx);
}

/**
 * Theme-aware styles. Define once at module level, call the hook in a component:
 *
 *   const useStyles = makeStyles((c) => ({ box: { backgroundColor: c.surface } }));
 *   const styles = useStyles();
 *
 * Styles are created once per palette and cached.
 */
type StylesInput = Parameters<typeof StyleSheet.create>[0];

export function makeStyles<T extends StylesInput>(factory: (c: ColorTokens) => T & StylesInput) {
  const cache = new WeakMap<ColorTokens, Readonly<T>>();
  return function useStyles(): Readonly<T> {
    const c = useColors();
    return useMemo(() => {
      const hit = cache.get(c);
      if (hit) return hit;
      const created = StyleSheet.create(factory(c)) as Readonly<T>;
      cache.set(c, created);
      return created;
    }, [c]);
  };
}
