import { describe, expect, it } from 'vitest';

import {
  denormalizePageQuad,
  getAnnotationTargetKey,
  getBookNoteLegacyCfi,
  getBookNoteNavigationIndex,
  getBookNoteTarget,
  getBookNoteTargetKey,
  getBookNoteTextCfi,
  makeAnnotationTargetFromSelection,
  makePageRegionAnnotationTarget,
  makePageRegionAnnotationTargetFromViewportRect,
  makePdfTextQuadAnnotationTarget,
  makeTextCfiAnnotationTarget,
  normalizeAnnotationTarget,
  normalizePageQuad,
  withTextCfiTarget,
} from '@/services/annotation/annotationTargetContract';
import type { BookNote } from '@/types/book';

describe('annotation target contract', () => {
  it('normalizes legacy cfi into a bounded text-cfi target', () => {
    const target = normalizeAnnotationTarget(undefined, 'epubcfi(/6/2)');

    expect(target).toEqual({ kind: 'text-cfi', cfi: 'epubcfi(/6/2)' });
  });

  it('preserves canonical text-cfi targets and legacy cfi compatibility', () => {
    const note = withTextCfiTarget(
      {
        id: 'note-1',
        type: 'annotation',
        note: '',
        createdAt: 1,
        updatedAt: 1,
      } satisfies Omit<BookNote, 'target' | 'cfi'>,
      'epubcfi(/6/4)',
    );

    expect(getBookNoteTarget(note)).toEqual(makeTextCfiAnnotationTarget({ cfi: 'epubcfi(/6/4)' }));
    expect(getBookNoteTextCfi(note)).toBe('epubcfi(/6/4)');
    expect(getBookNoteLegacyCfi(note)).toBe('epubcfi(/6/4)');
  });

  it('supports pdf-text-quad and page-region targets without pretending they are text CFIs', () => {
    const pdfTarget = makePdfTextQuadAnnotationTarget({
      pageIndex: 2,
      pageWidth: 600,
      pageHeight: 800,
      quads: [{ x1: 0.1, y1: 0.2, x2: 0.4, y2: 0.2, x3: 0.4, y3: 0.25, x4: 0.1, y4: 0.25 }],
      textQuote: 'selected pdf text',
    });
    const regionTarget = makePageRegionAnnotationTarget({
      pageIndex: 3,
      pageWidth: 1200,
      pageHeight: 1600,
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }],
      source: 'manual-region',
    });
    const pageNote: BookNote = {
      id: 'page-note',
      type: 'annotation',
      target: pdfTarget,
      note: 'page note',
      createdAt: 1,
      updatedAt: 1,
    };
    const regionNote: BookNote = {
      id: 'region-note',
      type: 'annotation',
      target: regionTarget,
      note: 'region note',
      createdAt: 1,
      updatedAt: 1,
    };

    expect(getBookNoteTextCfi(pageNote)).toBeNull();
    expect(getBookNoteLegacyCfi(pageNote)).toBe('');
    expect(getBookNoteTargetKey(pageNote)).toBe(
      'pdf-text-quad:2:0:0.1,0.2,0.4,0.2,0.4,0.25,0.1,0.25',
    );
    expect(getBookNoteTargetKey(regionNote)).toBe('page-region:3:0:manual-region:0.1,0.2,0.3,0.4');
    expect(getBookNoteNavigationIndex(pageNote)).toBe(2);
    expect(getBookNoteNavigationIndex(regionNote)).toBe(3);
  });

  it('normalizes and denormalizes page quads so overlays survive zoom', () => {
    const pageBox = { x: 10, y: 20, width: 200, height: 400 };
    const viewportRect = { x: 30, y: 100, width: 80, height: 40 };

    const quad = normalizePageQuad(viewportRect, pageBox);

    expect(quad).toEqual({
      x1: 0.1,
      y1: 0.2,
      x2: 0.5,
      y2: 0.2,
      x3: 0.5,
      y3: 0.3,
      x4: 0.1,
      y4: 0.3,
    });
    const denormalized = quad ? denormalizePageQuad(quad, pageBox) : null;
    expect(denormalized?.x).toBeCloseTo(viewportRect.x);
    expect(denormalized?.y).toBeCloseTo(viewportRect.y);
    expect(denormalized?.width).toBeCloseTo(viewportRect.width);
    expect(denormalized?.height).toBeCloseTo(viewportRect.height);
  });

  it('creates pdf-text-quad targets from text ranges without requiring a CFI', () => {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 200, height: 400, right: 210, bottom: 420 }) as DOMRect;
    document.body.append(canvas);
    const textNode = document.createTextNode('selected pdf text');
    document.body.append(textNode);
    const range = document.createRange();
    range.selectNodeContents(textNode);
    range.getClientRects = () =>
      [
        { left: 30, top: 100, width: 80, height: 40, right: 110, bottom: 140 },
      ] as unknown as DOMRectList;

    expect(
      makeAnnotationTargetFromSelection({
        format: 'pdf',
        cfi: null,
        range,
        index: 7,
        text: 'selected pdf text',
      }),
    ).toMatchObject({
      kind: 'pdf-text-quad',
      pageIndex: 7,
      pageWidth: 200,
      pageHeight: 400,
      textQuote: 'selected pdf text',
      quads: [{ x1: 0.1, y1: 0.2, x2: 0.5, y2: 0.2, x3: 0.5, y3: 0.3, x4: 0.1, y4: 0.3 }],
    });

    range.detach();
    textNode.remove();
    canvas.remove();
  });

  it('creates page-region targets from viewport rectangles for image/scanned pages', () => {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 200, height: 400, right: 210, bottom: 420 }) as DOMRect;
    document.body.append(canvas);

    expect(
      makePageRegionAnnotationTargetFromViewportRect({
        pageIndex: 4,
        doc: document,
        rect: { x: 30, y: 100, width: 80, height: 40 },
      }),
    ).toMatchObject({
      kind: 'page-region',
      pageIndex: 4,
      pageWidth: 200,
      pageHeight: 400,
      rects: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.1 }],
      source: 'manual-region',
    });

    canvas.remove();
  });

  it('normalizes only supported target shapes', () => {
    expect(
      normalizeAnnotationTarget({
        kind: 'pdf-text-quad',
        pageIndex: 1,
        pageWidth: 500,
        pageHeight: 700,
        rotation: 0,
        quads: [{ x1: 0, y1: 0, x2: 0.5, y2: 0, x3: 0.5, y3: 0.1, x4: 0, y4: 0.1 }],
      }),
    ).toMatchObject({ kind: 'pdf-text-quad', pageIndex: 1 });
    expect(
      getAnnotationTargetKey(normalizeAnnotationTarget({ kind: 'region', rect: {} })),
    ).toBeNull();
  });
});
