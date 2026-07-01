import { ViewSettings } from '@/types/book';
import { SystemSettings } from '@/types/settings';
import { AppService } from '@/types/system';
import { EnvConfigType } from '@/services/environment';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useCustomTextureStore } from '@/store/customTextureStore';
import { settingsService } from '@/services/settings/settingsService';
import { getStyles } from '@/utils/style';
import {
  LEGACY_READER_LAYOUT_KEYS,
  applyReaderLayoutToRenderer,
  normalizeLegacyReaderLayoutSettings,
  stripLegacyReaderLayoutFields,
} from '@/app/reader/utils/readerLayoutContract';
import {
  ReaderAppearanceDefaultCategory,
  restoreReaderAppearanceDefaults,
} from '@/services/settings/readerAppearanceDefaults';
import { getBookDirFromLanguage, getBookDirFromWritingMode } from '@/utils/book';
import { lockScreenOrientation } from '@/utils/bridge';

const assertCanonicalViewSettingKey = (key: keyof ViewSettings) => {
  if ((LEGACY_READER_LAYOUT_KEYS as readonly string[]).includes(String(key))) {
    throw new Error(`Legacy reader layout setting "${String(key)}" cannot be written at runtime`);
  }
};

const currentBookReaderAppearanceResetEchoes = new Map<string, unknown>();

const getReaderAppearanceResetEchoKey = (bookKey: string, key: keyof ViewSettings) =>
  `${bookKey}:${String(key)}`;

export const markCurrentBookReaderAppearanceResetEcho = <K extends keyof ViewSettings>(
  bookKey: string,
  key: K,
  value: ViewSettings[K],
) => {
  const echoKey = getReaderAppearanceResetEchoKey(bookKey, key);
  currentBookReaderAppearanceResetEchoes.set(echoKey, value);
  const timeout = setTimeout(() => {
    if (Object.is(currentBookReaderAppearanceResetEchoes.get(echoKey), value)) {
      currentBookReaderAppearanceResetEchoes.delete(echoKey);
    }
  }, 1000);
  if (typeof timeout === 'object' && 'unref' in timeout) {
    timeout.unref();
  }
};

const consumeCurrentBookReaderAppearanceResetEcho = <K extends keyof ViewSettings>(
  bookKey: string,
  key: K,
  value: ViewSettings[K],
) => {
  const echoKey = getReaderAppearanceResetEchoKey(bookKey, key);
  if (!currentBookReaderAppearanceResetEchoes.has(echoKey)) return false;

  const pendingValue = currentBookReaderAppearanceResetEchoes.get(echoKey);
  currentBookReaderAppearanceResetEchoes.delete(echoKey);
  return Object.is(pendingValue, value);
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
  if (consumeCurrentBookReaderAppearanceResetEcho(bookKey, key, value)) return;

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

type RestoreReaderAppearanceOptions = {
  categories?: readonly ReaderAppearanceDefaultCategory[];
  appService?: Pick<
    AppService,
    'isMobile' | 'isMobileApp' | 'isIOSApp' | 'isAndroidApp' | 'isEink'
  > | null;
};

const shouldRecreateForWritingModeChange = (previous: ViewSettings, next: ViewSettings) => {
  const previousWritingMode = previous.writingMode;
  const nextWritingMode = next.writingMode;
  if (previousWritingMode === nextWritingMode) return false;
  return [previousWritingMode, nextWritingMode].some((mode) =>
    ['horizontal-rl', 'vertical-rl'].includes(mode),
  );
};

const applyReaderAppearanceToOpenView = async (
  envConfig: EnvConfigType,
  bookKey: string,
  previousViewSettings: ViewSettings,
  viewSettings: ViewSettings,
  appService?: RestoreReaderAppearanceOptions['appService'],
) => {
  const { getView, recreateViewer } = useReaderStore.getState();
  const { getBookDataByReaderKey } = useBookDataStore.getState();

  const view = getView(bookKey);
  const bookData = getBookDataByReaderKey(bookKey);
  const bookDoc = bookData?.bookDoc;
  const readerLayoutBook = {
    isFixedLayout: bookData?.isFixedLayout,
    renditionLayout: bookDoc?.rendition?.layout,
    format: bookData?.book?.format,
  };
  const readerLayoutPlatform = {
    isMobile: appService?.isMobile,
    isIOSApp: appService?.isIOSApp,
    isAndroidApp: appService?.isAndroidApp,
    isEink: appService?.isEink,
  };

  applyReaderLayoutToRenderer(view?.renderer, viewSettings, readerLayoutBook, readerLayoutPlatform);
  view?.renderer.setStyles?.(getStyles(viewSettings));
  view?.renderer.setAttribute?.('scale-factor', viewSettings.pageZoomLevel);
  view?.renderer.setAttribute?.('zoom', viewSettings.pageZoomMode);
  view?.renderer.setAttribute?.('spread', viewSettings.pageSpreadMode);

  if (bookDoc) {
    const settingsDir = getBookDirFromWritingMode(viewSettings.writingMode);
    const languageDir = getBookDirFromLanguage(bookDoc.metadata?.language);
    if (settingsDir !== 'auto') {
      bookDoc.dir = settingsDir;
    } else if (languageDir !== 'auto') {
      bookDoc.dir = languageDir;
    }
    if (view?.book) {
      view.book.dir = bookDoc.dir;
    }
  }

  if (bookDoc?.sections?.length) {
    const coverSide = bookDoc.dir === 'rtl' ? 'right' : 'left';
    bookDoc.sections[0]!.pageSpread = viewSettings.keepCoverSpread ? '' : coverSide;
  }

  if (typeof document !== 'undefined') {
    await useCustomTextureStore
      .getState()
      .applyTexture(envConfig, viewSettings.backgroundTextureId);
    document.documentElement.style.setProperty(
      '--bg-texture-opacity',
      `${viewSettings.backgroundOpacity}`,
    );
    document.documentElement.style.setProperty('--bg-texture-size', viewSettings.backgroundSize);
  }

  if (appService?.isMobileApp) {
    await lockScreenOrientation({ orientation: viewSettings.screenOrientation });
  }

  if (shouldRecreateForWritingModeChange(previousViewSettings, viewSettings)) {
    recreateViewer(envConfig, bookKey);
  }
};

export const restoreCurrentBookReaderAppearanceDefaults = async (
  envConfig: EnvConfigType,
  bookKey: string,
  defaults: ViewSettings,
  options: RestoreReaderAppearanceOptions = {},
) => {
  const { settings } = useSettingsStore.getState();
  const { getViewSettings, getViewState, setViewSettings } = useReaderStore.getState();
  const { getConfig, saveConfig } = useBookDataStore.getState();
  const currentViewSettings = getViewSettings(bookKey);
  if (!currentViewSettings) return null;

  const nextViewSettings = restoreReaderAppearanceDefaults(
    currentViewSettings,
    defaults,
    options.categories,
  );
  setViewSettings(bookKey, nextViewSettings);
  await applyReaderAppearanceToOpenView(
    envConfig,
    bookKey,
    currentViewSettings,
    nextViewSettings,
    options.appService,
  );

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
