/**
 * Glass material model (pure, unit-tested). 0 = Liquid Glass, 0.5 = Frosted, 1 = Opaque.
 * Every function is a worklet so animated styles can call it on the UI thread.
 */

export type GlassStage = 'liquid' | 'frosted' | 'opaque';

export const GLASS_STAGES: { key: GlassStage; at: number; label: string; blurb: string }[] = [
  { key: 'liquid', at: 0, label: 'Liquid Glass', blurb: 'Clear, rim-lit glass. Colour and shapes flow through the chrome.' },
  { key: 'frosted', at: 0.5, label: 'Frosted', blurb: 'Heavier blur and a softer tint. Calmer, still see-through.' },
  { key: 'opaque', at: 1, label: 'Opaque', blurb: 'Solid surfaces, no blur. Maximum contrast and the lightest on battery.' },
];

export function stageOf(v: number): GlassStage {
  'worklet';
  return v < 0.25 ? 'liquid' : v < 0.75 ? 'frosted' : 'opaque';
}

const clamp01 = (x: number) => {
  'worklet';
  return Math.min(1, Math.max(0, x));
};
const smooth = (a: number, b: number, x: number) => {
  'worklet';
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export interface Material {
  /** Opacity of the solid glass colour laid over the blur. */
  tint: number;
  /** Multiplier for the blur intensity (frosted blurs more). */
  blur: number;
  /** Top specular sheen. */
  sheen: number;
  /** Edge rim (border) strength. */
  rim: number;
  /** Bright 1px lip along the top edge. */
  lip: number;
  /** Soft light bouncing off the bottom edge — the "liquid" refraction glow. */
  glow: number;
}

/**
 * The material at a given level. `realBlur` = false when the platform can't
 * blur this surface (Android inline glass, or over the full player): the tint
 * then has to carry legibility on its own.
 */
export function material(level: number, realBlur: boolean, lensed = false): Material {
  'worklet';
  const g = clamp01(level);
  // With the native lens (Android 13+ AGSL / real glass), Liquid Glass is genuinely clear:
  // the refraction and specular rim do the work, so the tint can almost vanish.
  const tint = lensed ? 0.08 + 0.92 * Math.pow(g, 1.7) : realBlur ? 0.36 + 0.64 * Math.pow(g, 1.6) : 0.86 + 0.14 * g;
  const sheen = Math.min(1, 1.2 * Math.pow(1 - g, 1.4));
  return {
    tint,
    blur: 0.85 + 0.9 * smooth(0, 0.6, g),
    // The shader already lights the rim; keep the drawn sheen subtler so it doesn't double up.
    sheen: lensed ? sheen * 0.55 : sheen,
    rim: 1 - 0.55 * g,
    lip: Math.pow(1 - g, 1.2),
    glow: lensed ? 0.6 * (1 - smooth(0, 0.45, g)) : 1 - smooth(0, 0.45, g),
  };
}

export interface Lens {
  /** Backdrop blur in dp. */
  blur: number;
  /** Edge refraction 0–1. */
  refraction: number;
  /** Chromatic split 0–1. */
  dispersion: number;
  /** Specular rim 0–1. */
  specular: number;
}

/**
 * Parameters for the native lens at a level. Liquid Glass: barely blurred, strong
 * bending, colour fringing and bright rims (iOS 26 "clear"). Frosted: heavy blur,
 * gentle bending. `intensity` is the surface's own blur weight (dock 45, sheet 70…).
 */
export function lens(level: number, intensity = 45): Lens {
  'worklet';
  const g = clamp01(level);
  const weight = Math.min(1.6, Math.max(0.5, intensity / 45));
  return {
    blur: Math.round((1.5 + 22 * smooth(0, 0.75, g)) * weight * 10) / 10,
    refraction: Math.round((1 - smooth(0.05, 0.85, g)) * 100) / 100,
    dispersion: Math.round(0.45 * (1 - smooth(0, 0.4, g)) * 100) / 100,
    specular: Math.round((1 - 0.7 * smooth(0, 0.8, g)) * 100) / 100,
  };
}

/** Below this the BlurView is unmounted entirely (opaque needs no blur, saves GPU). */
export const BLUR_OFF_AT = 0.97;
