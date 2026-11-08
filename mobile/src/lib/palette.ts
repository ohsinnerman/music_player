import { useEffect, useState } from 'react';
import { readPixels } from './paletteSource';

/**
 * Extract a palette from album art on-device: decode, draw into a tiny
 * 24×24 surface (Skia on native, <canvas> on web), read the pixels and
 * bucket them. Fast (a few ms) and cached per URL. Drives the player
 * background and detail-page glows.
 */
export interface Palette {
  /** Most common colour. */
  dominant: string;
  /** Most saturated, reasonably bright colour (for accents/glows). */
  vibrant: string;
  /** A deep version of the dominant colour (safe for backgrounds under white text). */
  dark: string;
  /** Light tint for text on dark backgrounds. */
  light: string;
}

export const FALLBACK_PALETTE: Palette = { dominant: '#2A2A35', vibrant: '#FF5A36', dark: '#121218', light: '#E8E8EE' };

const cache = new Map<string, Palette>();
const inflight = new Map<string, Promise<Palette>>();

type RGB = [number, number, number];

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

export function computePalette(pixels: Uint8Array | Float32Array): Palette {
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const a = pixels[i + 3]!;
    if (a < 128) continue;
    const r = pixels[i]!, g = pixels[i + 1]!, b = pixels[i + 2]!;
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  if (!buckets.size) return FALLBACK_PALETTE;

  const groups = [...buckets.values()].map((e) => ({ n: e.n, rgb: [e.r / e.n, e.g / e.n, e.b / e.n] as RGB }));
  groups.sort((a, b) => b.n - a.n);
  const dominant = groups[0]!;
  const [dh, ds, dl] = rgbToHsl(dominant.rgb);

  let best = dominant;
  let bestScore = -1;
  for (const g of groups) {
    const [, s, l] = rgbToHsl(g.rgb);
    if (l < 0.18 || l > 0.85) continue;
    const score = s * 1.6 + (1 - Math.abs(l - 0.55)) + Math.min(g.n / 40, 0.5);
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
  }
  const [vh, vs, vl] = rgbToHsl(best.rgb);

  return {
    dominant: hslToHex(dh, ds, dl),
    vibrant: hslToHex(vh, Math.max(vs, 0.45), Math.min(Math.max(vl, 0.5), 0.66)),
    dark: hslToHex(dh, Math.min(ds, 0.55), Math.min(dl, 0.16) * 0.9 + 0.04),
    light: hslToHex(vh, Math.min(vs, 0.35), 0.9),
  };
}

export async function getPalette(url: string): Promise<Palette> {
  const hit = cache.get(url);
  if (hit) return hit;
  const running = inflight.get(url);
  if (running) return running;
  const p = (async () => {
    try {
      const px = await readPixels(url, 24);
      const palette = px ? computePalette(px) : FALLBACK_PALETTE;
      cache.set(url, palette);
      return palette;
    } catch {
      return FALLBACK_PALETTE;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

export function usePalette(url: string | undefined): Palette {
  const [loaded, setLoaded] = useState<{ url: string; palette: Palette } | null>(null);
  useEffect(() => {
    if (!url || cache.has(url)) return;
    let alive = true;
    getPalette(url).then((palette) => {
      if (alive) setLoaded({ url, palette });
    });
    return () => {
      alive = false;
    };
  }, [url]);
  if (!url) return FALLBACK_PALETTE;
  return cache.get(url) ?? (loaded?.url === url ? loaded.palette : FALLBACK_PALETTE);
}

/** Hex → rgba string. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
