import { describe, expect, it } from 'vitest';
import type { ViewSettings } from '@/types/book';
import {
  getEffectiveReaderChromeVisibility,
  getEffectiveReaderViewInsets,
  getEffectiveReaderViewportStyles,
  getInitialReaderViewSettings,
  getReaderBookCapability,
  mergeViewSettingsWithLegacyLayout,
  normalizeLegacyReaderLayoutSettings,
  normalizeReaderLayout,
  setParagraphMode,
  setReaderLayoutMode,
  stripLegacyReaderLayoutFields,
} from '@/app/reader/utils/readerLayoutContract';

const settings = (overrides: Partial<ViewSettings> = {}) =>
  ({
    layoutMode: 'paged',
    textContinuousSections: false,
    pageZoomLevel: 100,
    pageZoomMode: 'fit-page',
    pageSpreadMode: 'auto',
    keepCoverSpread: true,
    scrollingOverlap: 0,
    paragraphMode: { enabled: false },
    ...overrides,
  }) as ViewSettings;

const insetSettings = (overrides: Partial<ViewSettings> = {}) =>
  settings({
    showHeader: true,
    showFooter: true,
    vertical: false,
    writingMode: 'horizontal-tb',
    marginTopPx: 44,
    marginBottomPx: 48,
    marginLeftPx: 20,
    marginRightPx: 22,
    compactMarginTopPx: 16,
    compactMarginBottomPx: 18,
    compactMarginLeftPx: 6,
    compactMarginRightPx: 8,
    ...overrides,
  });

