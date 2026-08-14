import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: {
    updatedAt: 1,
    viewSettings: { defaultFontSize: 16 },
    viewSettingsOverrideKeys: [] as string[],
  },
  viewSettings: { defaultFontSize: 16 },
  saveConfig: vi.fn(),
  setConfig: vi.fn(),
  setViewSettings: vi.fn(),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      settings: {},
      isSettingsGlobal: false,
      setSettings: vi.fn(),
    }),
  },
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: {
    getState: () => ({
      bookKeys: ['book:test'],
      getView: vi.fn(),
      getViewState: () => ({ isPrimary: true }),
      getViewSettings: () => mocks.viewSettings,
      setViewSettings: mocks.setViewSettings,
    }),
  },
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: {
    getState: () => ({
      getConfig: () => mocks.config,
      saveConfig: mocks.saveConfig,
      setConfig: mocks.setConfig,
    }),
  },
}));

vi.mock('@/services/settings/settingsService', () => ({
  settingsService: { updateGlobalViewSetting: vi.fn() },
}));

vi.mock('@/utils/style', () => ({ getStyles: vi.fn() }));
vi.mock('@/app/reader/utils/readerLayoutContract', () => ({
  LEGACY_READER_LAYOUT_KEYS: [],
  mergeViewSettingsWithLegacyLayout: (global: unknown, overrides: unknown) => ({
    ...(global as object),
    ...(overrides as object),
  }),
  migrateLegacyReaderLayoutSettings: (settings: unknown) => settings,
  normalizeLegacyReaderLayoutSettings: (settings: unknown) => settings,
  stripLegacyReaderLayoutFields: (settings: unknown) => settings,
}));

import { saveViewSettings } from '@/helpers/settings';
import { deserializeConfig, serializeConfig } from '@/utils/serializer';

describe('saveViewSettings', () => {
  beforeEach(() => {
    mocks.config.viewSettingsOverrideKeys = [];
    mocks.viewSettings = { defaultFontSize: 16 };
    mocks.saveConfig.mockReset();
    mocks.setConfig.mockReset();
    mocks.setViewSettings.mockReset();
  });

  it('does not convert a book-scoped hydration no-op into an override', async () => {
    await saveViewSettings({} as never, 'book:test', 'defaultFontSize', 16, true);

    expect(mocks.setViewSettings).not.toHaveBeenCalled();
    expect(mocks.setConfig).not.toHaveBeenCalled();
    expect(mocks.saveConfig).not.toHaveBeenCalled();

    const restored = deserializeConfig(
      serializeConfig(mocks.config as never, { defaultFontSize: 16 } as never, {} as never),
      { defaultFontSize: 24 } as never,
      {} as never,
    );
    expect(restored.viewSettings?.defaultFontSize).toBe(24);
  });

  it('records a changed book-scoped value as an override even when it becomes global-equal', async () => {
    mocks.viewSettings = { defaultFontSize: 18 };

    await saveViewSettings({} as never, 'book:test', 'defaultFontSize', 16, true);

    expect(mocks.setConfig).toHaveBeenCalledWith(
      'book:test',
      expect.objectContaining({
        viewSettings: { defaultFontSize: 16 },
        viewSettingsOverrideKeys: ['defaultFontSize'],
      }),
    );
    expect(mocks.saveConfig).toHaveBeenCalledOnce();

    const [, savedConfig] = mocks.setConfig.mock.calls[0]!;
    const restored = deserializeConfig(
      serializeConfig(savedConfig as never, { defaultFontSize: 16 } as never, {} as never),
      { defaultFontSize: 24 } as never,
      {} as never,
    );
    expect(restored.viewSettings?.defaultFontSize).toBe(16);
  });
});
