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
  const { getConfig, saveConfig, setConfig } = useBookDataStore.getState();

  const applyViewSettings = async (bookKey: string, isBookScopedEdit: boolean) => {
    const viewSettings = getViewSettings(bookKey);
    const viewState = getViewState(bookKey);
    const config = getConfig(bookKey);
    const hasOverride = config?.viewSettingsOverrideKeys?.includes(key) ?? false;
    const shouldUpdateView = viewSettings?.[key] !== value && (isBookScopedEdit || !hasOverride);
    const shouldRecordOverride = isBookScopedEdit && shouldUpdateView && !hasOverride;

    if (bookKey && viewSettings && (shouldUpdateView || shouldRecordOverride)) {
      const nextViewSettings = shouldUpdateView
        ? normalizeLegacyReaderLayoutSettings({ ...viewSettings, [key]: value })
        : viewSettings;
      if (shouldUpdateView) {
        setViewSettings(bookKey, nextViewSettings);
        if (applyStyles) {
          const view = getView(bookKey);
          view?.renderer.setStyles?.(getStyles(nextViewSettings));
        }
      }
      if (viewState?.isPrimary && config) {
        const nextConfig = {
          ...config,
          viewSettings: stripLegacyReaderLayoutFields(nextViewSettings),
          viewSettingsOverrideKeys:
            isBookScopedEdit && shouldUpdateView
              ? Array.from(new Set([...(config.viewSettingsOverrideKeys ?? []), key]))
              : config.viewSettingsOverrideKeys,
        };
        setConfig(bookKey, nextConfig);
        await saveConfig(envConfig, bookKey, nextConfig, settings);
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
      await applyViewSettings(bookKey, false);
    }
  } else if (bookKey) {
    await applyViewSettings(bookKey, true);
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
