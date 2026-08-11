import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPagedResumeLocation,
  initializeReaderViewPosition,
  isHorizontalLtrReaderRange,
  isReaderRange,
} from '@/app/reader/utils/readerResumeAnchor';
import type { FoliateView } from '@/types/view';

const rect = (x: number) =>
  ({ x, left: x, right: x + 10, y: 0, top: 0, bottom: 10, width: 10, height: 10 }) as DOMRect;

function resumeFixture(currentPage: number, positions: number[], prefixCount = 0) {
  document.body.innerHTML = '<iframe></iframe>';
  const doc = document.querySelector('iframe')!.contentDocument!;
  doc.body.innerHTML = `<main>${Array.from(
    { length: prefixCount },
    (_, index) => `<span class="prefix">prefix-${index}</span>`,
  ).join(
    '',
  )}${positions.map((_, index) => `<span class="target">node-${index}</span>`).join('')}</main>`;
  const textNodes = Array.from(
    doc.querySelectorAll('.target'),
    (element) => element.firstChild as Text,
  );
  const rectByNode = new Map(textNodes.map((node, index) => [node, rect(positions[index]!)]));
  const createRange = doc.createRange.bind(doc);
  vi.spyOn(doc, 'createRange').mockImplementation(() => {
    const range = createRange();
    Object.defineProperty(range, 'getClientRects', {
      configurable: true,
      value: () => {
        const candidate = rectByNode.get(range.startContainer as Text);
        return (candidate ? [candidate] : []) as unknown as DOMRectList;
      },
    });
    return range;
  });

  const visibleRange = createRange();
  visibleRange.setStart(textNodes[0]!, 0);
  visibleRange.setEnd(textNodes.at(-1)!, textNodes.at(-1)!.textContent!.length);
  Object.defineProperty(visibleRange, 'getClientRects', {
    configurable: true,
    value: () => positions.map(rect) as unknown as DOMRectList,
  });

  let selectedRects: DOMRect[] = [];
  const view = {
    renderer: { page: currentPage, size: 1040 },
    resolveCFI: vi.fn(() => ({ index: 0, anchor: vi.fn() })),
    getCFI: vi.fn((_index: number, range: Range) => {
      selectedRects = Array.from(range.getClientRects());
      return 'epubcfi(/6/4!/4/2:0)';
    }),
  } as unknown as FoliateView;

  return {
    view,
    visibleRange,
    selectedRect: () => selectedRects,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('paged reader resume anchors', () => {
  it('accepts a range created inside the book iframe realm', () => {
    const fixture = resumeFixture(0, [587.375]);

    expect(fixture.visibleRange).not.toBeInstanceOf(Range);
    expect(isReaderRange(fixture.visibleRange)).toBe(true);
    expect(isHorizontalLtrReaderRange(fixture.visibleRange)).toBe(true);
  });

  it('fails open for document RTL even when the range starts in nested LTR content', () => {
    const fixture = resumeFixture(0, [587.375]);
    const doc = fixture.visibleRange.startContainer.ownerDocument!;
    doc.body.dir = 'rtl';
    fixture.visibleRange.startContainer.parentElement!.dir = 'ltr';

    expect(isHorizontalLtrReaderRange(fixture.visibleRange)).toBe(false);
  });

  it('fails open for document vertical mode even when the range starts in horizontal content', () => {
    const fixture = resumeFixture(0, [587.375]);
    const doc = fixture.visibleRange.startContainer.ownerDocument!;
    (doc.body.firstElementChild as HTMLElement).style.writingMode = 'vertical-rl';
    fixture.visibleRange.startContainer.parentElement!.style.writingMode = 'horizontal-tb';

    expect(isHorizontalLtrReaderRange(fixture.visibleRange)).toBe(false);
  });

  it('rejects a prior-page range start and selects one point on the current page', () => {
    const fixture = resumeFixture(1, [587.375, 1050]);

    const location = getPagedResumeLocation(
      fixture.view,
      'epubcfi(/6/4!/4,/2[pg-header]/4,/8[pgepubid00000]/1:32)',
      fixture.visibleRange,
    );

    expect(location).toBe('epubcfi(/6/4!/4/2:0)');
    expect(fixture.selectedRect()).toEqual([expect.objectContaining({ x: 1050 })]);
  });

  it('rejects a following-page range end and selects one point on the current page', () => {
    const fixture = resumeFixture(0, [908.953125, 1211.5625]);

    const location = getPagedResumeLocation(
      fixture.view,
      'epubcfi(/6/4!/4,/2[pg-header]/4,/8[pgepubid00000]/1:32)',
      fixture.visibleRange,
    );

    expect(location).toBe('epubcfi(/6/4!/4/2:0)');
    expect(fixture.selectedRect()).toEqual([expect.objectContaining({ x: 908.953125 })]);
  });

  it('starts at the range boundary instead of traversing a large document prefix', () => {
    const fixture = resumeFixture(1, [587.375, 1050], 2500);

    const location = getPagedResumeLocation(
      fixture.view,
      'epubcfi(/6/4!/4,/2/4,/8/1:32)',
      fixture.visibleRange,
    );

    expect(location).toBe('epubcfi(/6/4!/4/2:0)');
    expect(fixture.selectedRect()).toEqual([expect.objectContaining({ x: 1050 })]);
  });

  it('fails open when the bounded range traversal cannot reach the current page', () => {
    const fixture = resumeFixture(1, [...Array<number>(1100).fill(587.375), 1050]);
    const original = 'epubcfi(/6/4!/4,/2/4,/8/1:32)';

    expect(getPagedResumeLocation(fixture.view, original, fixture.visibleRange)).toBe(original);
    expect(fixture.view.getCFI).not.toHaveBeenCalled();
  });

  it('fails open to the original range when no point resolves on the current page', () => {
    const fixture = resumeFixture(2, [587.375, 1211.5625]);
    const original = 'epubcfi(/6/4!/4,/2/4,/8/1:32)';

    expect(getPagedResumeLocation(fixture.view, original, fixture.visibleRange)).toBe(original);
    expect(fixture.view.getCFI).not.toHaveBeenCalled();
  });
});

describe('initial reader navigation lifecycle', () => {
  it('fails open for later saves when initial navigation rejects', async () => {
    const failure = new Error('navigation failed');
    const view = {
      init: vi.fn().mockRejectedValue(failure),
      goToFraction: vi.fn(),
    } as unknown as Pick<FoliateView, 'init' | 'goToFraction'>;
    const onSettled = vi.fn();

    await expect(initializeReaderViewPosition(view, 'epubcfi(/6/4)', onSettled)).rejects.toBe(
      failure,
    );

    expect(onSettled).toHaveBeenCalledOnce();
  });
});
