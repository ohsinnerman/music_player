import * as SecureStore from 'expo-secure-store';

/**
 * The refresh token lives in the OS keystore (Android Keystore / iOS
 * Keychain) via SecureStore, readable only after first unlock and never
 * backed up. The short-lived access token is kept in memory only.
 */
const KEY = 'aura.refreshToken';
const OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

let accessToken: string | null = null;

export const tokenStorage = {
  getAccess: () => accessToken,
  setAccess: (t: string | null) => {
    accessToken = t;
  },
  async getRefresh(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(KEY, OPTS);
    } catch {
      return null;
    }
  },
  async setRefresh(t: string | null) {
    if (t) await SecureStore.setItemAsync(KEY, t, OPTS);
    else await SecureStore.deleteItemAsync(KEY, OPTS).catch(() => undefined);
  },
  async clear() {
    accessToken = null;
    await this.setRefresh(null);
  },
};
