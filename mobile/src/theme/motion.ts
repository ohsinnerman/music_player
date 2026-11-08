import { Easing, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';

/** Springs tuned to feel physical but never wobbly. */
export const spring = {
  /** Buttons, toggles: quick and firm. */
  snappy: { damping: 22, stiffness: 320, mass: 0.8 } satisfies WithSpringConfig,
  /** Sheets, the player: confident with a soft landing. */
  sheet: { damping: 28, stiffness: 240, mass: 1, overshootClamping: false } satisfies WithSpringConfig,
  /** Layout morphs (dock collapse, mode switches). */
  smooth: { damping: 30, stiffness: 200, mass: 1 } satisfies WithSpringConfig,
  /** The liquid tab lens: a little stretch and settle. */
  liquid: { damping: 18, stiffness: 260, mass: 0.9 } satisfies WithSpringConfig,
} as const;

export const timing = {
  fast: { duration: 160, easing: Easing.out(Easing.cubic) } satisfies WithTimingConfig,
  base: { duration: 260, easing: Easing.bezier(0.2, 0.8, 0.2, 1) } satisfies WithTimingConfig,
  slow: { duration: 480, easing: Easing.bezier(0.2, 0.8, 0.2, 1) } satisfies WithTimingConfig,
} as const;

/** Scale a pressable goes to while held. */
export const PRESS_SCALE = 0.965;
