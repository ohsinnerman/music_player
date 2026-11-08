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
export function material(level: number, realBlur: boolean): Material {
  'worklet';
  const g = clamp01(level);
  const tint = realBlur ? 0.36 + 0.64 * Math.pow(g, 1.6) : 0.86 + 0.14 * g;
  return {
    tint,
    blur: 0.85 + 0.9 * smooth(0, 0.6, g),
    sheen: Math.min(1, 1.2 * Math.pow(1 - g, 1.4)),
    rim: 1 - 0.55 * g,
    lip: Math.pow(1 - g, 1.2),
    glow: 1 - smooth(0, 0.45, g),
  };
}

/** Below this the BlurView is unmounted entirely (opaque needs no blur, saves GPU). */
export const BLUR_OFF_AT = 0.97;
