import { SYNCABLE_SETTINGS_KEYS } from '@openread/settings';
import type { SystemSettings } from '@/types/settings';
import {
  normalizeLegacyReaderLayoutSettings,
  stripLegacyReaderLayoutFields,
} from '@/app/reader/utils/readerLayoutContract';

export type SyncableSettingsPayload = Record<string, unknown> & { _updatedAt?: string };

export function extractSyncableSettings(settings: SystemSettings): SyncableSettingsPayload {
  const payload: SyncableSettingsPayload = {};
  for (const key of SYNCABLE_SETTINGS_KEYS) {
    if (key === 'globalViewSettings') {
      payload[key] = stripLegacyReaderLayoutFields(
        normalizeLegacyReaderLayoutSettings(settings.globalViewSettings),
      );
    } else {
      payload[key] = settings[key as keyof SystemSettings];
    }
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
      (merged as unknown as Record<string, unknown>)[key] =
        key === 'globalViewSettings'
          ? normalizeLegacyReaderLayoutSettings({
              ...local.globalViewSettings,
              ...(remote[key] as Record<string, unknown>),
            })
          : remote[key];
    }
  }
  return merged;
}
