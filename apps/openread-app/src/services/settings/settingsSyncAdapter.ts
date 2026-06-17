import { SYNCABLE_SETTINGS_KEYS } from '@openread/settings';
import type { SystemSettings } from '@/types/settings';

export type SyncableSettingsPayload = Record<string, unknown> & { _updatedAt?: string };

export function extractSyncableSettings(settings: SystemSettings): SyncableSettingsPayload {
  const payload: SyncableSettingsPayload = {};
  for (const key of SYNCABLE_SETTINGS_KEYS) {
    payload[key] = settings[key as keyof SystemSettings];
  }
  payload._updatedAt = new Date().toISOString();
  return payload;
}

export function applySyncableSettings(
  local: SystemSettings,
  remote: Record<string, unknown>,
): SystemSettings {
  const merged: SystemSettings = { ...local };
  for (const key of SYNCABLE_SETTINGS_KEYS) {
    if (remote[key] !== undefined) {
      (merged as unknown as Record<string, unknown>)[key] = remote[key];
    }
  }
  return merged;
}
