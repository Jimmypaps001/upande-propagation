import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const StorageKeys = {
  cookie: 'cookie',
  instanceUrl: 'instanceurl',
  instanceUrlBackup: 'instanceurl_backup',
  emailBackup: 'email_backup',
  fullName: 'fullname',
  // The propagation unit this phone records for. One phone sits in one unit,
  // so it is asked once at setup and restored on every launch.
  unit: 'unit',
  // The propagation plan last worked to, so the home screen opens on it.
  plan: 'plan',
  // Units from the last successful setup load, offered before sign-in.
  unitsCache: 'units_cache',
  // Password, kept in the OS secure enclave. Fed back into the login endpoint
  // to silently re-authenticate when the server session expires.
  passwordBackup: 'password_backup',
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];

// The password is the most sensitive thing we persist, so it lives in the OS
// secure enclave (iOS Keychain / Android Keystore) via SecureStore. SecureStore
// isn't available on web, so fall back to AsyncStorage there.
const SECURE_KEYS: string[] = [StorageKeys.passwordBackup];
const secureAvailable = Platform.OS !== 'web';
const isSecureKey = (key: string): boolean => secureAvailable && SECURE_KEYS.includes(key);

export const storage = {
  get: (key: string): Promise<string | null> =>
    isSecureKey(key) ? SecureStore.getItemAsync(key) : AsyncStorage.getItem(key),
  set: (key: string, value: string): Promise<void> =>
    isSecureKey(key) ? SecureStore.setItemAsync(key, value) : AsyncStorage.setItem(key, value),
  remove: (key: string): Promise<void> =>
    isSecureKey(key) ? SecureStore.deleteItemAsync(key) : AsyncStorage.removeItem(key),
  async clearExcept(keep: string[]): Promise<void> {
    const allKeys = Object.values(StorageKeys);
    await Promise.all(allKeys.filter((k) => !keep.includes(k)).map((k) => storage.remove(k)));
  },
  async clearAll(): Promise<void> {
    await Promise.all(Object.values(StorageKeys).map((k) => storage.remove(k)));
  },
};
