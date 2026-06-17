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

function assertKnownSettings(settings: SystemSettings): void {
  const result = validateSettingsKeys(settings as unknown as Record<string, unknown>);
  if (!result.ok) {
    // Keep legacy forward-compatibility: warn instead of hard-failing so older clients
    // can still open settings written by newer builds while registry additions land.
    console.warn('[SettingsService] Unknown settings keys:', result.unknownKeys.join(', '));
  }
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
    const settings = await persistence.load();
    assertKnownSettings(settings);
    return settings;
  },

  async save(
    envConfig: EnvConfigType,
    settings: SystemSettings,
    options: SettingsSaveOptions = {},
  ): Promise<SystemSettings> {
    assertKnownSettings(settings);
    const persistence = createAppServiceSettingsPersistence(envConfig);
    await persistence.save(settings);
    if (options.sync !== false) await enqueueSync(settings);
    return settings;
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
