import { afterEach, describe, expect, it, vi } from 'vitest';
import { getVisibleRange } from 'foliate-js/paginator.js';

const visibleRect = () => new DOMRect(10, 10, 40, 20);
const mapRect = (rect: DOMRect) => rect;

function mockVisibleGeometry(doc: Document) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => visibleRect());

  const createRange = doc.createRange.bind(doc);
  vi.spyOn(doc, 'createRange').mockImplementation(() => {
    const range = createRange();
    Object.defineProperty(range, 'getBoundingClientRect', {
      configurable: true,
      value: () => visibleRect(),
    });
    return range;
  });
}

function createDeepDocument(depth: number) {
  const doc = document.implementation.createHTMLDocument('deep visible range');
  let parent = doc.body;
  for (let index = 0; index < depth; index += 1) {
    const child = doc.createElement('div');
    parent.appendChild(child);
    parent = child;
  }
  parent.appendChild(doc.createTextNode('visible leaf'));
  mockVisibleGeometry(doc);
  return doc;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Foliate visible range traversal bounds', () => {
  it('does not overflow the stack on pathologically deep reader DOM', () => {
    const doc = createDeepDocument(2_000);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => getVisibleRange(doc, 0, 100, mapRect)).not.toThrow();

    expect(warn).toHaveBeenCalledWith(
      '[foliate-js] visible range traversal limit reached',
      expect.objectContaining({
        reason: 'max-depth',
        maxDepth: 512,
      }),
    );
  });

  it('does not loop forever when traversal sees the same element more than once', () => {
    const doc = createDeepDocument(1);
    const child = doc.body.firstElementChild!;
    Object.defineProperty(child, 'childNodes', {
      configurable: true,
      value: [child],
    });

    expect(() =>
      getVisibleRange(doc, 0, 100, mapRect, { maxDepth: 20, maxNodes: 100 }),
    ).not.toThrow();
  });
});
