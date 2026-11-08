/**
 * Aura design tokens (both colour schemes).
 *
 * Direction: "content-first darkness" (album art is the only real colour,
 * per Spotify) wrapped in Apple-style Liquid Glass chrome. One warm accent,
 * used only for things you can act on. No violet anywhere.
 */
export interface ColorTokens {
  scheme: 'dark' | 'light';
  bg: string;
  bgRaised: string;
  surface: string;
  surfaceHigh: string;
  surfacePressed: string;
  /** Subtle translucent fill for chips, icon buttons, inputs. */
  fill: string;
  fillStrong: string;

  text: string;
  textSecondary: string;
  textTertiary: string;
  textQuaternary: string;
  /** Text drawn on a `text`-coloured surface (inverted chips, the white search bar). */
  textInverse: string;

  stroke: string;
  strokeStrong: string;
  hairlineLight: string;

  accent: string;
  accentPressed: string;
  accentSoft: string;
  onAccent: string;

  success: string;
  danger: string;
  warning: string;

  glassTint: string;
  glassTintSolid: string;
  /** Opaque colour of the glass material; its opacity is driven by the Glass setting. */
  glassBase: string;
  glassBorder: string;
  scrim: string;
  /** expo-blur tint name for this scheme. */
  blurTint: 'systemUltraThinMaterialDark' | 'systemUltraThinMaterialLight';
}

/** Dark: content-first darkness. Album art is the only real colour. */
export const darkColors: ColorTokens = {
  scheme: 'dark',
  bg: '#08080B',
  bgRaised: '#0E0E12',
  surface: '#15151B',
  surfaceHigh: '#1C1C24',
  surfacePressed: '#24242E',
  fill: 'rgba(255,255,255,0.07)',
  fillStrong: 'rgba(255,255,255,0.12)',

  text: '#F5F5F7',
  textSecondary: 'rgba(245,245,247,0.64)',
  textTertiary: 'rgba(245,245,247,0.40)',
  textQuaternary: 'rgba(245,245,247,0.24)',
  textInverse: '#0B0B0F',

  stroke: 'rgba(255,255,255,0.07)',
  strokeStrong: 'rgba(255,255,255,0.14)',
  hairlineLight: 'rgba(255,255,255,0.22)',

  accent: '#FF5A36',
  accentPressed: '#E64A28',
  accentSoft: 'rgba(255,90,54,0.16)',
  onAccent: '#FFFFFF',

  success: '#3DDC97',
  danger: '#FF6B6B',
  warning: '#FFB13B',

  glassTint: 'rgba(22,22,28,0.52)',
  glassTintSolid: 'rgba(22,22,28,0.94)',
  glassBase: '#17171D',
  glassBorder: 'rgba(255,255,255,0.08)',
  scrim: 'rgba(0,0,0,0.55)',
  blurTint: 'systemUltraThinMaterialDark',
};

/** Light: paper-white, ink text, the same ember accent (a touch deeper for contrast on white). */
export const lightColors: ColorTokens = {
  scheme: 'light',
  bg: '#FFFFFF',
  bgRaised: '#F7F7F9',
  surface: '#F1F1F4',
  surfaceHigh: '#E8E8ED',
  surfacePressed: '#DEDEE5',
  fill: 'rgba(10,10,20,0.05)',
  fillStrong: 'rgba(10,10,20,0.09)',

  text: '#0B0B0F',
  textSecondary: 'rgba(11,11,15,0.62)',
  textTertiary: 'rgba(11,11,15,0.44)',
  textQuaternary: 'rgba(11,11,15,0.26)',
  textInverse: '#FFFFFF',

  stroke: 'rgba(10,10,20,0.07)',
  strokeStrong: 'rgba(10,10,20,0.13)',
  hairlineLight: 'rgba(10,10,20,0.18)',

  accent: '#F04824',
  accentPressed: '#D63C1B',
  accentSoft: 'rgba(240,72,36,0.12)',
  onAccent: '#FFFFFF',

  success: '#18A86B',
  danger: '#E5484D',
  warning: '#D98A00',

  glassTint: 'rgba(255,255,255,0.58)',
  glassTintSolid: 'rgba(250,250,252,0.95)',
  glassBase: '#F7F7F9',
  glassBorder: 'rgba(10,10,20,0.08)',
  scrim: 'rgba(0,0,0,0.32)',
  blurTint: 'systemUltraThinMaterialLight',
};

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  xxl: 36,
  pill: 999,
} as const;

/** Page gutter: 20dp reads well on 360–430dp wide phones. */
export const GUTTER = 20;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  float: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
} as const;
