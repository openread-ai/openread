import type { BookFormat } from '@openread/types';
import type { AnnotationTarget, BookNote } from '@/types/book';

const TEXT_CFI_PREFIX = 'epubcfi(';

export type AnnotationTargetKind = AnnotationTarget['kind'];

export type PageRect = { x: number; y: number; width: number; height: number };
export type PageQuad = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
  x4: number;
  y4: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function normalizeRect(rect: PageRect, pageBox: PageRect): PageRect | null {
  if (pageBox.width <= 0 || pageBox.height <= 0 || rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: round(clamp01((rect.x - pageBox.x) / pageBox.width)),
    y: round(clamp01((rect.y - pageBox.y) / pageBox.height)),
    width: round(clamp01(rect.width / pageBox.width)),
    height: round(clamp01(rect.height / pageBox.height)),
  };
}

export function normalizePageQuad(rect: PageRect, pageBox: PageRect): PageQuad | null {
  const normalized = normalizeRect(rect, pageBox);
  if (!normalized) return null;
  const x2 = round(clamp01(normalized.x + normalized.width));
  const y3 = round(clamp01(normalized.y + normalized.height));
  return {
    x1: normalized.x,
    y1: normalized.y,
    x2,
    y2: normalized.y,
    x3: x2,
    y3,
    x4: normalized.x,
    y4: y3,
  };
}

