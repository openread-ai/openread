import { describe, expect, it, vi } from 'vitest';
import type { BookProgress } from '@/types/book';
import {
  getCanonicalReaderLocation,
  getReaderNavigationTargetFromAICitation,
  navigateReaderToTarget,
} from '@/app/reader/utils/readerLocationContract';
import {
  normalizeReaderLayout,
  type ReaderLayoutPlatformInput,
} from '@/app/reader/utils/readerLayoutContract';
import type { ReaderChapter } from '@/services/ai/tools/bookTools';
import type { BookFormat } from '@/types/book';

const chapters: ReaderChapter[] = [
  { id: 'chapter-1.xhtml', index: 0, title: 'One', text: 'a'.repeat(100) },
  { id: 'chapter-2.xhtml', index: 1, title: 'Two', text: 'b'.repeat(100) },
];
const supportedFormats = [
  'epub',
  'pdf',
  'mobi',
  'azw',
  'azw3',
  'fb2',
  'fbz',
  'cbz',
  'txt',
  'md',
] satisfies BookFormat[];
const pageFormats = new Set<BookFormat>(['pdf', 'cbz']);
const supportedPlatforms: Array<{ name: string; platform: ReaderLayoutPlatformInput }> = [
  { name: 'web', platform: { isMobile: false } },
  { name: 'mobile-web', platform: { isMobile: true } },
  { name: 'desktop-tauri', platform: { isMobile: false } },
  { name: 'ios', platform: { isMobile: true, isIOSApp: true } },
  { name: 'ipados', platform: { isMobile: true, isIOSApp: true } },
  { name: 'android', platform: { isMobile: true, isAndroidApp: true } },
];

