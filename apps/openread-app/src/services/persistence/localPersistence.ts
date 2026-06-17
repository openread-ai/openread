import { isRegisteredLocalPersistenceKey } from './localPersistenceRegistry';

type StorageArea = 'localStorage' | 'sessionStorage';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

function getStorage(area: StorageArea): StorageLike | null {
  if (typeof window === 'undefined') return null;
  return area === 'localStorage' ? window.localStorage : window.sessionStorage;
}

function assertRegisteredKey(key: string): void {
  if (process.env.NODE_ENV === 'production') return;
  if (!isRegisteredLocalPersistenceKey(key)) {
    throw new Error(`Unregistered browser persistence key: ${key}`);
  }
}

export function readLocalPersistence(
  key: string,
  area: StorageArea = 'localStorage',
): string | null {
  assertRegisteredKey(key);
  return getStorage(area)?.getItem(key) ?? null;
}

export function writeLocalPersistence(
  key: string,
  value: string,
  area: StorageArea = 'localStorage',
): void {
  assertRegisteredKey(key);
  getStorage(area)?.setItem(key, value);
}

export function removeLocalPersistence(key: string, area: StorageArea = 'localStorage'): void {
  assertRegisteredKey(key);
  getStorage(area)?.removeItem(key);
}

export function readJsonLocalPersistence<T>(
  key: string,
  fallback: T,
  area: StorageArea = 'localStorage',
): T {
  const raw = readLocalPersistence(key, area);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonLocalPersistence(
  key: string,
  value: unknown,
  area: StorageArea = 'localStorage',
): void {
  writeLocalPersistence(key, JSON.stringify(value), area);
}

export function removeLocalPersistencePrefix(
  prefix: string,
  area: StorageArea = 'localStorage',
): void {
  assertRegisteredKey(`${prefix}*`);
  const storage = getStorage(area);
  if (!storage) return;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) storage.removeItem(key);
  }
}
