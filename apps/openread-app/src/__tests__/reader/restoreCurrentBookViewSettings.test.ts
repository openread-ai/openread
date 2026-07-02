import { describe, expect, it, vi } from 'vitest';

import {
  applyCurrentBookDefaultViewSettingsToRenderer,
  buildCurrentBookDefaultViewSettings,
  restoreCurrentBookViewSettings,
} from '@/app/reader/utils/restoreCurrentBookViewSettings';
import {
  DEFAULT_ANNOTATOR_CONFIG,
  DEFAULT_BOOK_FONT,
  DEFAULT_BOOK_LANGUAGE,
  DEFAULT_BOOK_LAYOUT,
  DEFAULT_BOOK_STYLE,
  DEFAULT_SCREEN_CONFIG,
  DEFAULT_TRANSLATOR_CONFIG,
  DEFAULT_TTS_CONFIG,
  DEFAULT_VIEW_CONFIG,
} from '@/services/constants';
import type { BookConfig, ViewSettings } from '@/types/book';
import type { BookDoc } from '@/libs/document';
import type { FoliateView } from '@/types/view';
import type { EnvConfigType } from '@/services/environment';
import type { SystemSettings } from '@/types/settings';

const viewSettings = (overrides: Partial<ViewSettings> = {}): ViewSettings => ({
  ...DEFAULT_BOOK_LAYOUT,
  ...DEFAULT_BOOK_STYLE,
  ...DEFAULT_BOOK_FONT,
  ...DEFAULT_BOOK_LANGUAGE,
  ...DEFAULT_VIEW_CONFIG,
  ...DEFAULT_TTS_CONFIG,
  ...DEFAULT_SCREEN_CONFIG,
  ...DEFAULT_ANNOTATOR_CONFIG,
  ...DEFAULT_TRANSLATOR_CONFIG,
  paragraphMode: { enabled: false },
  ...overrides,
});

const renderer = () =>
  ({
    setAttribute: vi.fn(),
    setStyles: vi.fn(),
  }) as unknown as FoliateView['renderer'];

describe('current-book reader restore defaults contract', () => {
  it('resets the canonical appearance allowlist and preserves non-appearance settings', () => {
    const defaults = viewSettings({
      defaultFont: 'Serif',
      defaultFontSize: 16,
      layoutMode: 'paged',
      lineHeight: 1.4,
      backgroundTextureId: 'none',
      ttsHighlightOptions: { style: 'highlight', color: '#808080' },
    });
    const current = viewSettings({
      defaultFont: 'OpenDyslexic',
      defaultFontSize: 24,
      layoutMode: 'continuous',
      lineHeight: 2,
      backgroundTextureId: 'custom-texture',
      theme: 'legacy-book-theme',
      ttsHighlightOptions: { style: 'underline', color: '#ff0000' },
      translationEnabled: true,
      ttsRate: 2,
      sideBarTab: 'bookmarks',
      sortedTOC: true,
      disableClick: true,
    });

    const next = buildCurrentBookDefaultViewSettings(current, defaults);

    expect(next.defaultFont).toBe('Serif');
    expect(next.defaultFontSize).toBe(16);
    expect(next.layoutMode).toBe('paged');
    expect(next.lineHeight).toBe(1.4);
    expect(next.backgroundTextureId).toBe('none');
    expect(next.ttsHighlightOptions).toEqual({ style: 'highlight', color: '#808080' });
    expect(next.theme).toBe('legacy-book-theme');
    expect(next.translationEnabled).toBe(true);
    expect(next.ttsRate).toBe(2);
    expect(next.sideBarTab).toBe('bookmarks');
    expect(next.sortedTOC).toBe(true);
    expect(next.disableClick).toBe(true);
  });

  it('updates the open reader before persisting the current book config exactly once', async () => {
    const events: string[] = [];
    const defaults = viewSettings({ defaultFontSize: 16, backgroundTextureId: 'none' });
    const current = viewSettings({ defaultFontSize: 28, backgroundTextureId: 'paper' });
    const config: BookConfig = {
      updatedAt: 10,
      location: 'epubcfi(/6/2)',
      progress: [3, 10],
      booknotes: [
        {
          id: 'note-1',
          type: 'bookmark',
          note: '',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      searchConfig: {
        scope: 'book',
        matchCase: true,
        matchWholeWords: false,
        matchDiacritics: false,
      },
      viewSettings: current,
    };
    const setViewSettings = vi.fn(() => events.push('set'));
    const saveConfig = vi.fn(async (_envConfig, _bookKey, nextConfig: BookConfig) => {
      events.push('save');
      expect(events).toEqual(['set', 'save']);
      expect(nextConfig).toMatchObject({
        location: 'epubcfi(/6/2)',
        progress: [3, 10],
        searchConfig: config.searchConfig,
      });
      expect(nextConfig.booknotes).toBe(config.booknotes);
      expect(nextConfig.viewSettings?.defaultFontSize).toBe(16);
      expect(nextConfig.viewSettings?.backgroundTextureId).toBe('none');
    });
    const openRenderer = renderer();

    const next = await restoreCurrentBookViewSettings({
      envConfig: {} as EnvConfigType,
      bookKey: 'reader:book-a',
      config,
      settings: {} as SystemSettings,
      currentViewSettings: current,
      defaultViewSettings: defaults,
      book: { format: 'epub' },
      platform: { isMobile: true },
      renderer: openRenderer,
      setViewSettings,
      saveConfig,
    });

    expect(next.defaultFontSize).toBe(16);
    expect(setViewSettings).toHaveBeenCalledOnce();
    expect(setViewSettings).toHaveBeenCalledWith('reader:book-a', next);
    expect(saveConfig).toHaveBeenCalledOnce();
    expect(openRenderer.setStyles).toHaveBeenCalled();
  });

  it('applies page-book renderer zoom spread and cover-spread side effects immediately', () => {
    const openRenderer = renderer();
    const bookDoc = {
      dir: 'rtl',
      metadata: { language: 'ar' },
      rendition: { layout: 'pre-paginated', spread: 'none' },
      sections: [{ pageSpread: 'right' }],
    } as unknown as BookDoc;
    const settings = viewSettings({
      layoutMode: 'paged',
      pageZoomMode: 'fit-page',
      pageZoomLevel: 100,
      pageSpreadMode: 'auto',
      keepCoverSpread: true,
    });

    applyCurrentBookDefaultViewSettingsToRenderer({
      renderer: openRenderer,
      viewSettings: settings,
      book: { renditionLayout: 'pre-paginated', format: 'epub' },
      platform: { isMobile: true },
      bookDoc,
    });

    expect(openRenderer.setAttribute).toHaveBeenCalledWith('zoom', 'fit-page');
    expect(openRenderer.setAttribute).toHaveBeenCalledWith('spread', 'auto');
    expect(openRenderer.setAttribute).toHaveBeenCalledWith('scale-factor', 100);
    expect(bookDoc.rendition?.spread).toBe('auto');
    expect(bookDoc.sections?.[0]?.pageSpread).toBe('');
  });
});
