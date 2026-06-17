import { validateSettingsKeys } from '@openread/settings';
import type { ViewSettings } from '@/types/book';
import type { SystemSettings } from '@/types/settings';
import type { EnvConfigType } from '@/services/environment';
import { settingsLocalAdapter } from './settingsLocalAdapter';
import { createAppServiceSettingsPersistence } from './settingsPersistence';
import { applySyncableSettings, extractSyncableSettings } from './settingsSyncAdapter';

export interface SettingsSaveOptions {
  sync?: boolean;
}

export type SettingsUpdater = (settings: SystemSettings) => SystemSettings;

function cloneSettings(settings: SystemSettings): SystemSettings {
  return structuredClone(settings) as SystemSettings;
}

function sanitizeKnownSettings(settings: SystemSettings): {
  settings: SystemSettings;
  droppedKeys: string[];
} {
  const record = settings as unknown as Record<string, unknown>;
  const result = validateSettingsKeys(record);
  if (result.ok) return { settings, droppedKeys: [] };

  const sanitized = { ...record };
  for (const key of result.unknownKeys) delete sanitized[key];
  console.warn('[SettingsService] Dropped unknown settings keys:', result.unknownKeys.join(', '));
  return {
    settings: sanitized as unknown as SystemSettings,
    droppedKeys: result.unknownKeys,
  };
}

async function enqueueSync(settings: SystemSettings): Promise<void> {
  try {
    const { enqueueSettingsForSync } = await import('@/services/sync/helpers');
    await enqueueSettingsForSync(settings);
  } catch (error) {
    console.error('[SettingsService] Failed to enqueue settings sync:', error);
  }
}

export const settingsService = {
  async load(envConfig: EnvConfigType): Promise<SystemSettings> {
    const persistence = createAppServiceSettingsPersistence(envConfig);
    const loaded = await persistence.load();
    const { settings, droppedKeys } = sanitizeKnownSettings(loaded);
    if (droppedKeys.length > 0) await persistence.save(settings);
    return settings;
  },

  async save(
    envConfig: EnvConfigType,
    settings: SystemSettings,
    options: SettingsSaveOptions = {},
  ): Promise<SystemSettings> {
    const sanitized = sanitizeKnownSettings(settings).settings;
    const persistence = createAppServiceSettingsPersistence(envConfig);
    await persistence.save(sanitized);
    if (options.sync !== false) await enqueueSync(sanitized);
    return sanitized;
  },

  async update(
    envConfig: EnvConfigType,
    current: SystemSettings,
    updater: SettingsUpdater,
    options?: SettingsSaveOptions,
  ): Promise<SystemSettings> {
    const next = updater(cloneSettings(current));
    return this.save(envConfig, next, options);
  },

  async updateKey<K extends keyof SystemSettings>(
    envConfig: EnvConfigType,
    current: SystemSettings,
    key: K,
    value: SystemSettings[K],
    options?: SettingsSaveOptions,
  ): Promise<SystemSettings> {
    if (Object.is(current[key], value)) return current;
    return this.update(envConfig, current, (settings) => ({ ...settings, [key]: value }), options);
  },

  async updateGlobalViewSetting<K extends keyof ViewSettings>(
    envConfig: EnvConfigType,
    current: SystemSettings,
    key: K,
    value: ViewSettings[K],
    options?: SettingsSaveOptions,
  ): Promise<SystemSettings> {
    return this.update(
      envConfig,
      current,
      (settings) => ({
        ...settings,
        globalViewSettings: {
          ...settings.globalViewSettings,
          [key]: value,
        },
      }),
      options,
    );
  },

  async updateGlobalReadSettings(
    envConfig: EnvConfigType,
    current: SystemSettings,
    updater: (
      settings: SystemSettings['globalReadSettings'],
    ) => SystemSettings['globalReadSettings'],
    options?: SettingsSaveOptions,
  ): Promise<SystemSettings> {
    return this.update(
      envConfig,
      current,
      (settings) => ({
        ...settings,
        globalReadSettings: updater({ ...settings.globalReadSettings }),
      }),
      options,
    );
  },

  extractSyncable(settings: SystemSettings) {
    return extractSyncableSettings(settings);
  },

  applySyncable(local: SystemSettings, remote: Record<string, unknown>): SystemSettings {
    return applySyncableSettings(local, remote);
  },

  getThemeMode: settingsLocalAdapter.getThemeMode,
  setThemeMode: settingsLocalAdapter.setThemeMode,
  getThemeColor: settingsLocalAdapter.getThemeColor,
  setThemeColor: settingsLocalAdapter.setThemeColor,
};
