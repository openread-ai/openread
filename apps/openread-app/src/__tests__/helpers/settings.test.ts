import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViewSettings } from '@/types/book';
import {
  markCurrentBookReaderAppearanceResetEcho,
  restoreCurrentBookReaderAppearanceDefaults,
  saveViewSettings,
} from '@/helpers/settings';

const mockState = vi.hoisted(() => {
  const globalViewSettings = {
    defaultFontSize: 22,
    lineHeight: 2.2,
    overrideColor: true,
    uiLanguage: 'fr',
    userStylesheet: 'body { color: red; }',
    disableClick: true,
    proofreadRules: [{ id: 'global-rule' }],
  } as ViewSettings;
  const settings = {
    globalViewSettings,
    globalReadSettings: { theme: 'dark' },
    telemetryEnabled: true,
  };
  const targetViewSettings = {
    defaultFont: 'Serif',
    defaultFontSize: 24,
    overrideFont: true,
    lineHeight: 2.4,
    marginTopPx: 80,
    pageZoomLevel: 175,
    pageZoomMode: 'fit-page',
    pageSpreadMode: 'auto',
    keepCoverSpread: false,
    writingMode: 'vertical-rl',
    vertical: true,
    progressStyle: 'percentage',
    screenOrientation: 'landscape',
    overrideColor: true,
    invertImgColorInDark: true,
    backgroundTextureId: 'paper',
    backgroundOpacity: 0.9,
    backgroundSize: 'contain',
    readingRulerEnabled: true,
    readingRulerColor: 'yellow',
    ttsHighlightOptions: { style: 'underline', color: '#ff0000' },
    uiLanguage: 'de',
    translationEnabled: true,
    userStylesheet: '.reader { color: red; }',
    disableClick: true,
    proofreadRules: [{ id: 'book-rule' }],
  } as ViewSettings;
  const otherBookViewSettings = {
    ...targetViewSettings,
    defaultFontSize: 30,
    lineHeight: 3,
    uiLanguage: 'es',
  } as ViewSettings;
  const defaults = {
    defaultFont: 'Sans-serif',
    defaultFontSize: 16,
    overrideFont: false,
    lineHeight: 1.6,
    marginTopPx: 44,
    pageZoomLevel: 100,
    pageZoomMode: 'fit-width',
    pageSpreadMode: 'none',
    keepCoverSpread: true,
    writingMode: 'auto',
    vertical: false,
    progressStyle: 'fraction',
    screenOrientation: 'auto',
    overrideColor: false,
    invertImgColorInDark: false,
    backgroundTextureId: 'none',
    backgroundOpacity: 0.6,
    backgroundSize: 'cover',
    readingRulerEnabled: false,
    readingRulerColor: 'transparent',
    ttsHighlightOptions: { style: 'highlight', color: '#808080' },
    uiLanguage: 'en',
    translationEnabled: false,
    userStylesheet: '',
    disableClick: false,
    proofreadRules: [],
  } as unknown as ViewSettings;
  const renderer = {
    setStyles: vi.fn(),
    setAttribute: vi.fn(),
  };
  const view = {
    renderer,
    book: { dir: 'ltr' },
  };
  const setViewSettings = vi.fn();
  const saveConfig = vi.fn(async () => undefined);
  const setSettings = vi.fn();
  const settingsServiceUpdate = vi.fn();
  const updateGlobalViewSetting = vi.fn(async () => settings);
  const config = {
    viewSettings: targetViewSettings,
    progress: { location: 'chapter-1' },
    booknotes: [{ id: 'note-1' }],
  };
  const bookDoc = {
    dir: 'ltr',
    sections: [{ pageSpread: 'left' }],
  };

  return {
    settings,
    globalViewSettings,
    targetViewSettings,
    otherBookViewSettings,
    defaults,
    renderer,
    view,
    setViewSettings,
    saveConfig,
    setSettings,
    settingsServiceUpdate,
    updateGlobalViewSetting,
    config,
    bookDoc,
  };
});

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      settings: mockState.settings,
      isSettingsGlobal: true,
      setSettings: mockState.setSettings,
    }),
  },
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: {
    getState: () => ({
      bookKeys: ['book-1', 'book-2'],
      getViewSettings: (bookKey: string) =>
        bookKey === 'book-1' ? mockState.targetViewSettings : mockState.otherBookViewSettings,
      getViewState: (bookKey: string) => (bookKey === 'book-1' ? { isPrimary: true } : null),
      getView: (bookKey: string) => (bookKey === 'book-1' ? mockState.view : null),
      setViewSettings: mockState.setViewSettings,
      recreateViewer: vi.fn(),
    }),
  },
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: {
    getState: () => ({
      getConfig: (bookKey: string) => (bookKey === 'book-1' ? mockState.config : null),
      saveConfig: mockState.saveConfig,
      getBookDataByReaderKey: (bookKey: string) =>
        bookKey === 'book-1' ? { bookDoc: mockState.bookDoc } : null,
    }),
  },
}));

