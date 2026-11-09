import type { TtlCache } from '../lib/cache.js';
import { badRequest, notFound, upstreamError } from '../lib/errors.js';
import type { HttpClient } from '../lib/http.js';

/**
 * Headphone EQ presets from AutoEq (github.com/jaakkopasanen/AutoEq, MIT):
 * ~8 800 measured headphones / IEMs, each with a parametric EQ that corrects
 * it to a neutral target. We read the published index + ParametricEQ.txt files
 * from GitHub and hand the phone plain numbers; the phone does the filtering.
 */

export interface EqFilter {
  /** PK = peaking, LSC = low shelf, HSC = high shelf. */
  type: 'PK' | 'LSC' | 'HSC';
  fc: number;
  gainDb: number;
  q: number;
}

export interface EqProfile {
  name: string;
  source: string;
  rig?: string;
  path: string;
  preampDb: number;
  filters: EqFilter[];
}

export interface EqEntry {
  name: string;
  source: string;
  rig?: string;
  /** Path under results/, e.g. "oratory1990/over-ear/Sennheiser HD 600". */
  path: string;
}

const LINE = /^- \[(.+?)\]\(\.\/(.+?)\) by (.+?)(?: on (.+))?$/;

/** Parse results/INDEX.md. */
export function parseIndex(md: string): EqEntry[] {
  const out: EqEntry[] = [];
  for (const raw of md.split(/\r?\n/)) {
    const m = LINE.exec(raw.trim());
    if (!m) continue;
    let path: string;
    try {
      path = decodeURIComponent(m[2]!);
    } catch {
      continue;
    }
    out.push({ name: m[1]!, path, source: m[3]!.trim(), rig: m[4]?.trim() || undefined });
  }
  return out;
}

/** Parse a ParametricEQ.txt ("Preamp: -6.3 dB" / "Filter 1: ON PK Fc 125 Hz Gain -2.7 dB Q 0.55"). */
export function parseParametric(text: string): { preampDb: number; filters: EqFilter[] } {
  let preampDb = 0;
  const filters: EqFilter[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const p = /^Preamp:\s*(-?\d+(?:\.\d+)?)\s*dB/i.exec(line);
    if (p) {
      preampDb = Number(p[1]);
      continue;
    }
    const f = /^Filter\s+\d+:\s*ON\s+(PK|LSC|HSC|LS|HS|LSQ|HSQ)\s+Fc\s+(\d+(?:\.\d+)?)\s*Hz\s+Gain\s+(-?\d+(?:\.\d+)?)\s*dB(?:\s+Q\s+(\d+(?:\.\d+)?))?/i.exec(line);
    if (!f) continue;
    const t = f[1]!.toUpperCase();
    const type: EqFilter['type'] = t.startsWith('L') ? 'LSC' : t.startsWith('H') ? 'HSC' : 'PK';
    const fc = Number(f[2]);
    const gainDb = Number(f[3]);
    const q = f[4] ? Number(f[4]) : 0.707;
    if (!(fc >= 10 && fc <= 24000) || !(Math.abs(gainDb) <= 30) || !(q > 0 && q <= 30)) continue;
    filters.push({ type, fc, gainDb, q });
  }
  return { preampDb: Math.max(-30, Math.min(0, preampDb)), filters: filters.slice(0, 20) };
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '');

export function searchIndex(entries: EqEntry[], q: string, limit = 25): EqEntry[] {
  const needle = fold(q);
  if (!needle) return [];
  const words = q.toLowerCase().split(/\s+/).map(fold).filter(Boolean);
  const scored: { e: EqEntry; s: number }[] = [];
  for (const e of entries) {
    const hay = fold(e.name);
    let s = -1;
    if (hay === needle) s = 0;
    else if (hay.startsWith(needle)) s = 1;
    else if (hay.includes(needle)) s = 2;
    else if (words.length > 1 && words.every((w) => hay.includes(w))) s = 3;
    if (s < 0) continue;
    // Prefer oratory1990 (most trusted measurements), then shorter names.
    scored.push({ e, s: s * 10 + (e.source === 'oratory1990' ? 0 : e.source === 'crinacle' ? 1 : 2) });
  }
  scored.sort((a, b) => a.s - b.s || a.e.name.length - b.e.name.length);
  return scored.slice(0, limit).map((x) => x.e);
}

export type AutoEqService = ReturnType<typeof createAutoEqService>;

export function createAutoEqService(http: HttpClient, base: string, cache: TtlCache) {
  const root = base.replace(/\/$/, '');

  async function text(url: string): Promise<string> {
    const res = await http.request(url, { headers: { Accept: 'text/plain' } });
    if (res.status === 404) throw notFound('Preset not found');
    if (!res.ok) throw upstreamError();
    return res.text();
  }

  const index = () => cache.wrap('autoeq:index', 12 * 3600_000, async () => parseIndex(await text(`${root}/results/INDEX.md`)));

  return {
    async search(q: string): Promise<EqEntry[]> {
      return searchIndex(await index(), q);
    },
    async profile(path: string): Promise<EqProfile> {
      // Only paths that are in the published index (no arbitrary repo reads).
      const entry = (await index()).find((e) => e.path === path);
      if (!entry) throw badRequest('Unknown preset');
      return cache.wrap(`autoeq:p:${path}`, 24 * 3600_000, async () => {
        const name = path.split('/').pop()!;
        const url = `${root}/results/${path.split('/').map(encodeURIComponent).join('/')}/${encodeURIComponent(`${name} ParametricEQ.txt`)}`;
        const parsed = parseParametric(await text(url));
        if (!parsed.filters.length) throw notFound('Preset has no parametric EQ');
        return { ...entry, ...parsed };
      });
    },
  };
}
