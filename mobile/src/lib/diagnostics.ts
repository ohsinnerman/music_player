import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from './storage';

/**
 * On-device diagnostics: the last 80 errors / warnings (JS crashes, unhandled
 * promise rejections, playback and network failures). Shown in Settings →
 * Diagnostics and shareable as text for bug reports. Nothing leaves the phone
 * unless you share it.
 */

export interface DiagEntry {
  at: string;
  level: 'error' | 'warn' | 'info';
  scope: string;
  message: string;
  detail?: string;
}

interface DiagState {
  entries: DiagEntry[];
  clear: () => void;
}

export const useDiagnostics = create<DiagState>()(
  persist(
    (set) => ({
      entries: [],
      clear: () => set({ entries: [] }),
    }),
    { name: 'aura.diagnostics', storage: persistStorage, version: 1, partialize: (s) => ({ entries: s.entries }) },
  ),
);

const MAX = 80;

export function logEvent(level: DiagEntry['level'], scope: string, message: string, detail?: unknown) {
  const d = detail instanceof Error ? `${detail.name}: ${detail.message}\n${detail.stack ?? ''}` : detail === undefined ? undefined : String(detail);
  const entry: DiagEntry = { at: new Date().toISOString(), level, scope, message: message.slice(0, 500), detail: d?.slice(0, 2000) };
  useDiagnostics.setState((s) => ({ entries: [entry, ...s.entries].slice(0, MAX) }));
}

export function diagnosticsText(meta: Record<string, string>): string {
  const head = Object.entries(meta)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const body = useDiagnostics
    .getState()
    .entries.map((e) => `[${e.at}] ${e.level.toUpperCase()} ${e.scope}: ${e.message}${e.detail ? `\n  ${e.detail.replace(/\n/g, '\n  ')}` : ''}`)
    .join('\n');
  return `${head}\n\n${body || '(no events)'}`;
}

let installed = false;

/** Capture fatal JS errors and unhandled promise rejections (call once at startup). */
export function installGlobalHandlers() {
  if (installed) return;
  installed = true;
  const g = globalThis as unknown as {
    ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void };
    HermesInternal?: { enablePromiseRejectionTracker?: (o: { allRejections: boolean; onUnhandled: (id: number, e: unknown) => void }) => void };
  };
  const prev = g.ErrorUtils?.getGlobalHandler();
  g.ErrorUtils?.setGlobalHandler((e, fatal) => {
    logEvent('error', fatal ? 'crash' : 'js', e instanceof Error ? e.message : String(e), e);
    prev?.(e, fatal);
  });
  g.HermesInternal?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id, e) => logEvent('warn', 'promise', e instanceof Error ? e.message : String(e), e),
  });
}
