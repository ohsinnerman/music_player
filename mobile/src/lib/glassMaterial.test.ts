import { describe, expect, it } from 'vitest';
import { material, stageOf } from './glassMaterial';

describe('glass material', () => {
  it('is clear and rim-lit at Liquid Glass, solid at Opaque', () => {
    const liquid = material(0, true);
    const opaque = material(1, true);
    expect(liquid.tint).toBeLessThan(0.4);
    expect(liquid.sheen).toBe(1);
    expect(liquid.glow).toBe(1);
    expect(opaque.tint).toBe(1);
    expect(opaque.sheen).toBe(0);
    expect(opaque.lip).toBe(0);
    expect(opaque.glow).toBe(0);
  });

  it('changes monotonically along the slider', () => {
    let prev = material(0, true);
    for (let i = 1; i <= 20; i++) {
      const m = material(i / 20, true);
      expect(m.tint).toBeGreaterThanOrEqual(prev.tint);
      expect(m.sheen).toBeLessThanOrEqual(prev.sheen);
      expect(m.rim).toBeLessThanOrEqual(prev.rim);
      expect(m.blur).toBeGreaterThanOrEqual(prev.blur);
      prev = m;
    }
  });

  it('keeps surfaces legible where the platform cannot blur', () => {
    expect(material(0, false).tint).toBeGreaterThan(0.85);
  });

  it('clamps and names stages', () => {
    expect(material(-1, true)).toEqual(material(0, true));
    expect(material(2, true)).toEqual(material(1, true));
    expect([stageOf(0), stageOf(0.5), stageOf(0.9)]).toEqual(['liquid', 'frosted', 'opaque']);
  });
});
