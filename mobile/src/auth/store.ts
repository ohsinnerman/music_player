import { create } from 'zustand';
import { onSessionExpired, refreshSession } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { queryClient } from '@/api/queries';
import type { AuthPayload, User } from '@/api/types';
import { tokenStorage } from './tokenStorage';

type Status = 'loading' | 'guest' | 'authed';

interface AuthState {
  status: Status;
  user: User | null;
  bootstrap: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
  /** After password change: new tokens for this device. */
  adoptTokens: (p: { accessToken: string; refreshToken: string }) => Promise<void>;
}

const listeners = new Set<(u: User) => void>();
/** Library sync hooks in here to push guest data up after sign-in. */
export const onSignedIn = (fn: (u: User) => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useAuth = create<AuthState>()((set, get) => {
  async function accept(p: AuthPayload) {
    tokenStorage.setAccess(p.accessToken);
    await tokenStorage.setRefresh(p.refreshToken);
    set({ status: 'authed', user: p.user });
    queryClient.removeQueries({ queryKey: ['me'] });
    listeners.forEach((l) => l(p.user));
  }

  onSessionExpired(() => {
    if (get().status === 'authed') {
      set({ status: 'guest', user: null });
      queryClient.removeQueries({ queryKey: ['me'] });
    }
  });

  return {
    status: 'loading',
    user: null,

    async bootstrap() {
      const rt = await tokenStorage.getRefresh();
      if (!rt) return set({ status: 'guest' });
      // Optimistic: we have a session; confirm it in the background.
      try {
        if (await refreshSession()) {
          const user = await endpoints.me();
          set({ status: 'authed', user });
        } else {
          set({ status: tokenStorage.getAccess() ? 'authed' : 'guest' });
        }
      } catch {
        // Offline at launch: keep the session, requests will refresh later.
        set({ status: 'authed' });
      }
    },

    async signIn(email, password) {
      await accept(await endpoints.login({ email: email.trim(), password }));
    },

    async signUp(email, password, displayName) {
      await accept(await endpoints.register({ email: email.trim(), password, displayName: displayName.trim() }));
    },

    async signOut() {
      const rt = await tokenStorage.getRefresh();
      await tokenStorage.clear();
      set({ status: 'guest', user: null });
      queryClient.removeQueries({ queryKey: ['me'] });
      if (rt) endpoints.logout(rt).catch(() => undefined);
    },

    setUser: (user) => set({ user }),

    async adoptTokens(p) {
      tokenStorage.setAccess(p.accessToken);
      await tokenStorage.setRefresh(p.refreshToken);
    },
  };
});
