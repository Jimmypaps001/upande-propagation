import { create } from 'zustand';
import { storage, StorageKeys } from '@/src/services/storage';
import { loginToServer } from '@/src/services/auth-api';

interface AuthState {
  hydrated: boolean;
  hasSession: boolean;
  email: string | null;
  fullName: string | null;
  baseUrl: string | null;
  busy: boolean;
  error: string | null;

  hydrate: () => Promise<void>;
  login: (url: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  hydrated: false,
  hasSession: false,
  email: null,
  fullName: null,
  baseUrl: null,
  busy: false,
  error: null,

  /** Read the session off disk once at launch, before anything routes. */
  async hydrate() {
    const [cookie, baseUrl, email, fullName] = await Promise.all([
      storage.get(StorageKeys.cookie),
      storage.get(StorageKeys.instanceUrl),
      storage.get(StorageKeys.emailBackup),
      storage.get(StorageKeys.fullName),
    ]);
    set({ hydrated: true, hasSession: !!(cookie && baseUrl), baseUrl, email, fullName });
  },

  async login(url, email, password) {
    set({ busy: true, error: null });
    try {
      const res = await loginToServer(url, email, password);
      set({
        busy: false,
        hasSession: true,
        baseUrl: res.baseUrl,
        email: res.email,
        fullName: res.fullName,
        error: null,
      });
      return true;
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : 'Could not sign in.' });
      return false;
    }
  },

  /**
   * Sign out, keeping the server address and the email. The next person at
   * this phone is almost always the same person at the same unit, and making
   * them retype the server is how a shift starts badly.
   */
  async logout() {
    await storage.clearExcept([
      StorageKeys.instanceUrl,
      StorageKeys.instanceUrlBackup,
      StorageKeys.emailBackup,
      StorageKeys.unit,
      StorageKeys.unitsCache,
    ]);
    set({ hasSession: false, fullName: null, error: null });
  },

  clearError() {
    set({ error: null });
  },
}));
