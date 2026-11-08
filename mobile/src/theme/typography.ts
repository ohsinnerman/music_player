import type { TextStyle } from 'react-native';

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
} as const;

/**
 * Type scale. A tight grotesk for UI (weight does the hierarchy, as in
 * Spotify), with an editorial serif italic reserved for a few display
 * moments: greetings, chart numerals, the lyrics "beat" dots.
 */
export const type = {
  display: { fontFamily: fonts.serifItalic, fontSize: 44, lineHeight: 48, letterSpacing: -0.5 },
  serifTitle: { fontFamily: fonts.serifItalic, fontSize: 32, lineHeight: 36, letterSpacing: -0.3 },
  largeTitle: { fontFamily: fonts.extrabold, fontSize: 32, lineHeight: 38, letterSpacing: -1 },
  title1: { fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 32, letterSpacing: -0.7 },
  title2: { fontFamily: fonts.bold, fontSize: 21, lineHeight: 27, letterSpacing: -0.45 },
  title3: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, letterSpacing: -0.25 },
  headline: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.15 },
  body: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  callout: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, letterSpacing: -0.05 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 17, letterSpacing: 0 },
  footnote: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.1 },
  label: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, letterSpacing: 1.1, textTransform: 'uppercase' },
  lyric: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 36, letterSpacing: -0.6 },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;
