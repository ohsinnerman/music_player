import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { parseIndex, parseParametric, searchIndex } from '../src/services/autoeq.js';
import { type Handler, makeTestApp } from './helpers.js';

const INDEX = `# Index
This is a list of all equalization profiles.

- [Sennheiser HD 600](./oratory1990/over-ear/Sennheiser%20HD%20600) by oratory1990
- [Sennheiser HD 600](./crinacle/GRAS%2043AG-7%20over-ear/Sennheiser%20HD%20600) by crinacle on GRAS 43AG-7
- [Sennheiser HD 650](./oratory1990/over-ear/Sennheiser%20HD%20650) by oratory1990
- [1MORE Aero (ANC Off)](./HypetheSonics/GRAS%20RA0045%20in-ear/1MORE%20Aero%20(ANC%20Off)) by HypetheSonics on GRAS RA0045
- [Apple AirPods Pro 2](./crinacle/711%20in-ear/Apple%20AirPods%20Pro%202) by crinacle on 711
`;

const HD600 = `Preamp: -6.3 dB
Filter 1: ON LSC Fc 105 Hz Gain 6.5 dB Q 0.70
Filter 2: ON PK Fc 125 Hz Gain -2.7 dB Q 0.55
Filter 3: ON PK Fc 8445 Hz Gain 3.3 dB Q 1.61
Filter 6: ON HSC Fc 10000 Hz Gain -3.1 dB Q 0.70
Filter 7: OFF PK Fc 3158 Hz Gain -1.8 dB Q 3.67
`;

const github: Handler = (u) => {
  if (u.hostname !== 'raw.githubusercontent.com') return undefined;
  if (u.pathname === '/jaakkopasanen/AutoEq/master/results/INDEX.md') return { body: INDEX };
  if (decodeURIComponent(u.pathname) === '/jaakkopasanen/AutoEq/master/results/oratory1990/over-ear/Sennheiser HD 600/Sennheiser HD 600 ParametricEQ.txt') return { body: HD600 };
  return { status: 404, body: '404: Not Found' };
};

describe('AutoEq parsing', () => {
  it('reads the index, including names with parentheses and rigs', () => {
    const e = parseIndex(INDEX);
    expect(e).toHaveLength(5);
    expect(e[1]).toEqual({ name: 'Sennheiser HD 600', source: 'crinacle', rig: 'GRAS 43AG-7', path: 'crinacle/GRAS 43AG-7 over-ear/Sennheiser HD 600' });
    expect(e[3]!.path).toBe('HypetheSonics/GRAS RA0045 in-ear/1MORE Aero (ANC Off)');
  });

  it('reads parametric filters and skips disabled ones', () => {
    const p = parseParametric(HD600);
    expect(p.preampDb).toBe(-6.3);
    expect(p.filters).toEqual([
      { type: 'LSC', fc: 105, gainDb: 6.5, q: 0.7 },
      { type: 'PK', fc: 125, gainDb: -2.7, q: 0.55 },
      { type: 'PK', fc: 8445, gainDb: 3.3, q: 1.61 },
      { type: 'HSC', fc: 10000, gainDb: -3.1, q: 0.7 },
    ]);
  });

  it('searches loosely and prefers oratory1990', () => {
    const e = parseIndex(INDEX);
    expect(searchIndex(e, 'hd600').map((x) => x.source)).toEqual(['oratory1990', 'crinacle']);
    expect(searchIndex(e, 'airpods pro')[0]!.name).toBe('Apple AirPods Pro 2');
    expect(searchIndex(e, 'zzz')).toEqual([]);
  });
});

describe('GET /v1/eq/*', () => {
  it('searches and returns a profile', async () => {
    const { app } = makeTestApp({}, [github]);
    const s = await request(app).get('/v1/eq/search').query({ q: 'HD 600' }).expect(200);
    expect(s.body.data[0]).toMatchObject({ name: 'Sennheiser HD 600', source: 'oratory1990' });
    const p = await request(app).get('/v1/eq/profile').query({ path: s.body.data[0].path }).expect(200);
    expect(p.body.data).toMatchObject({ name: 'Sennheiser HD 600', preampDb: -6.3 });
    expect(p.body.data.filters).toHaveLength(4);
  });

  it('refuses paths that are not in the index', async () => {
    const { app, calls } = makeTestApp({}, [github]);
    await request(app).get('/v1/eq/profile').query({ path: '../../etc/passwd' }).expect(400);
    await request(app).get('/v1/eq/profile').query({ path: 'someone/else/File' }).expect(400);
    expect(calls.some((c) => c.includes('etc'))).toBe(false);
  });
});
