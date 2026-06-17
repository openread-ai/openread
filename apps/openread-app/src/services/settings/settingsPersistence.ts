import type { EnvConfigType } from '@/services/environment';
import type { SystemSettings } from '@/types/settings';

export interface SettingsPersistenceAdapter {
  load(): Promise<SystemSettings>;
  save(settings: SystemSettings): Promise<void>;
}

export function createAppServiceSettingsPersistence(
  envConfig: EnvConfigType,
): SettingsPersistenceAdapter {
  return {
    async load() {
      const appService = await envConfig.getAppService();
      return appService.loadSettings();
    },
    async save(settings) {
      const appService = await envConfig.getAppService();
      await appService.saveSettings(settings);
    },
  };
}
