import { migrateBookConfigTombstones } from '@/services/compatibility/tombstones';
import { BookConfig, BookSearchConfig, ViewSettings } from '@/types/book';
import {
  mergeViewSettingsWithLegacyLayout,
  migrateLegacyReaderLayoutSettings,
  stripLegacyReaderLayoutFields,
} from '@/app/reader/utils/readerLayoutContract';

export const serializeConfig = (
  config: BookConfig,
  globalViewSettings: ViewSettings,
  defaultSearchConfig: BookSearchConfig,
): string => {
  config = migrateBookConfigTombstones(JSON.parse(JSON.stringify(config)) as BookConfig).value;
  const viewSettings = stripLegacyReaderLayoutFields(
    migrateLegacyReaderLayoutSettings(config.viewSettings ?? {}),
  );
  const searchConfig = (config.searchConfig ?? {}) as Partial<BookSearchConfig>;
  config.viewSettings = Object.entries(viewSettings).reduce(
    (acc: Partial<Record<keyof ViewSettings, unknown>>, [key, value]) => {
      if (globalViewSettings[key as keyof ViewSettings] !== value) {
        acc[key as keyof ViewSettings] = value;
      }
      return acc;
    },
    {} as Partial<Record<keyof ViewSettings, unknown>>,
  ) as Partial<ViewSettings>;
  config.searchConfig = Object.entries(searchConfig).reduce(
    (acc: Partial<Record<keyof BookSearchConfig, unknown>>, [key, value]) => {
      if (defaultSearchConfig[key as keyof BookSearchConfig] !== value) {
        acc[key as keyof BookSearchConfig] = value;
      }
      return acc;
    },
    {} as Partial<BookSearchConfig>,
  ) as Partial<BookSearchConfig>;

  return JSON.stringify(config);
};

export const deserializeConfig = (
  str: string,
  globalViewSettings: ViewSettings,
  defaultSearchConfig: BookSearchConfig,
): BookConfig => {
  const persistedConfig = JSON.parse(str) as BookConfig;
  const hasPersistedConfig = Object.keys(persistedConfig).length > 0;
  const config = migrateBookConfigTombstones(persistedConfig).value;
  const { viewSettings, searchConfig } = config;
  config.viewSettings = mergeViewSettingsWithLegacyLayout(
    globalViewSettings,
    migrateBookConfigTombstones({
      ...config,
      viewSettings,
    }).value.viewSettings ?? {},
  );
  config.searchConfig = { ...defaultSearchConfig, ...searchConfig };
  config.updatedAt ??= hasPersistedConfig ? Date.now() : 0;
  return config;
};

export const compressConfig = (
  config: BookConfig,
  globalViewSettings: ViewSettings,
  defaultSearchConfig: BookSearchConfig,
): string => {
  return JSON.parse(serializeConfig(config, globalViewSettings, defaultSearchConfig));
};
