import { describe, expect, it } from 'vitest';
import type { ViewSettings } from '@/types/book';
import {
  canUseParagraphMode,
  canUseScrolledMode,
  getInitialReaderViewSettings,
  getReaderMode,
  normalizeReaderMode,
  setContinuousScroll,
  setParagraphMode,
  setScrolledMode,
} from '@/app/reader/utils/readerMode';

const settings = (overrides: Partial<ViewSettings> = {}) =>
  ({
    scrolled: false,
    continuousScroll: false,
    scrollingOverlap: 0,
    paragraphMode: { enabled: false },
    ...overrides,
  }) as ViewSettings;

describe('readerMode', () => {
  it('keeps desktop reflowable books in page-by-page mode by default', () => {
    const mode = getReaderMode(settings(), { platform: { isMobile: false } });

    expect(mode).toMatchObject({ mode: 'paged', scrolled: false, continuousScroll: false });
  });

  it('canonicalizes mobile reflowable books to scrolled continuous reading', () => {
    const normalized = normalizeReaderMode(settings(), { platform: { isMobile: true } });

    expect(normalized.scrolled).toBe(true);
    expect(normalized.continuousScroll).toBe(true);
    expect(normalized.paragraphMode?.enabled).toBe(false);
  });

  it('prevents fixed-layout books from using scroll or paragraph modes', () => {
    const normalized = normalizeReaderMode(
      settings({ scrolled: true, continuousScroll: true, paragraphMode: { enabled: true } }),
      { book: { isFixedLayout: true } },
    );

    expect(normalized.scrolled).toBe(false);
    expect(normalized.continuousScroll).toBe(false);
    expect(normalized.paragraphMode?.enabled).toBe(false);
  });

  it('normalizes stale fixed-layout settings at the reader state boundary', () => {
    const initial = getInitialReaderViewSettings({
      globalViewSettings: settings({ scrolled: true, continuousScroll: true }),
      configViewSettings: { paragraphMode: { enabled: true } },
      context: { book: { renditionLayout: 'pre-paginated' } },
    });

    expect(initial.scrolled).toBe(false);
    expect(initial.continuousScroll).toBe(false);
    expect(initial.paragraphMode?.enabled).toBe(false);
    expect(getReaderMode(initial, { book: { renditionLayout: 'pre-paginated' } })).toMatchObject({
      mode: 'fixed-layout',
      scrolled: false,
      continuousScroll: false,
      paragraphMode: false,
    });
  });

  it('makes continuous scroll imply scrolled mode and disables paragraph mode', () => {
    const normalized = setContinuousScroll(
      settings({ paragraphMode: { enabled: true } }),
      { platform: { isMobile: false } },
      true,
    );

    expect(normalized.scrolled).toBe(true);
    expect(normalized.continuousScroll).toBe(true);
    expect(normalized.paragraphMode?.enabled).toBe(false);
  });

  it('makes paragraph mode desktop-only and mutually exclusive with scroll modes', () => {
    const desktop = setParagraphMode(
      settings({ scrolled: true, continuousScroll: true }),
      { platform: { isMobile: false } },
      true,
    );
    const mobile = setParagraphMode(settings(), { platform: { isMobile: true } }, true);

    expect(desktop.scrolled).toBe(false);
    expect(desktop.continuousScroll).toBe(false);
    expect(desktop.paragraphMode?.enabled).toBe(true);
    expect(mobile.paragraphMode?.enabled).toBe(false);
  });

  it('hides desktop-only toggles on unsupported modes', () => {
    expect(canUseScrolledMode({ platform: { isMobile: true } })).toBe(false);
    expect(canUseScrolledMode({ book: { renditionLayout: 'pre-paginated' } })).toBe(false);
    expect(
      canUseParagraphMode(settings({ scrolled: true }), { platform: { isMobile: false } }),
    ).toBe(false);
    expect(canUseParagraphMode(settings(), { platform: { isMobile: false } })).toBe(true);
  });

  it('turns continuous scroll off when scrolled mode is disabled', () => {
    const normalized = setScrolledMode(
      settings({ scrolled: true, continuousScroll: true }),
      { platform: { isMobile: false } },
      false,
    );

    expect(normalized.scrolled).toBe(false);
    expect(normalized.continuousScroll).toBe(false);
  });
});
