import { describe, expect, it, vi } from 'vitest';
import type { BookProgress } from '@/types/book';
import {
  getCanonicalReaderLocation,
  getReaderNavigationTargetFromAICitation,
  navigateReaderToTarget,
} from '@/app/reader/utils/readerLocationContract';
import type { ReaderChapter } from '@/services/ai/tools/bookTools';

const chapters: ReaderChapter[] = [
  { id: 'chapter-1.xhtml', index: 0, title: 'One', text: 'a'.repeat(100) },
  { id: 'chapter-2.xhtml', index: 1, title: 'Two', text: 'b'.repeat(100) },
];

describe('readerLocationContract', () => {
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
