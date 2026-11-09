import { describe, expect, it } from 'vitest';
import { autoPreamp, bandsToFilters, chain, PRESETS, responseDb } from './eq';

describe('EQ maths', () => {
  it('peaking, shelves hit their targets (matches Dsp.kt)', () => {
    expect(responseDb([{ type: 'PK', fc: 1000, gainDb: 6, q: 1.41 }], 1000)).toBeCloseTo(6, 2);
    expect(Math.abs(responseDb([{ type: 'PK', fc: 1000, gainDb: 6, q: 1.41 }], 20))).toBeLessThan(0.05);
    expect(responseDb([{ type: 'LSC', fc: 105, gainDb: 6.5, q: 0.7 }], 10)).toBeCloseTo(6.5, 1);
    expect(Math.abs(responseDb([{ type: 'LSC', fc: 105, gainDb: 6.5, q: 0.7 }], 10000))).toBeLessThan(0.05);
    expect(responseDb([{ type: 'HSC', fc: 10000, gainDb: -3.1, q: 0.7 }], 20000)).toBeLessThan(-2.5);
  });

  it('flat bands make no filters; auto preamp offsets the biggest boost', () => {
    expect(bandsToFilters(PRESETS[0]!.bands)).toEqual([]);
    const bass = bandsToFilters(PRESETS.find((p) => p.id === 'bass')!.bands);
    expect(bass).toHaveLength(4);
    const pre = autoPreamp(bass);
    expect(pre).toBeLessThan(-6);
    expect(pre).toBeGreaterThan(-10);
    expect(autoPreamp([{ type: 'PK', fc: 1000, gainDb: -6, q: 1 }])).toBeCloseTo(0, 5);
  });

  it('combines a headphone profile with the bands', () => {
    const hp = { name: 'X', source: 'oratory1990', path: 'a/b/X', preampDb: -6, filters: [{ type: 'LSC' as const, fc: 105, gainDb: 6.5, q: 0.7 }] };
    expect(chain([3, 0, 0, 0, 0, 0, 0, 0, 0, 0], hp)).toHaveLength(2);
  });
});
