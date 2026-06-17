import { LOCAL_PERSISTENCE_PREFIXES } from '@/services/persistence/localPersistenceRegistry';

const JSON_PREFIX = LOCAL_PERSISTENCE_PREFIXES.settingsCache;

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export const settingsCache = {
  get<T>(key: string, defaultValue: T): T {
    if (!canUseLocalStorage()) return defaultValue;
    const raw = window.localStorage.getItem(`${JSON_PREFIX}${key}`);
    if (!raw) return defaultValue;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  },

  set<T>(key: string, value: T): void {
    if (!canUseLocalStorage()) return;
    window.localStorage.setItem(`${JSON_PREFIX}${key}`, JSON.stringify(value));
  },

  remove(key: string): void {
    if (!canUseLocalStorage()) return;
    window.localStorage.removeItem(`${JSON_PREFIX}${key}`);
  },
};