describe('readerLocationContract', () => {
  it.each(
    supportedPlatforms.flatMap(({ name, platform }) =>
      supportedFormats.map((format) => ({ platformName: name, platform, format })),
    ),
  )(
    'normalizes canonical AI reader location for $format on $platformName',
    ({ platform, format }) => {
      const isPageFormat = pageFormats.has(format);
      const progress = {
        sectionHref: isPageFormat ? 'page-8.xhtml' : 'chapter-2.xhtml',
        sectionId: 1,
        section: { current: isPageFormat ? 7 : 24, total: isPageFormat ? 40 : 100 },
        pageinfo: { current: isPageFormat ? 2 : 49, total: isPageFormat ? 99 : 200 },
        location: isPageFormat ? 'xpointer(/page[8])' : 'epubcfi(/6/4)',
      } as BookProgress;
      const layoutState = normalizeReaderLayout({
        settings: {},
        book: { format },
        platform,
      });

      const location = getCanonicalReaderLocation({
        progress,
        book: { format },
        layoutState,
      });

      expect(location.bookCapability).toBe(isPageFormat ? 'page' : 'text');
      if (isPageFormat) {
        expect(location).toMatchObject({
          pageNumber: 8,
          pageTotal: 40,
          sectionFraction: undefined,
          xpointer: 'xpointer(/page[8])',
        });
      } else {
        expect(location).toMatchObject({
          sectionHref: 'chapter-2.xhtml',
          sectionIndex: 1,
          sectionFraction: 0.25,
          cfi: 'epubcfi(/6/4)',
        });
        expect(location.pageNumber).toBeUndefined();
      }
    },
  );

  it('uses section fractions for text books', () => {
    const progress = {
      sectionHref: 'chapter-2.xhtml',
      sectionId: 1,
      section: { current: 24, total: 100 },
      pageinfo: { current: 49, total: 200 },
      location: 'epubcfi(/6/4)',
    } as BookProgress;

    const location = getCanonicalReaderLocation({
      progress,
      book: { format: 'epub' },
      layoutState: {
        bookCapability: 'text',
        layoutMode: 'paged',
        textContinuousSections: false,
        scrollingOverlap: 0,
        pageZoomMode: 'fit-page',
        pageZoomLevel: 100,
        pageSpreadMode: 'auto',
        keepCoverSpread: true,
        paragraphModeEnabled: false,
      },
    });

    expect(location).toMatchObject({
      bookCapability: 'text',
      sectionHref: 'chapter-2.xhtml',
      sectionIndex: 1,
      sectionFraction: 0.25,
      progressFraction: 0.25,
      cfi: 'epubcfi(/6/4)',
    });
  });

  it('uses page numbers for page-capable books instead of fake text fractions', () => {
    const progress = {
      sectionHref: 'page-10.xhtml',
      section: { current: 9, total: 50 },
      pageinfo: { current: 9, total: 50 },
      location: 'xpointer(/page[10])',
    } as BookProgress;

    const location = getCanonicalReaderLocation({
      progress,
      book: { format: 'pdf' },
      layoutState: {
        bookCapability: 'page',
        layoutMode: 'paged',
        textContinuousSections: false,
        scrollingOverlap: 0,
        pageZoomMode: 'fit-page',
        pageZoomLevel: 100,
        pageSpreadMode: 'auto',
        keepCoverSpread: true,
        paragraphModeEnabled: false,
      },
    });

    expect(location).toMatchObject({
      bookCapability: 'page',
      pageNumber: 10,
      pageTotal: 50,
      sectionFraction: undefined,
      xpointer: 'xpointer(/page[10])',
    });
  });

  it('prefers section progress over pageinfo counters for page-capable books', () => {
    const progress = {
      sectionHref: 'pdf-page-7',
      sectionId: 6,
      section: { current: 6, total: 42 },
      pageinfo: { current: 0, total: 1 },
      location: 'xpointer(/page[7])',
    } as BookProgress;

    const location = getCanonicalReaderLocation({
      progress,
      book: { format: 'pdf' },
      layoutState: {
        bookCapability: 'page',
        layoutMode: 'paged',
        textContinuousSections: false,
        scrollingOverlap: 0,
        pageZoomMode: 'fit-page',
        pageZoomLevel: 100,
        pageSpreadMode: 'auto',
        keepCoverSpread: true,
        paragraphModeEnabled: false,
      },
    });

    expect(location).toMatchObject({
      bookCapability: 'page',
      pageNumber: 7,
      pageTotal: 42,
      sectionFraction: undefined,
    });
  });

  it('routes text citations to text locations', () => {
    const target = getReaderNavigationTargetFromAICitation({
      offset: 150,
      chapters,
      location: {
        bookCapability: 'text',
        layoutMode: 'paged',
        sectionHref: 'chapter-2.xhtml',
        sectionFraction: 0.5,
      },
    });

    expect(target).toEqual({
      kind: 'text-location',
      sectionHref: 'chapter-2.xhtml',
      fraction: 0.5,
    });
  });

  it('routes text citations with exact fragment matching instead of prefix lookalikes', () => {
    const target = getReaderNavigationTargetFromAICitation({
      chapters: [
        { id: 'ch-1', index: 0, title: 'One', text: 'a'.repeat(100) },
        { id: 'ch-10', index: 1, title: 'Ten', text: 'b'.repeat(100) },
      ],
      location: {
        bookCapability: 'text',
        layoutMode: 'paged',
        sectionHref: 'ch-10#frag',
        sectionFraction: 0.4,
      },
    });

    expect(target).toEqual({ kind: 'text-location', sectionHref: 'ch-10', fraction: 0.4 });
  });

  it('routes page-book citations to page targets, not text fractions', () => {
    const target = getReaderNavigationTargetFromAICitation({
      offset: 150,
      chapters,
      location: {
        bookCapability: 'page',
        layoutMode: 'paged',
        sectionHref: 'page-10.xhtml',
        pageNumber: 10,
        pageTotal: 50,
      },
    });

    expect(target).toEqual({
      kind: 'page',
      pageNumber: 2,
      sectionHref: 'chapter-2.xhtml',
    });
  });

  it('navigates page targets by page number before synthetic section hrefs', async () => {
    const goTo = vi.fn();
    const goToFraction = vi.fn();
    const rendererGoTo = vi.fn();

    await navigateReaderToTarget(
      {
        goTo,
        goToFraction,
        renderer: { goTo: rendererGoTo },
      },
      { kind: 'page', pageNumber: 12, sectionHref: 'pdf-page-12' },
    );

    expect(rendererGoTo).toHaveBeenCalledWith({ index: 11, anchor: 0 });
    expect(goTo).not.toHaveBeenCalled();
    expect(goToFraction).not.toHaveBeenCalled();
  });
});
