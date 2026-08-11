import type { FoliateView } from '@/types/view';

const PAGINATOR_TOLERANCE = 0.01;
const RESUME_ANCHOR_NODE_BUDGET = 2000;

export const isReaderRange = (value: unknown): value is Range =>
  typeof (value as Range | undefined)?.getClientRects === 'function' &&
  Boolean((value as Range).startContainer?.ownerDocument);

export const isHorizontalLtrReaderRange = (value: unknown): value is Range => {
  if (!isReaderRange(value)) return false;

  try {
    const doc = value.startContainer.ownerDocument;
    const win = doc?.defaultView;
    if (!doc?.body || !win) return false;

    const bodyStyle = win.getComputedStyle(doc.body);
    let writingMode = bodyStyle.writingMode;
    if (!writingMode || writingMode === 'horizontal-tb') {
      const firstContent = doc.body.querySelector(':scope > :not([cfi-inert])');
      const firstContentMode = firstContent
        ? win.getComputedStyle(firstContent).writingMode
        : undefined;
      if (firstContentMode === 'vertical-rl' || firstContentMode === 'vertical-lr') {
        writingMode = firstContentMode;
      }
    }

    const vertical = writingMode === 'vertical-rl' || writingMode === 'vertical-lr';
    const rtl =
      doc.body.dir === 'rtl' || bodyStyle.direction === 'rtl' || doc.documentElement.dir === 'rtl';
    return !vertical && !rtl;
  } catch {
    return false;
  }
};

const usableRects = (range: Range) =>
  Array.from(range.getClientRects()).filter(({ width, height }) => width > 0 && height > 0);

const rectPage = (rect: DOMRect, pageSize: number) =>
  Math.floor(rect.left / pageSize + PAGINATOR_TOLERANCE);

const characterPage = (doc: Document, node: Text, offset: number, pageSize: number) => {
  const character = doc.createRange();
  character.setStart(node, offset);
  character.setEnd(node, offset + 1);
  const rect = usableRects(character)[0];
  return rect ? rectPage(rect, pageSize) : null;
};

const firstCharacterOnPage = (
  doc: Document,
  node: Text,
  start: number,
  end: number,
  page: number,
  pageSize: number,
) => {
  let low = start;
  let high = end - 1;
  let candidate: number | null = null;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const middlePage = characterPage(doc, node, middle, pageSize);
    if (middlePage === null || middlePage < page) {
      low = middle + 1;
    } else {
      candidate = middle;
      high = middle - 1;
    }
  }

  if (candidate === null || characterPage(doc, node, candidate, pageSize) !== page) return null;
  return candidate;
};

const textRangeBounds = (range: Range, node: Text) => ({
  start: node === range.startContainer ? range.startOffset : 0,
  end: node === range.endContainer ? range.endOffset : node.length,
});

const pointBeforeNode = (doc: Document, node: Node) => {
  const parent = node.parentNode;
  if (!parent) return null;
  const offset = Array.prototype.indexOf.call(parent.childNodes, node) as number;
  if (offset < 0) return null;
  const point = doc.createRange();
  point.setStart(parent, offset);
  point.collapse(true);
  return point;
};

const nextNodeAfter = (node: Node, root: Node) => {
  let current: Node | null = node;
  while (current && current !== root) {
    if (current.nextSibling) return current.nextSibling;
    current = current.parentNode;
  }
  return null;
};

const firstRangeNode = (range: Range) => {
  const { startContainer, startOffset, commonAncestorContainer } = range;
  if (startContainer.nodeType !== Node.ELEMENT_NODE) return startContainer;
  return (
    startContainer.childNodes[startOffset] ?? nextNodeAfter(startContainer, commonAncestorContainer)
  );
};

export function getPagedResumeLocation(
  view: FoliateView,
  location: string,
  visibleRange: Range,
): string {
  try {
    const pageSize = view.renderer.size;
    const currentPage = view.renderer.page;
    if (!Number.isFinite(pageSize) || pageSize <= 0 || !Number.isInteger(currentPage)) {
      return location;
    }

    const doc = visibleRange.startContainer.ownerDocument;
    const firstNode = firstRangeNode(visibleRange);
    if (!doc || !firstNode) return location;

    const root = visibleRange.commonAncestorContainer;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    walker.currentNode = firstNode;

    let node: Node | null = firstNode;
    let enteredRange = false;
    let visited = 0;
    while (node && visited < RESUME_ANCHOR_NODE_BUDGET) {
      visited += 1;
      if (!visibleRange.intersectsNode(node)) {
        if (enteredRange) break;
        node = walker.nextNode();
        continue;
      }
      enteredRange = true;

      let point: Range | null = null;
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
        const textNode = node as Text;
        const { start, end } = textRangeBounds(visibleRange, textNode);
        if (start < end) {
          const offset = firstCharacterOnPage(doc, textNode, start, end, currentPage, pageSize);
          if (offset !== null) {
            point = doc.createRange();
            point.setStart(textNode, offset);
            point.collapse(true);
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE && !node.hasChildNodes()) {
        const rects = Array.from((node as Element).getClientRects()).filter(
          ({ width, height }) => width > 0 && height > 0,
        );
        if (rects.length === 1 && rectPage(rects[0]!, pageSize) === currentPage) {
          point = pointBeforeNode(doc, node);
        }
      }

      if (point) {
        const { index } = view.resolveCFI(location);
        return view.getCFI(index, point);
      }
      node = walker.nextNode();
    }
  } catch {
    return location;
  }

  return location;
}

export async function initializeReaderViewPosition(
  view: Pick<FoliateView, 'init' | 'goToFraction'>,
  lastLocation: string | undefined,
  onSettled: () => void,
): Promise<void> {
  try {
    if (lastLocation) {
      await view.init({ lastLocation });
    } else {
      await view.goToFraction(0);
    }
  } finally {
    onSettled();
  }
}
