import type { BookProgress } from '@/types/book';
import type { FoliateView } from '@/types/view';
import type { ReaderChapter } from '@/services/ai/tools/bookTools';
import type {
  ReaderBookCapability,
  ReaderLayoutMode,
  ReaderLayoutState,
} from './readerLayoutContract';

export type CanonicalReaderLocation = {
  bookCapability: ReaderBookCapability;
  layoutMode: ReaderLayoutMode;

  sectionHref?: string;
  sectionIndex?: number;

  pageNumber?: number;
  pageTotal?: number;

  sectionFraction?: number;
  progressFraction?: number;

  cfi?: string;
  xpointer?: string;
};

export type ReaderNavigationTarget =
  | { kind: 'text-location'; sectionHref?: string; fraction?: number; cfi?: string }
  | { kind: 'page'; pageNumber: number; sectionHref?: string }
  | { kind: 'section'; sectionHref: string };

const clampFraction = (value: number | undefined): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, value));
};

const fractionFromPageInfo = (pageInfo: { current?: number; total?: number } | undefined) => {
  if (!pageInfo || typeof pageInfo.total !== 'number' || pageInfo.total <= 0) return undefined;
  const current = typeof pageInfo.current === 'number' ? pageInfo.current : 0;
  return clampFraction((current + 1) / pageInfo.total);
};

const pageNumberFromProgress = (progress: BookProgress | null | undefined): number | undefined => {
  const page = progress?.pageinfo ?? progress?.section;
  if (!page || typeof page.current !== 'number' || page.current < 0) return undefined;
  return Math.floor(page.current) + 1;
};

const pageTotalFromProgress = (progress: BookProgress | null | undefined): number | undefined => {
  const total = progress?.pageinfo?.total ?? progress?.section?.total;
  return typeof total === 'number' && total > 0 ? total : undefined;
};

export function getCanonicalReaderLocation(input: {
  progress?: BookProgress | null;
  book: {
    isFixedLayout?: boolean;
    renditionLayout?: string;
    format?: string;
  };
  layoutState: ReaderLayoutState;
}): CanonicalReaderLocation {
  const { progress, layoutState } = input;
  const sectionHref = progress?.sectionHref || undefined;
  const sectionIndex =
    typeof progress?.sectionId === 'number' && progress.sectionId >= 0
      ? progress.sectionId
      : undefined;
  const progressFraction = fractionFromPageInfo(progress?.pageinfo);
  const sectionFraction =
    layoutState.bookCapability === 'text' ? fractionFromPageInfo(progress?.section) : undefined;
  const pageNumber =
    layoutState.bookCapability === 'page' ? pageNumberFromProgress(progress) : undefined;
  const pageTotal =
    layoutState.bookCapability === 'page' ? pageTotalFromProgress(progress) : undefined;
  const location = progress?.location || undefined;

  return {
    bookCapability: layoutState.bookCapability,
    layoutMode: layoutState.layoutMode,
    sectionHref,
    sectionIndex,
    pageNumber,
    pageTotal,
    sectionFraction,
    progressFraction,
    cfi: location && !location.includes('xpointer') ? location : undefined,
    xpointer: location && location.includes('xpointer') ? location : undefined,
  };
}

function findChapterByHref(chapters: ReaderChapter[], sectionHref?: string): ReaderChapter | null {
  if (!sectionHref) return null;
  const base = sectionHref.split('#')[0]!;
  return (
    chapters.find((chapter) => {
      const id = chapter.id;
      return id === sectionHref || id === base || sectionHref.startsWith(id);
    }) ?? null
  );
}

function findChapterByOffset(
  chapters: ReaderChapter[],
  offset: number,
): { chapter: ReaderChapter; fraction: number } | null {
  let remaining = offset;
  for (const chapter of chapters) {
    const length = chapter.text.length;
    if (remaining <= length) {
      return {
        chapter,
        fraction: clampFraction(length > 0 ? remaining / length : 0) ?? 0,
      };
    }
    remaining -= length;
  }
  const last = chapters.at(-1);
  return last ? { chapter: last, fraction: 1 } : null;
}

function inferPageNumberFromChapter(chapter: ReaderChapter): number {
  const titleMatch = chapter.title.match(/\bpage\s+(\d+)\b/i);
  if (titleMatch?.[1]) return Number(titleMatch[1]);
  return chapter.index + 1;
}

export function getReaderNavigationTargetFromAICitation(input: {
  offset?: number;
  quoteText?: string;
  chapters: ReaderChapter[];
  location: CanonicalReaderLocation;
}): ReaderNavigationTarget | null {
  const { offset, chapters, location } = input;

  if (location.bookCapability === 'page') {
    if (typeof offset === 'number' && offset >= 0) {
      const byOffset = findChapterByOffset(chapters, offset);
      if (byOffset) {
        return {
          kind: 'page',
          pageNumber: inferPageNumberFromChapter(byOffset.chapter),
          sectionHref: byOffset.chapter.id,
        };
      }
    }
    if (location.pageNumber && location.pageNumber > 0) {
      return { kind: 'page', pageNumber: location.pageNumber, sectionHref: location.sectionHref };
    }
    if (location.sectionHref) return { kind: 'section', sectionHref: location.sectionHref };
    return null;
  }

  if (location.cfi) {
    return { kind: 'text-location', cfi: location.cfi, sectionHref: location.sectionHref };
  }

  if (typeof offset === 'number' && offset >= 0) {
    const byOffset = findChapterByOffset(chapters, offset);
    if (byOffset) {
      return {
        kind: 'text-location',
        sectionHref: byOffset.chapter.id,
        fraction: byOffset.fraction,
      };
    }
  }

  const byHref = findChapterByHref(chapters, location.sectionHref);
  if (byHref) {
    return {
      kind: 'text-location',
      sectionHref: byHref.id,
      fraction: location.sectionFraction,
    };
  }

  if (location.sectionHref) return { kind: 'section', sectionHref: location.sectionHref };
  return null;
}

export type ReaderNavigationView = Pick<FoliateView, 'goTo' | 'goToFraction'> & {
  renderer: Pick<FoliateView['renderer'], 'goTo'>;
};

export async function navigateReaderToTarget(
  view: ReaderNavigationView,
  target: ReaderNavigationTarget,
  options: { offset?: number; totalChars?: number } = {},
): Promise<void> {
  if (target.kind === 'page') {
    if (view.renderer.goTo) {
      view.renderer.goTo({ index: Math.max(0, target.pageNumber - 1), anchor: 0 });
      return;
    }
    if (target.sectionHref) view.goTo(target.sectionHref);
    return;
  }

  if (target.kind === 'section') {
    view.goTo(target.sectionHref);
    return;
  }

  if (target.cfi) {
    view.goTo(target.cfi);
    return;
  }

  const { offset, totalChars } = options;
  if (typeof offset === 'number' && typeof totalChars === 'number' && totalChars > 0) {
    view.goToFraction(Math.min(1, Math.max(0, offset / totalChars)));
    return;
  }

  if (target.sectionHref) view.goTo(target.sectionHref);
}
