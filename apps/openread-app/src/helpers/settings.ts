import { ViewSettings } from '@/types/book';
import { SystemSettings } from '@/types/settings';
import { EnvConfigType } from '@/services/environment';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { settingsService } from '@/services/settings/settingsService';
import { getStyles } from '@/utils/style';
import {
  LEGACY_READER_LAYOUT_KEYS,
  normalizeLegacyReaderLayoutSettings,
  stripLegacyReaderLayoutFields,
} from '@/app/reader/utils/readerLayoutContract';
import { restoreReaderAppearanceDefaults } from '@/services/settings/readerAppearanceDefaults';

const assertCanonicalViewSettingKey = (key: keyof ViewSettings) => {
  if ((LEGACY_READER_LAYOUT_KEYS as readonly string[]).includes(String(key))) {
    throw new Error(`Legacy reader layout setting "${String(key)}" cannot be written at runtime`);
  }
};

export const saveViewSettings = async <K extends keyof ViewSettings>(
  envConfig: EnvConfigType,
  bookKey: string,
  key: K,
  value: ViewSettings[K],
  skipGlobal = false,
  applyStyles = true,
) => {
  assertCanonicalViewSettingKey(key);
  const { settings, isSettingsGlobal, setSettings } = useSettingsStore.getState();
  const { bookKeys, getView, getViewState, getViewSettings, setViewSettings } =
    useReaderStore.getState();
  const { getConfig, saveConfig } = useBookDataStore.getState();

  const applyViewSettings = async (bookKey: string) => {
    const viewSettings = getViewSettings(bookKey);
    const viewState = getViewState(bookKey);
    if (bookKey && viewSettings && viewSettings[key] !== value) {
      const nextViewSettings = normalizeLegacyReaderLayoutSettings({
        ...viewSettings,
        [key]: value,
      });
      setViewSettings(bookKey, nextViewSettings);
      if (applyStyles) {
        const view = getView(bookKey);
        view?.renderer.setStyles?.(getStyles(nextViewSettings));
      }
      const config = getConfig(bookKey);
      if (config?.viewSettings) {
        config.viewSettings = stripLegacyReaderLayoutFields(config.viewSettings);
      }
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

const applyReaderAppearanceToOpenView = (bookKey: string, viewSettings: ViewSettings) => {
  const { getView } = useReaderStore.getState();
  const { getBookDataByReaderKey } = useBookDataStore.getState();

  const view = getView(bookKey);
  view?.renderer.setStyles?.(getStyles(viewSettings));
  view?.renderer.setAttribute?.('scale-factor', viewSettings.pageZoomLevel);
  view?.renderer.setAttribute?.('zoom', viewSettings.pageZoomMode);
  view?.renderer.setAttribute?.('spread', viewSettings.pageSpreadMode);

  const bookData = getBookDataByReaderKey(bookKey);
  if (bookData?.bookDoc?.sections?.length) {
    const coverSide = bookData.bookDoc.dir === 'rtl' ? 'right' : 'left';
    bookData.bookDoc.sections[0]!.pageSpread = viewSettings.keepCoverSpread ? '' : coverSide;
  }
};

export const restoreCurrentBookReaderAppearanceDefaults = async (
  envConfig: EnvConfigType,
  bookKey: string,
  defaults: ViewSettings,
) => {
  const { settings } = useSettingsStore.getState();
  const { getViewSettings, getViewState, setViewSettings } = useReaderStore.getState();
  const { getConfig, saveConfig } = useBookDataStore.getState();
  const currentViewSettings = getViewSettings(bookKey);
  if (!currentViewSettings) return null;

  const nextViewSettings = restoreReaderAppearanceDefaults(currentViewSettings, defaults);
  setViewSettings(bookKey, nextViewSettings);
  applyReaderAppearanceToOpenView(bookKey, nextViewSettings);

  const config = getConfig(bookKey);
  if (getViewState(bookKey)?.isPrimary && config) {
    await saveConfig(
      envConfig,
      bookKey,
      {
        ...config,
        viewSettings: nextViewSettings,
      },
      settings,
    );
  }

  return nextViewSettings;
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