vi.mock('@/services/settings/settingsService', () => ({
  settingsService: {
    update: mockState.settingsServiceUpdate,
    updateKey: vi.fn(),
    updateGlobalViewSetting: mockState.updateGlobalViewSetting,
  },
}));

vi.mock('@/store/customTextureStore', () => ({
  useCustomTextureStore: {
    getState: () => ({
      applyTexture: vi.fn(async () => undefined),
    }),
  },
}));

vi.mock('@/utils/bridge', () => ({
  lockScreenOrientation: vi.fn(async () => undefined),
}));

vi.mock('@/utils/style', () => ({
  getStyles: vi.fn(() => ({ fontSize: '16px' })),
}));

describe('restoreCurrentBookReaderAppearanceDefaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.updateGlobalViewSetting.mockResolvedValue(mockState.settings);
    mockState.bookDoc.sections[0]!.pageSpread = 'left';
  });

  it('resets and persists only the target book appearance while preserving global settings, other books, and non-appearance data', async () => {
    const restored = await restoreCurrentBookReaderAppearanceDefaults(
      {} as never,
      'book-1',
      mockState.defaults,
    );

    expect(restored).toEqual(
      expect.objectContaining({
        defaultFont: 'Sans-serif',
        defaultFontSize: 16,
        overrideFont: false,
        lineHeight: 1.6,
        marginTopPx: 44,
        pageZoomLevel: 100,
        pageZoomMode: 'fit-width',
        pageSpreadMode: 'none',
        keepCoverSpread: true,
        writingMode: 'auto',
        vertical: false,
        progressStyle: 'fraction',
        screenOrientation: 'auto',
        overrideColor: false,
        invertImgColorInDark: false,
        backgroundTextureId: 'none',
        backgroundOpacity: 0.6,
        backgroundSize: 'cover',
        readingRulerEnabled: false,
        readingRulerColor: 'transparent',
        ttsHighlightOptions: { style: 'highlight', color: '#808080' },
      }),
    );
    expect(restored).toEqual(
      expect.objectContaining({
        uiLanguage: 'de',
        translationEnabled: true,
        userStylesheet: '.reader { color: red; }',
        disableClick: true,
        proofreadRules: [{ id: 'book-rule' }],
      }),
    );

    expect(mockState.setViewSettings).toHaveBeenCalledTimes(1);
    expect(mockState.setViewSettings).toHaveBeenCalledWith('book-1', restored);
    expect(mockState.setViewSettings).not.toHaveBeenCalledWith('book-2', expect.anything());
    expect(mockState.otherBookViewSettings).toEqual(
      expect.objectContaining({ defaultFontSize: 30, lineHeight: 3, uiLanguage: 'es' }),
    );

    expect(mockState.saveConfig).toHaveBeenCalledTimes(1);
    expect(mockState.saveConfig).toHaveBeenCalledWith(
      {},
      'book-1',
      expect.objectContaining({
        progress: { location: 'chapter-1' },
        booknotes: [{ id: 'note-1' }],
        viewSettings: restored,
      }),
      mockState.settings,
    );
    expect(mockState.setSettings).not.toHaveBeenCalled();
    expect(mockState.settingsServiceUpdate).not.toHaveBeenCalled();
    expect(mockState.settings.globalViewSettings).toBe(mockState.globalViewSettings);

    expect(mockState.renderer.setStyles).toHaveBeenCalledWith({ fontSize: '16px' });
    expect(mockState.renderer.setAttribute).toHaveBeenCalledWith('scale-factor', 100);
    expect(mockState.renderer.setAttribute).toHaveBeenCalledWith('zoom', 'fit-width');
    expect(mockState.renderer.setAttribute).toHaveBeenCalledWith('spread', 'none');
    expect(mockState.bookDoc.sections[0]!.pageSpread).toBe('');
    expect(mockState.view.book.dir).toBe('ltr');
  });

  it('suppresses reset-induced local state echoes so global defaults are not mutated', async () => {
    markCurrentBookReaderAppearanceResetEcho('book-1', 'defaultFontSize', 16);

    await saveViewSettings({} as never, 'book-1', 'defaultFontSize', 16);

    expect(mockState.updateGlobalViewSetting).not.toHaveBeenCalled();
    expect(mockState.setSettings).not.toHaveBeenCalled();
    expect(mockState.setViewSettings).not.toHaveBeenCalled();
    expect(mockState.saveConfig).not.toHaveBeenCalled();

    await saveViewSettings({} as never, 'book-1', 'defaultFontSize', 18);

    expect(mockState.updateGlobalViewSetting).toHaveBeenCalledWith(
      {},
      mockState.settings,
      'defaultFontSize',
      18,
    );
  });
});