describe('readerLayoutContract', () => {
  it('keeps desktop text books paged by default', () => {
    const state = normalizeReaderLayout({
      settings: settings(),
      book: { format: 'epub' },
      platform: { isMobile: false },
    });

    expect(state).toMatchObject({
      bookCapability: 'text',
      layoutMode: 'paged',
      textContinuousSections: false,
    });
  });

  it('preserves mobile text-reader default as continuous when no per-book layout exists', () => {
    const state = normalizeReaderLayout({
      settings: {},
      book: { format: 'epub' },
      platform: { isMobile: true },
    });
    const initial = getInitialReaderViewSettings({
      globalViewSettings: settings({ layoutMode: 'paged', textContinuousSections: false }),
      configViewSettings: {},
      book: { format: 'epub' },
      platform: { isMobile: true },
    });

    expect(state).toMatchObject({
      bookCapability: 'text',
      layoutMode: 'continuous',
      textContinuousSections: true,
    });
    expect(initial).toMatchObject({
      layoutMode: 'continuous',
      textContinuousSections: true,
    });
  });

  it('treats fixed layout, PDF, and CBZ as page-capable books', () => {
    expect(getReaderBookCapability({ renditionLayout: 'pre-paginated' })).toBe('page');
    expect(getReaderBookCapability({ format: 'pdf' })).toBe('page');
    expect(getReaderBookCapability({ format: 'cbz' })).toBe('page');
    expect(getReaderBookCapability({ format: 'epub' })).toBe('text');
  });

  it('suppresses legacy chrome for mobile-web page-capability books only', () => {
    const chrome = getEffectiveReaderChromeVisibility({
      settings: settings({ showHeader: true, showFooter: true }),
      book: { format: 'pdf' },
      platform: { isMobile: true, isIOSApp: false, isAndroidApp: false },
    });

    expect(chrome).toEqual({ showHeader: false, showFooter: false });
  });

  it('preserves mobile-web text and non-mobile page-book chrome settings', () => {
    const visibleChrome = settings({ showHeader: true, showFooter: true });

    expect(
      getEffectiveReaderChromeVisibility({
        settings: visibleChrome,
        book: { format: 'epub' },
        platform: { isMobile: true, isIOSApp: false, isAndroidApp: false },
      }),
    ).toEqual({ showHeader: true, showFooter: true });
    expect(
      getEffectiveReaderChromeVisibility({
        settings: visibleChrome,
        book: { format: 'pdf' },
        platform: { isMobile: false },
      }),
    ).toEqual({ showHeader: true, showFooter: true });
    expect(
      getEffectiveReaderChromeVisibility({
        settings: visibleChrome,
        book: { format: 'pdf' },
        platform: { isMobile: true, isIOSApp: true, isAndroidApp: false },
      }),
    ).toEqual({ showHeader: true, showFooter: true });
    expect(
      getEffectiveReaderChromeVisibility({
        settings: settings({ showHeader: false, showFooter: false }),
        book: { format: 'epub' },
        platform: { isMobile: true, isIOSApp: false, isAndroidApp: false },
      }),
    ).toEqual({ showHeader: false, showFooter: false });
  });

  it('zeros legacy top and bottom view insets for mobile-web page-capability books', () => {
    const insets = getEffectiveReaderViewInsets({
      settings: insetSettings(),
      book: { format: 'pdf' },
      platform: { isMobile: true, isIOSApp: false, isAndroidApp: false },
    });

    expect(insets).toEqual({ top: 0, right: 8, bottom: 0, left: 6 });
  });

  it('preserves compact/full view insets outside mobile-web page books', () => {
    const visible = insetSettings();
    const hidden = insetSettings({ showHeader: false, showFooter: false });

    expect(
      getEffectiveReaderViewInsets({
        settings: visible,
        book: { format: 'epub' },
        platform: { isMobile: true, isIOSApp: false, isAndroidApp: false },
      }),
    ).toEqual({ top: 44, right: 8, bottom: 48, left: 6 });
    expect(
      getEffectiveReaderViewInsets({
        settings: visible,
        book: { format: 'pdf' },
        platform: { isMobile: false },
      }),
    ).toEqual({ top: 44, right: 8, bottom: 48, left: 6 });
    expect(
      getEffectiveReaderViewInsets({
        settings: hidden,
        book: { format: 'epub' },
        platform: { isMobile: true, isIOSApp: false, isAndroidApp: false },
      }),
    ).toEqual({ top: 16, right: 8, bottom: 18, left: 6 });
  });

  it('uses a page-colored viewport background only for mobile-web page books', () => {
    expect(
      getEffectiveReaderViewportStyles({
        settings: insetSettings(),
        book: { format: 'pdf' },
        platform: { isMobile: true, isIOSApp: false, isAndroidApp: false },
      }),
    ).toEqual({ backgroundColor: '#ffffff' });
    expect(
      getEffectiveReaderViewportStyles({
        settings: insetSettings(),
        book: { format: 'epub' },
        platform: { isMobile: true, isIOSApp: false, isAndroidApp: false },
      }),
    ).toEqual({});
    expect(
      getEffectiveReaderViewportStyles({
        settings: insetSettings(),
        book: { format: 'pdf' },
        platform: { isMobile: false },
      }),
    ).toEqual({});
  });

  it('migrates legacy layout fields into canonical fields', () => {
    const migrated = normalizeLegacyReaderLayoutSettings({
      scrolled: true,
      continuousScroll: true,
      zoomLevel: 150,
      zoomMode: 'fit-width',
      spreadMode: 'none',
    });

    expect(migrated).toMatchObject({
      layoutMode: 'continuous',
      textContinuousSections: true,
      pageZoomLevel: 150,
      pageZoomMode: 'fit-width',
      pageSpreadMode: 'none',
    });
    expect(stripLegacyReaderLayoutFields(migrated)).not.toHaveProperty('scrolled');
  });

  it('merges legacy layout before source precedence so canonical values win', () => {
    const merged = mergeViewSettingsWithLegacyLayout(
      { scrolled: true, continuousScroll: true, zoomLevel: 125 },
      { layoutMode: 'paged', pageZoomLevel: 175 },
    );

    expect(merged).toMatchObject({
      layoutMode: 'paged',
      textContinuousSections: true,
      pageZoomLevel: 175,
    });
    expect(stripLegacyReaderLayoutFields(merged)).not.toHaveProperty('scrolled');
  });

  it('lets newer legacy source override older canonical source only after migration', () => {
    const merged = mergeViewSettingsWithLegacyLayout(
      { layoutMode: 'paged', textContinuousSections: false },
      { scrolled: true, continuousScroll: true },
    );

    expect(merged).toMatchObject({
      layoutMode: 'continuous',
      textContinuousSections: true,
    });
  });

  it('normalizes stale text paragraph settings when switching to continuous layout', () => {
    const next = setReaderLayoutMode(settings({ paragraphMode: { enabled: true } }), 'continuous');
    const state = normalizeReaderLayout({ settings: next, book: { format: 'epub' }, platform: {} });

    expect(next.paragraphMode?.enabled).toBe(false);
    expect(state.layoutMode).toBe('continuous');
    expect(state.paragraphModeEnabled).toBe(false);
  });

  it('preserves explicit mobile text-reader paged layout settings', () => {
    const initial = getInitialReaderViewSettings({
      globalViewSettings: settings({ layoutMode: 'continuous', textContinuousSections: true }),
      configViewSettings: { layoutMode: 'paged', textContinuousSections: false },
      book: { format: 'epub' },
      platform: { isMobile: true },
    });

    expect(initial).toMatchObject({
      layoutMode: 'paged',
      textContinuousSections: false,
    });
  });

  it('normalizes stale page-book settings at the reader state boundary', () => {
    const initial = getInitialReaderViewSettings({
      globalViewSettings: settings({ layoutMode: 'continuous', textContinuousSections: true }),
      configViewSettings: { paragraphMode: { enabled: true } },
      book: { renditionLayout: 'pre-paginated' },
      platform: {},
    });
    const state = normalizeReaderLayout({
      settings: initial,
      book: { renditionLayout: 'pre-paginated' },
      platform: {},
    });

    expect(state).toMatchObject({
      bookCapability: 'page',
      layoutMode: 'continuous',
      textContinuousSections: false,
      paragraphModeEnabled: false,
    });
  });

  it('makes paragraph mode text-only and mutually exclusive with continuous layout', () => {
    const enabled = setParagraphMode(settings({ layoutMode: 'continuous' }), true);
    const disabled = setParagraphMode(settings({ paragraphMode: { enabled: true } }), false);

    expect(enabled.layoutMode).toBe('paged');
    expect(enabled.textContinuousSections).toBe(false);
    expect(enabled.paragraphMode?.enabled).toBe(true);
    expect(disabled.paragraphMode?.enabled).toBe(false);
  });
});