export function quadToRect(quad: PageQuad): PageRect {
  const left = Math.min(quad.x1, quad.x2, quad.x3, quad.x4);
  const top = Math.min(quad.y1, quad.y2, quad.y3, quad.y4);
  const right = Math.max(quad.x1, quad.x2, quad.x3, quad.x4);
  const bottom = Math.max(quad.y1, quad.y2, quad.y3, quad.y4);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function denormalizePageRect(rect: PageRect, pageBox: PageRect): PageRect {
  return {
    x: pageBox.x + rect.x * pageBox.width,
    y: pageBox.y + rect.y * pageBox.height,
    width: rect.width * pageBox.width,
    height: rect.height * pageBox.height,
  };
}

export function denormalizePageQuad(quad: PageQuad, pageBox: PageRect): PageRect {
  return denormalizePageRect(quadToRect(quad), pageBox);
}

function parseRect(value: unknown): PageRect | null {
  if (!isRecord(value)) return null;
  const { x, y, width, height } = value;
  if (![x, y, width, height].every(isFiniteNumber)) return null;
  return { x, y, width, height } as PageRect;
}

function parseQuad(value: unknown): PageQuad | null {
  if (!isRecord(value)) return null;
  const { x1, y1, x2, y2, x3, y3, x4, y4 } = value;
  if (![x1, y1, x2, y2, x3, y3, x4, y4].every(isFiniteNumber)) return null;
  return { x1, y1, x2, y2, x3, y3, x4, y4 } as PageQuad;
}

function getRangePageBox(range: Range): PageRect | null {
  const doc = range.commonAncestorContainer.ownerDocument;
  if (!doc) return null;
  const canvas = doc.querySelector('canvas');
  const pageElement = canvas ?? doc.body ?? doc.documentElement;
  const rect = pageElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

export function makePageRegionAnnotationTargetFromViewportRect({
  pageIndex,
  doc,
  rect,
  source = 'manual-region',
}: {
  pageIndex: number;
  doc: Document;
  rect: PageRect;
  source?: 'manual-region' | 'image-selection' | 'text-selection' | 'imported';
}): AnnotationTarget | null {
  const pageBox = getDocumentPageBox(doc);
  const normalized = pageBox ? normalizeRect(rect, pageBox) : null;
  if (!pageBox || !normalized) return null;
  return makePageRegionAnnotationTarget({
    pageIndex,
    pageWidth: pageBox.width,
    pageHeight: pageBox.height,
    rects: [normalized],
    source,
  });
}

function getDocumentPageBox(doc: Document): PageRect | null {
  const canvas = doc.querySelector('canvas');
  const pageElement = canvas ?? doc.body ?? doc.documentElement;
  const rect = pageElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

export function isTextCfi(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(TEXT_CFI_PREFIX);
}

export function makeTextCfiAnnotationTarget(input: {
  cfi: string;
  href?: string;
  index?: number;
}): AnnotationTarget {
  return {
    kind: 'text-cfi',
    cfi: input.cfi,
    ...(input.href ? { href: input.href } : {}),
    ...(typeof input.index === 'number' ? { index: input.index } : {}),
  };
}

export function makePdfTextQuadAnnotationTarget(input: {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  rotation?: number;
  quads: PageQuad[];
  textQuote?: string;
  textPosition?: { start: number; end: number };
}): AnnotationTarget {
  return {
    kind: 'pdf-text-quad',
    pageIndex: input.pageIndex,
    pageWidth: input.pageWidth,
    pageHeight: input.pageHeight,
    rotation: input.rotation ?? 0,
    quads: input.quads,
    ...(input.textQuote ? { textQuote: input.textQuote } : {}),
    ...(input.textPosition ? { textPosition: input.textPosition } : {}),
  };
}

export function makePageRegionAnnotationTarget(input: {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  rotation?: number;
  rects: PageRect[];
  source: 'manual-region' | 'image-selection' | 'text-selection' | 'imported';
}): AnnotationTarget {
  return {
    kind: 'page-region',
    pageIndex: input.pageIndex,
    pageWidth: input.pageWidth,
    pageHeight: input.pageHeight,
    rotation: input.rotation ?? 0,
    rects: input.rects,
    source: input.source,
  };
}

export function makeFixedPageAnnotationTargetFromRange({
  format,
  pageIndex,
  range,
  text,
}: {
  format?: BookFormat | string | null;
  pageIndex: number;
  range: Range;
  text?: string;
}): AnnotationTarget | null {
  const pageBox = getRangePageBox(range);
  if (!pageBox) return null;
  const rects = Array.from(range.getClientRects())
    .map((rect) => ({ x: rect.left, y: rect.top, width: rect.width, height: rect.height }))
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (rects.length === 0) return null;

  if (format === 'pdf') {
    const quads = rects
      .map((rect) => normalizePageQuad(rect, pageBox))
      .filter((quad): quad is PageQuad => Boolean(quad));
    if (quads.length === 0) return null;
    return makePdfTextQuadAnnotationTarget({
      pageIndex,
      pageWidth: pageBox.width,
      pageHeight: pageBox.height,
      quads,
      textQuote: text,
    });
  }

  if (format === 'cbz') {
    const normalizedRects = rects
      .map((rect) => normalizeRect(rect, pageBox))
      .filter((rect): rect is PageRect => Boolean(rect));
    if (normalizedRects.length === 0) return null;
    return makePageRegionAnnotationTarget({
      pageIndex,
      pageWidth: pageBox.width,
      pageHeight: pageBox.height,
      rects: normalizedRects,
      source: 'image-selection',
    });
  }

  return null;
}

export function makeAnnotationTargetFromSelection({
  format,
  cfi,
  range,
  index,
  text,
}: {
  format?: BookFormat | string | null;
  cfi?: string | null;
  range: Range;
  index: number;
  text?: string;
}): AnnotationTarget | null {
  if (format === 'pdf' || format === 'cbz') {
    return makeFixedPageAnnotationTargetFromRange({ format, pageIndex: index, range, text });
  }
  return cfi ? makeTextCfiAnnotationTarget({ cfi, index }) : null;
}

export function isTextCfiAnnotationTarget(
  target: AnnotationTarget | null | undefined,
): target is Extract<AnnotationTarget, { kind: 'text-cfi' }> {
  return target?.kind === 'text-cfi' && isTextCfi(target.cfi);
}

export function isFixedPageAnnotationTarget(
  target: AnnotationTarget | null | undefined,
): target is Extract<AnnotationTarget, { kind: 'pdf-text-quad' | 'page-region' }> {
  return target?.kind === 'pdf-text-quad' || target?.kind === 'page-region';
}

export function normalizeAnnotationTarget(
  target: unknown,
  legacyCfi?: string | null,
): AnnotationTarget | null {
  if (isRecord(target)) {
    if (target.kind === 'text-cfi' && isTextCfi(target.cfi)) {
      return makeTextCfiAnnotationTarget({
        cfi: target.cfi,
        href: typeof target.href === 'string' ? target.href : undefined,
        index: isFiniteNumber(target.index) ? target.index : undefined,
      });
    }

    if (target.kind === 'pdf-text-quad' && Array.isArray(target.quads)) {
      const quads = target.quads.map(parseQuad).filter((quad): quad is PageQuad => Boolean(quad));
      if (isFiniteNumber(target.pageIndex) && quads.length > 0) {
        return makePdfTextQuadAnnotationTarget({
          pageIndex: target.pageIndex,
          pageWidth: isFiniteNumber(target.pageWidth) ? target.pageWidth : 1,
          pageHeight: isFiniteNumber(target.pageHeight) ? target.pageHeight : 1,
          rotation: isFiniteNumber(target.rotation) ? target.rotation : 0,
          quads,
          textQuote: typeof target.textQuote === 'string' ? target.textQuote : undefined,
          textPosition: isRecord(target.textPosition)
            ? {
                start: isFiniteNumber(target.textPosition.start) ? target.textPosition.start : 0,
                end: isFiniteNumber(target.textPosition.end) ? target.textPosition.end : 0,
              }
            : undefined,
        });
      }
    }

    if (target.kind === 'page-region' && Array.isArray(target.rects)) {
      const rects = target.rects.map(parseRect).filter((rect): rect is PageRect => Boolean(rect));
      if (isFiniteNumber(target.pageIndex) && rects.length > 0) {
        return makePageRegionAnnotationTarget({
          pageIndex: target.pageIndex,
          pageWidth: isFiniteNumber(target.pageWidth) ? target.pageWidth : 1,
          pageHeight: isFiniteNumber(target.pageHeight) ? target.pageHeight : 1,
          rotation: isFiniteNumber(target.rotation) ? target.rotation : 0,
          rects,
          source:
            target.source === 'image-selection' ||
            target.source === 'text-selection' ||
            target.source === 'imported'
              ? target.source
              : 'manual-region',
        });
      }
    }

    // Bounded compatibility for pre-contract in-branch targets only; persisted legacy
    // production data still enters through naked cfi below.
    if (target.kind === 'page' && isFiniteNumber(target.pageNumber)) {
      return makePageRegionAnnotationTarget({
        pageIndex: Math.max(0, target.pageNumber - 1),
        pageWidth: 1,
        pageHeight: 1,
        rects: [{ x: 0, y: 0, width: 1, height: 1 }],
        source: 'imported',
      });
    }

    if (target.kind === 'region' && isRecord(target.rect)) {
      const rect = parseRect(target.rect);
      if (rect) {
        return makePageRegionAnnotationTarget({
          pageIndex: isFiniteNumber(target.pageNumber) ? target.pageNumber : 0,
          pageWidth: 1,
          pageHeight: 1,
          rects: [rect],
          source: 'imported',
        });
      }
    }
  }

  if (isTextCfi(legacyCfi)) return makeTextCfiAnnotationTarget({ cfi: legacyCfi });
  return null;
}

export function getBookNoteTarget(note: Pick<BookNote, 'target' | 'cfi'>): AnnotationTarget | null {
  return normalizeAnnotationTarget(note.target, note.cfi);
}

export function getBookNoteTextCfi(note: Pick<BookNote, 'target' | 'cfi'>): string | null {
  const target = getBookNoteTarget(note);
  return isTextCfiAnnotationTarget(target) ? target.cfi : null;
}

export function getAnnotationTargetKey(target: AnnotationTarget | null | undefined): string | null {
  if (!target) return null;
  if (target.kind === 'text-cfi') return `text-cfi:${target.cfi}`;
  if (target.kind === 'pdf-text-quad') {
    const quadKey = target.quads
      .map(
        (quad) =>
          `${quad.x1},${quad.y1},${quad.x2},${quad.y2},${quad.x3},${quad.y3},${quad.x4},${quad.y4}`,
      )
      .join('|');
    return `pdf-text-quad:${target.pageIndex}:${target.rotation}:${quadKey}`;
  }
  const rectKey = target.rects
    .map((rect) => `${rect.x},${rect.y},${rect.width},${rect.height}`)
    .join('|');
  return `page-region:${target.pageIndex}:${target.rotation}:${target.source}:${rectKey}`;
}

export function getBookNoteTargetKey(note: Pick<BookNote, 'target' | 'cfi' | 'id'>): string {
  return getAnnotationTargetKey(getBookNoteTarget(note)) ?? `unknown:${note.id}`;
}

export function getAnnotationTargetNavigationIndex(
  target: AnnotationTarget | null | undefined,
): number | null {
  if (!target) return null;
  if (target.kind === 'text-cfi') return typeof target.index === 'number' ? target.index : null;
  return target.pageIndex;
}

export function getBookNoteNavigationIndex(note: Pick<BookNote, 'target' | 'cfi'>): number | null {
  return getAnnotationTargetNavigationIndex(getBookNoteTarget(note));
}

export function getBookNoteLegacyCfi(note: Pick<BookNote, 'target' | 'cfi'>): string {
  return getBookNoteTextCfi(note) ?? note.cfi ?? '';
}

export function isAnnotationTargetInLocation(
  target: AnnotationTarget | null | undefined,
  location: string | number | null | undefined,
): boolean {
  if (!target || location == null) return false;
  if (target.kind === 'text-cfi')
    return typeof location === 'string' && location.includes(target.cfi);
  if (typeof location === 'number') return target.pageIndex === location;
  const pageMatch = String(location).match(/(?:page|index)[:=/-]?(\d+)/i);
  return pageMatch ? target.pageIndex === Number(pageMatch[1]) : false;
}

export function denormalizeAnnotationTargetRects(
  target: AnnotationTarget,
  doc: Document,
): PageRect[] {
  const pageBox = getDocumentPageBox(doc);
  if (!pageBox) return [];
  if (target.kind === 'pdf-text-quad') {
    return target.quads.map((quad) => denormalizePageQuad(quad, pageBox));
  }
  if (target.kind === 'page-region') {
    return target.rects.map((rect) => denormalizePageRect(rect, pageBox));
  }
  return [];
}

export function withTextCfiTarget<T extends object>(
  note: T,
  cfi: string,
): T & { cfi: string; target: AnnotationTarget } {
  return {
    ...note,
    cfi,
    target: makeTextCfiAnnotationTarget({ cfi }),
  };
}
