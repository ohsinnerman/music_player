/**
 * Tiny byte helpers for the tag readers. No TextDecoder / Buffer: Hermes
 * doesn't ship every encoding, so we decode Latin-1, UTF-8 and UTF-16 by hand.
 */

export const u16be = (b: Uint8Array, o: number) => ((b[o]! << 8) | b[o + 1]!) >>> 0;
export const u16le = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8)) >>> 0;
export const u24be = (b: Uint8Array, o: number) => ((b[o]! << 16) | (b[o + 1]! << 8) | b[o + 2]!) >>> 0;
export const u32be = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
export const u32le = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
export const u64be = (b: Uint8Array, o: number) => u32be(b, o) * 2 ** 32 + u32be(b, o + 4);
export const u64le = (b: Uint8Array, o: number) => u32le(b, o + 4) * 2 ** 32 + u32le(b, o);
/** ID3v2 "syncsafe" integer: 4 bytes, 7 bits each. */
export const syncsafe = (b: Uint8Array, o: number) => ((b[o]! & 0x7f) << 21) | ((b[o + 1]! & 0x7f) << 14) | ((b[o + 2]! & 0x7f) << 7) | (b[o + 3]! & 0x7f);

export function ascii(b: Uint8Array, o: number, n: number): string {
  let s = '';
  for (let i = o; i < o + n && i < b.length; i++) s += String.fromCharCode(b[i]!);
  return s;
}

export function latin1(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 4096) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 4096)));
  return s;
}

export function utf8(b: Uint8Array): string {
  const out: number[] = [];
  let i = 0;
  // Skip a UTF-8 BOM.
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) i = 3;
  while (i < b.length) {
    const c = b[i++]!;
    if (c < 0x80) out.push(c);
    else if (c >= 0xc2 && c < 0xe0 && i < b.length && (b[i]! & 0xc0) === 0x80) out.push(((c & 0x1f) << 6) | (b[i++]! & 0x3f));
    else if (c >= 0xe0 && c < 0xf0 && i + 1 < b.length && (b[i]! & 0xc0) === 0x80 && (b[i + 1]! & 0xc0) === 0x80) {
      out.push(((c & 0x0f) << 12) | ((b[i]! & 0x3f) << 6) | (b[i + 1]! & 0x3f));
      i += 2;
    } else if (c >= 0xf0 && c < 0xf5 && i + 2 < b.length && (b[i]! & 0xc0) === 0x80) {
      const cp = ((c & 0x07) << 18) | ((b[i]! & 0x3f) << 12) | ((b[i + 1]! & 0x3f) << 6) | (b[i + 2]! & 0x3f);
      i += 3;
      const v = cp - 0x10000;
      out.push(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
    } else out.push(0xfffd);
  }
  let s = '';
  for (let k = 0; k < out.length; k += 4096) s += String.fromCharCode.apply(null, out.slice(k, k + 4096));
  return s;
}

export function utf16(b: Uint8Array, littleEndian?: boolean): string {
  let le = littleEndian ?? true;
  let i = 0;
  if (b[0] === 0xff && b[1] === 0xfe) {
    le = true;
    i = 2;
  } else if (b[0] === 0xfe && b[1] === 0xff) {
    le = false;
    i = 2;
  }
  const units: number[] = [];
  for (; i + 1 < b.length; i += 2) units.push(le ? b[i]! | (b[i + 1]! << 8) : (b[i]! << 8) | b[i + 1]!);
  let s = '';
  for (let k = 0; k < units.length; k += 4096) s += String.fromCharCode.apply(null, units.slice(k, k + 4096));
  return s;
}

/** Strip NULs and surrounding whitespace that tag writers love to leave behind. */
export const clean = (s: string | undefined): string | undefined => {
  if (s === undefined) return undefined;
  const t = s.replace(/\u0000+$/g, '').replace(/\u0000/g, ' ').trim();
  return t || undefined;
};

export function indexOf(b: Uint8Array, pattern: number[], from = 0, to = b.length): number {
  const last = Math.min(to, b.length) - pattern.length;
  outer: for (let i = from; i <= last; i++) {
    for (let k = 0; k < pattern.length; k++) if (b[i + k] !== pattern[k]) continue outer;
    return i;
  }
  return -1;
}

export function lastIndexOf(b: Uint8Array, pattern: number[]): number {
  outer: for (let i = b.length - pattern.length; i >= 0; i--) {
    for (let k = 0; k < pattern.length; k++) if (b[i + k] !== pattern[k]) continue outer;
    return i;
  }
  return -1;
}

export const bytesOf = (s: string) => Array.from(s, (c) => c.charCodeAt(0) & 0xff);

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  t['-'.charCodeAt(0)] = 62;
  t['_'.charCodeAt(0)] = 63;
  return t;
})();

export function base64ToBytes(s: string): Uint8Array {
  const clean64 = s.replace(/[^A-Za-z0-9+/\-_]/g, '');
  const out = new Uint8Array(Math.floor((clean64.length * 3) / 4));
  let o = 0;
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < clean64.length; i++) {
    const v = B64_LOOKUP[clean64.charCodeAt(i)]!;
    if (v < 0) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

export function bytesToBase64(b: Uint8Array): string {
  let s = '';
  let i = 0;
  for (; i + 2 < b.length; i += 3) {
    const n = (b[i]! << 16) | (b[i + 1]! << 8) | b[i + 2]!;
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  if (i < b.length) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8);
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < b.length ? B64[(n >> 6) & 63]! : '=') + '=';
  }
  return s;
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
