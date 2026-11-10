import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type DiagEntry, buildReport, mergeEntry } from './diagnosticsFormat';
import { persistStorage } from './storage';

export type { DiagEntry } from './diagnosticsFormat';

/**
 * On-device diagnostics: recent errors, warnings and a few milestones (casting:
 * connected, which TV screen, what's playing). Repeats are folded into one line
 * with a count, and every line says which app version wrote it. Shown in
 * Settings → Diagnostics and shareable as text for bug reports. Nothing leaves
 * the phone unless you share it.
 */
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

let appVersion: string | undefined;
/** Stamp entries with the running app version (call once at startup). */
export function setDiagnosticsVersion(v: string) {
  appVersion = v;
}

export function logEvent(level: DiagEntry['level'], scope: string, message: string, detail?: unknown) {
  const d = detail instanceof Error ? `${detail.name}: ${detail.message}\n${detail.stack ?? ''}` : detail === undefined ? undefined : String(detail);
  const entry: DiagEntry = { at: new Date().toISOString(), level, scope, message: message.slice(0, 500), detail: d?.slice(0, 2000), v: appVersion };
  useDiagnostics.setState((s) => ({ entries: mergeEntry(s.entries, entry) }));
}

/** The shareable report (see buildReport). */
export function diagnosticsText(meta: Record<string, string>, sections: Record<string, string[]> = {}): string {
  return buildReport(meta, sections, useDiagnostics.getState().entries, appVersion);
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
