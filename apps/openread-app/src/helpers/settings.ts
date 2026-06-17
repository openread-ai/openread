import { ViewSettings } from '@/types/book';
import { SystemSettings } from '@/types/settings';
import { EnvConfigType } from '@/services/environment';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { settingsService } from '@/services/settings/settingsService';
import { getStyles } from '@/utils/style';

export const saveViewSettings = async <K extends keyof ViewSettings>(
  envConfig: EnvConfigType,
  bookKey: string,
  key: K,
  value: ViewSettings[K],
  skipGlobal = false,
  applyStyles = true,
) => {
  const { settings, isSettingsGlobal, setSettings } = useSettingsStore.getState();
  const { bookKeys, getView, getViewState, getViewSettings, setViewSettings } =
    useReaderStore.getState();
  const { getConfig, saveConfig } = useBookDataStore.getState();

  const applyViewSettings = async (bookKey: string) => {
    const viewSettings = getViewSettings(bookKey);
    const viewState = getViewState(bookKey);
    if (bookKey && viewSettings && viewSettings[key] !== value) {
      const nextViewSettings = { ...viewSettings, [key]: value };
      setViewSettings(bookKey, nextViewSettings);
      if (applyStyles) {
        const view = getView(bookKey);
        view?.renderer.setStyles?.(getStyles(nextViewSettings));
      }
      const config = getConfig(bookKey);
      if (viewState?.isPrimary && config) {
        await saveConfig(envConfig, bookKey, config, settings);
      }
    }
  };

  if (isSettingsGlobal && !skipGlobal) {
    const nextSettings = await settingsService.updateGlobalViewSetting(
      envConfig,
      settings,
      key,
      value,
    );
    setSettings(nextSettings);

    for (const bookKey of bookKeys) {
      await applyViewSettings(bookKey);
    }
  } else if (bookKey) {
    await applyViewSettings(bookKey);
  }
};

export const saveSysSettings = async <K extends keyof SystemSettings>(
  envConfig: EnvConfigType,
  key: K,
  value: SystemSettings[K],
) => {
  const { settings, setSettings } = useSettingsStore.getState();
  const nextSettings = await settingsService.updateKey(envConfig, settings, key, value);
  if (nextSettings !== settings) setSettings(nextSettings);
};
