import type { SyncEntity } from '@openread/sync';

import { getDeviceId } from '@/services/deviceService';

const PREFIX = 'openread:sync-cursor';

const storageKey = (userId: string, entity: SyncEntity, scope = 'global'): string =>
  `${PREFIX}:${userId}:${getDeviceId()}:${entity}:${scope}`;

const memoryCursors = new Map<string, string>();

const readStorage = (key: string): string | null => {
  if (typeof window === 'undefined') return memoryCursors.get(key) ?? null;
  return window.localStorage.getItem(key);
};

const writeStorage = (key: string, value: string): void => {
  memoryCursors.set(key, value);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(key, value);
  }
};

export function getCanonicalSyncCursor(
  userId: string | null,
  entity: SyncEntity,
  scope?: string,
): number {
  if (!userId) return 0;
  const value = readStorage(storageKey(userId, entity, scope));
  if (!value) return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function setCanonicalSyncCursor(
  userId: string | null,
  entity: SyncEntity,
  cursor: string | number | null | undefined,
  scope?: string,
): void {
  if (!userId || cursor == null || cursor === '') return;
  const numeric = Number(cursor);
  if (!Number.isFinite(numeric) || numeric <= 0) return;
  writeStorage(storageKey(userId, entity, scope), String(Math.trunc(numeric)));
}

export function resetCanonicalSyncCursors(userId: string | null): void {
  if (!userId) return;
  const prefix = `${PREFIX}:${userId}:${getDeviceId()}:`;
  for (const key of [...memoryCursors.keys()]) {
    if (key.startsWith(prefix)) memoryCursors.delete(key);
  }
  if (typeof window !== 'undefined') {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix)) window.localStorage.removeItem(key);
    }
  }
}
