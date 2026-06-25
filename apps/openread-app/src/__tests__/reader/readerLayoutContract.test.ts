import { describe, expect, it } from 'vitest';
import type { ViewSettings } from '@/types/book';
import {
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
