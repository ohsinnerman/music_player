/**
 * Aura design tokens.
 *
 * Direction: "content-first darkness" (album art is the only real colour,
 * per Spotify) wrapped in Apple-style Liquid Glass chrome. One warm accent,
 * used only for things you can act on. No violet anywhere.
 */
export const colors = {
  bg: '#08080B',
  bgRaised: '#0E0E12',
  surface: '#15151B',
  surfaceHigh: '#1C1C24',
  surfacePressed: '#24242E',

  text: '#F5F5F7',
  textSecondary: 'rgba(245,245,247,0.64)',
  textTertiary: 'rgba(245,245,247,0.40)',
  textQuaternary: 'rgba(245,245,247,0.24)',

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
  scrim: 'rgba(0,0,0,0.55)',
} as const;

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
