/** Pure parts of diagnostics (folding repeats, the report text) — unit-tested. */

export interface DiagEntry {
  at: string;
  level: 'error' | 'warn' | 'info';
  scope: string;
  message: string;
  detail?: string;
  /** How many times it happened (folded repeats); absent = once. */
  count?: number;
  /** First time, when folded. */
  first?: string;
  /** App version that logged it. */
  v?: string;
}

export const MAX_ENTRIES = 150;
/** A repeat within the last N entries is folded into that entry. */
export const FOLD_WITHIN = 12;

/** Add an entry, folding it into a recent identical one (same level, scope and message, same version). */
export function mergeEntry(entries: DiagEntry[], entry: DiagEntry, max = MAX_ENTRIES): DiagEntry[] {
  const i = entries.slice(0, FOLD_WITHIN).findIndex((e) => e.level === entry.level && e.scope === entry.scope && e.message === entry.message && e.v === entry.v);
  if (i < 0) return [entry, ...entries].slice(0, max);
  const old = entries[i]!;
  const folded: DiagEntry = { ...entry, count: (old.count ?? 1) + 1, first: old.first ?? old.at, detail: entry.detail ?? old.detail };
  return [folded, ...entries.slice(0, i), ...entries.slice(i + 1)];
}

const clock = (iso: string) => iso.replace('T', ' ').replace(/\.\d+Z$/, 'Z');

export function formatEntry(e: DiagEntry, current?: string): string {
  const times = e.count && e.count > 1 ? `  ×${e.count} (first ${clock(e.first ?? e.at)})` : '';
  const from = current && e.v !== current ? `  [${e.v ? `from ${e.v}` : 'from an older version'}]` : '';
  const detail = e.detail ? `\n    ${e.detail.trim().replace(/\n/g, '\n    ')}` : '';
  return `[${clock(e.at)}] ${e.level.toUpperCase().padEnd(5)} ${e.scope}: ${e.message}${times}${from}${detail}`;
}

/**
 * The shareable report: who / what / where, a summary for the running version,
 * extra sections (e.g. casting state), then the events, newest first.
 */
export function buildReport(meta: Record<string, string>, sections: Record<string, string[]>, entries: DiagEntry[], current?: string, now = new Date()): string {
  const head = Object.entries({ ...meta, generated: now.toISOString() })
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const mine = entries.filter((e) => !current || e.v === current);
  const n = (level: DiagEntry['level']) => mine.filter((e) => e.level === level).reduce((a, e) => a + (e.count ?? 1), 0);
  const older = entries.length - mine.length;
  const summary = `${current ? `This version (${current})` : 'Recorded'}: ${n('error')} errors, ${n('warn')} warnings, ${n('info')} events${older ? ` · ${older} lines from older versions (marked)` : ''}`;
  const extra = Object.entries(sections)
    .filter(([, lines]) => lines.length)
    .map(([title, lines]) => `── ${title} ──\n${lines.join('\n')}`)
    .join('\n\n');
  const body = entries.map((e) => formatEntry(e, current)).join('\n');
  return ['Aura diagnostics', head, summary, extra, `── Events (newest first) ──\n${body || '(no events)'}`].filter(Boolean).join('\n\n');
}
