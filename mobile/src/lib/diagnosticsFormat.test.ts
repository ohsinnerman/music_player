import { describe, expect, it } from 'vitest';
import { type DiagEntry, buildReport, formatEntry, mergeEntry } from './diagnosticsFormat';

const e = (message: string, at: string, extra: Partial<DiagEntry> = {}): DiagEntry => ({ at, level: 'error', scope: 'cast', message, v: '1.2.5-beta', ...extra });

describe('mergeEntry', () => {
  it('folds a repeat into one line with a count and the first time', () => {
    let list: DiagEntry[] = [];
    list = mergeEntry(list, e('Must be called from the main thread', '2026-11-10T16:31:00.000Z'));
    list = mergeEntry(list, e('Must be called from the main thread', '2026-11-10T16:31:10.000Z'));
    list = mergeEntry(list, e('Must be called from the main thread', '2026-11-10T16:31:20.000Z'));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ count: 3, first: '2026-11-10T16:31:00.000Z', at: '2026-11-10T16:31:20.000Z' });
  });

  it('moves a folded repeat to the top past other lines', () => {
    let list: DiagEntry[] = [];
    list = mergeEntry(list, e('A', '2026-11-10T10:00:00.000Z'));
    list = mergeEntry(list, e('B', '2026-11-10T10:00:01.000Z'));
    list = mergeEntry(list, e('A', '2026-11-10T10:00:02.000Z'));
    expect(list.map((x) => x.message)).toEqual(['A', 'B']);
    expect(list[0]!.count).toBe(2);
  });

  it('keeps lines from different versions apart', () => {
    let list: DiagEntry[] = [];
    list = mergeEntry(list, e('A', '2026-11-10T10:00:00.000Z', { v: '1.2.4-beta' }));
    list = mergeEntry(list, e('A', '2026-11-10T10:00:01.000Z'));
    expect(list).toHaveLength(2);
  });

  it('caps the list', () => {
    let list: DiagEntry[] = [];
    for (let i = 0; i < 20; i++) list = mergeEntry(list, e(`m${i}`, '2026-11-10T10:00:00.000Z'), 5);
    expect(list).toHaveLength(5);
    expect(list[0]!.message).toBe('m19');
  });
});

describe('report', () => {
  it('marks lines from older versions and counts this version only', () => {
    const entries = [e('now', '2026-11-10T18:00:00.000Z', { count: 2, first: '2026-11-10T17:59:00.000Z' }), e('old', '2026-11-10T16:00:00.000Z', { v: '1.2.3-beta' }), e('ancient', '2026-11-09T16:00:00.000Z', { v: undefined })];
    const text = buildReport({ app: 'Aura 1.2.5-beta' }, { Casting: ['casting: no'] }, entries, '1.2.5-beta', new Date('2026-11-10T18:01:00.000Z'));
    expect(text).toContain('This version (1.2.5-beta): 2 errors, 0 warnings, 0 events · 2 lines from older versions (marked)');
    expect(text).toContain('── Casting ──\ncasting: no');
    expect(text).toContain('×2 (first 2026-11-10 17:59:00Z)');
    expect(text).toContain('[from 1.2.3-beta]');
    expect(text).toContain('[from an older version]');
  });

  it('indents details under their line', () => {
    expect(formatEntry(e('x', '2026-11-10T18:00:00.000Z', { detail: 'a\nb' }))).toBe('[2026-11-10 18:00:00Z] ERROR cast: x\n    a\n    b');
  });
});
