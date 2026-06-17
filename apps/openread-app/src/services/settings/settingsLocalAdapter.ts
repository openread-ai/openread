import type { ThemeMode } from '@/styles/themes';
import { LOCAL_PERSISTENCE_KEYS } from '@/services/persistence/localPersistenceRegistry';
import {
  readJsonLocalPersistence,
  readLocalPersistence,
  removeLocalPersistence,
  writeJsonLocalPersistence,
  writeLocalPersistence,
} from '@/services/persistence/localPersistence';

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

type RegisteredLocalSettingKey =
  | typeof LOCAL_PERSISTENCE_KEYS.notificationPreferences
  | typeof LOCAL_PERSISTENCE_KEYS.customShortcuts
  | typeof LOCAL_PERSISTENCE_KEYS.ttsPreferredVoices
  | typeof LOCAL_PERSISTENCE_KEYS.themeMode
  | typeof LOCAL_PERSISTENCE_KEYS.themeColor
  | typeof LOCAL_PERSISTENCE_KEYS.deviceId
  | typeof LOCAL_PERSISTENCE_KEYS.openreadPreferences
  | typeof LOCAL_PERSISTENCE_KEYS.customThemes;

export const settingsLocalAdapter = {
  getThemeMode(defaultValue: ThemeMode = 'auto'): ThemeMode {
    if (!canUseLocalStorage()) return defaultValue;
    return (
      (readLocalPersistence(LOCAL_PERSISTENCE_KEYS.themeMode) as ThemeMode | null) ?? defaultValue
    );
  },

  setThemeMode(mode: ThemeMode): void {
    if (!canUseLocalStorage()) return;
    writeLocalPersistence(LOCAL_PERSISTENCE_KEYS.themeMode, mode);
  },

  getThemeColor(defaultValue: string): string {
    if (!canUseLocalStorage()) return defaultValue;
    return readLocalPersistence(LOCAL_PERSISTENCE_KEYS.themeColor) ?? defaultValue;
  },

  setThemeColor(color: string): void {
    if (!canUseLocalStorage()) return;
    writeLocalPersistence(LOCAL_PERSISTENCE_KEYS.themeColor, color);
  },

  getDeviceId(): string | null {
    if (!canUseLocalStorage()) return null;
    return readLocalPersistence(LOCAL_PERSISTENCE_KEYS.deviceId);
  },

  setDeviceId(deviceId: string): void {
    if (!canUseLocalStorage()) return;
    writeLocalPersistence(LOCAL_PERSISTENCE_KEYS.deviceId, deviceId);
  },

  getNotificationPreferences<T>(defaultValue: T): T {
    return readJsonLocalPersistence(LOCAL_PERSISTENCE_KEYS.notificationPreferences, defaultValue);
  },

  setNotificationPreferences<T>(preferences: T): void {
    writeJsonLocalPersistence(LOCAL_PERSISTENCE_KEYS.notificationPreferences, preferences);
  },

  clearNotificationPreferences(): void {
    removeLocalPersistence(LOCAL_PERSISTENCE_KEYS.notificationPreferences);
  },

  getCustomShortcuts<T>(defaultValue: T): T {
    return readJsonLocalPersistence(LOCAL_PERSISTENCE_KEYS.customShortcuts, defaultValue);
  },

  setCustomShortcuts<T>(shortcuts: T): void {
    writeJsonLocalPersistence(LOCAL_PERSISTENCE_KEYS.customShortcuts, shortcuts);
  },

  getTtsPreferences(): Record<string, string> {
    return readJsonLocalPersistence<Record<string, string>>(
      LOCAL_PERSISTENCE_KEYS.ttsPreferredVoices,
      {},
    );
  },

  setTtsPreferences(preferences: Record<string, string>): void {
    writeJsonLocalPersistence(LOCAL_PERSISTENCE_KEYS.ttsPreferredVoices, preferences);
  },

  removeLocalSetting(key: RegisteredLocalSettingKey): void {
    removeLocalPersistence(key);
  },
};
