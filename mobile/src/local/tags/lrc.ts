import type { SyncedLine } from './types';

const STAMP = /^\s*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/;

/** True when text is LRC (several "[mm:ss.xx] line" rows), as many taggers store in plain lyrics fields. */
export function looksLikeLrc(text: string | undefined): boolean {
  if (!text) return false;
  let n = 0;
  for (const line of text.split(/\r?\n/)) if (STAMP.test(line) && ++n >= 3) return true;
  return false;
}

/** Parse LRC into sorted lines. Handles multiple stamps per line and [offset:±ms]. */
export function lrcToLines(lrc: string): SyncedLine[] {
  const lines: SyncedLine[] = [];
  let offset = 0;
  const stamp = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const raw of lrc.split(/\r?\n/)) {
    const off = /^\[offset:\s*([+-]?\d+)\s*\]/i.exec(raw);
    if (off) {
      offset = Number(off[1]);
      continue;
    }
    const times: number[] = [];
    let m: RegExpExecArray | null;
    let last = 0;
    stamp.lastIndex = 0;
    while ((m = stamp.exec(raw)) && m.index === last) {
      const frac = m[3] ? Number(m[3].padEnd(3, '0')) : 0;
      times.push(Number(m[1]) * 60_000 + Number(m[2]) * 1000 + frac);
      last = stamp.lastIndex;
    }
    if (!times.length) continue;
    const text = raw.slice(last).trim();
    for (const t of times) lines.push({ timeMs: Math.max(0, t - offset), text });
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}
