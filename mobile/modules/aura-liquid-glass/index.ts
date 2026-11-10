import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

export interface LiquidGlassNativeProps extends ViewProps {
  /** dp */
  cornerRadius: number;
  /** Backdrop blur, dp. ~2 = clear liquid glass, ~20 = frosted. */
  blur: number;
  /** Lens strength 0–1 (needs Android 13+). */
  refraction: number;
  /** Chromatic split at the rim, 0–1. */
  dispersion: number;
  /** Specular rim light, 0–1. */
  specular: number;
}

const mod = requireOptionalNativeModule<{ supported: boolean; refraction: boolean }>('AuraLiquidGlass');

/** True on Android 12+ builds that include the module (older APKs, iOS and web: false). */
export const liquidGlassSupported = !!mod?.supported;
/** True on Android 13+: real refraction, dispersion and specular, not just blur. */
export const liquidGlassRefraction = !!mod?.refraction;

let View: ComponentType<LiquidGlassNativeProps> | null = null;
if (liquidGlassSupported) {
  try {
    View = requireNativeView<LiquidGlassNativeProps>('AuraLiquidGlass');
  } catch {
    View = null;
  }
}

export const LiquidGlassNativeView = View;

/** Haze glass (chrisbanes/haze `haze-glass` + Material 3): the lens props plus style and theme. */
export interface HazeGlassNativeProps extends LiquidGlassNativeProps {
  /** Haze's Clear style (liquid) or Regular (more frosted). */
  glassStyle: 'clear' | 'regular';
  dark: boolean;
  /** Material 3 surface colour, #RRGGBB. */
  surfaceColor: string;
}

const haze = requireOptionalNativeModule<{ supported: boolean }>('AuraHazeGlass');

/** True on Android 13+ builds that include Haze. */
export const hazeGlassSupported = !!haze?.supported;

let Haze: ComponentType<HazeGlassNativeProps> | null = null;
if (hazeGlassSupported) {
  try {
    Haze = requireNativeView<HazeGlassNativeProps>('AuraHazeGlass');
  } catch {
    Haze = null;
  }
}

export const HazeGlassNativeView = Haze;
