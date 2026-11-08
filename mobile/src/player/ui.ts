import { withSpring } from 'react-native-reanimated';
import { create } from 'zustand';
import { chrome } from '@/lib/chrome';
import { spring } from '@/theme';

export type PlayerPanel = 'none' | 'lyrics' | 'queue';

interface PlayerUi {
  panel: PlayerPanel;
  /** True once the full player has been opened at least once (lazy-mounts heavy parts). */
  everOpened: boolean;
  isOpen: boolean;
  setPanel: (p: PlayerPanel) => void;
  setOpen: (open: boolean) => void;
}

export const usePlayerUi = create<PlayerUi>()((set, get) => ({
  panel: 'none',
  everOpened: false,
  isOpen: false,
  setPanel: (panel) => {
    const next = get().panel === panel ? 'none' : panel;
    chrome.playerPanel.value = withSpring(next === 'none' ? 0 : 1, spring.smooth);
    set({ panel: next });
  },
  setOpen: (isOpen) => set((s) => ({ isOpen, everOpened: s.everOpened || isOpen })),
}));

export function openPlayer() {
  chrome.playerProgress.value = withSpring(1, spring.sheet);
  usePlayerUi.getState().setOpen(true);
}

export function closePlayer() {
  chrome.playerProgress.value = withSpring(0, spring.sheet);
  usePlayerUi.getState().setOpen(false);
}
