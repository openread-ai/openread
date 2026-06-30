import { afterEach, describe, expect, test, vi } from 'vitest';
import type { BookDoc, SectionItem } from '@/libs/document';
import {
  buildReaderChaptersForAI,
  buildReaderVisualContextImages,
} from '@/app/reader/hooks/useBookChapters';

function makeDocument(text: string): Document {
  const doc = document.implementation.createHTMLDocument('');
  doc.body.textContent = text;
  return doc;
}

function makeSection(id: string | number, text: string): SectionItem {
  return {
    id: String(id),
    cfi: String(id),
    size: 100,
    linear: 'yes',
    createDocument: async () => makeDocument(text),
  };
}

function makeBookDoc(overrides: Partial<BookDoc> = {}): BookDoc {
  return {
    metadata: {
      title: 'Dynamic Context Book',
      author: 'OpenRead',
      language: 'en',
      subject: ['AI', 'Reading'],
      description: 'A book used to validate dynamic AI context recovery.',
    },
    dir: 'ltr',
    toc: [
      { id: 1, label: 'Part One', href: '0' },
      { id: 2, label: 'Part Two', href: '1' },
    ],
    sections: [],
    splitTOCHref: (href: string) => [href],
    getCover: async () => null,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildReaderChaptersForAI', () => {
  test('merges sparse readable sections instead of returning empty context', async () => {
    const bookDoc = makeBookDoc({
      sections: [
        makeSection(0, 'Alpha beta.'),
        makeSection(1, 'Gamma delta epsilon zeta eta theta.'),
      ],
    });

    const chapters = await buildReaderChaptersForAI(bookDoc);

    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.title).toBe('Reader text context');
    expect(chapters[0]!.text).toContain('Part One');
    expect(chapters[0]!.text).toContain('Alpha beta.');
    expect(chapters[0]!.text).toContain('Gamma delta epsilon');
  });

  test('always returns a reader context chapter when the book document exists', async () => {
    const bookDoc = makeBookDoc({
      metadata: { title: '', author: '', language: '' },
      toc: undefined,
      sections: [],
    });

    const chapters = await buildReaderChaptersForAI(bookDoc);

    expect(chapters).toHaveLength(1);
    expect(chapters[0]).toMatchObject({
      id: 'book-context',
      title: 'Available book context',
    });
    expect(chapters[0]!.text).toContain('Reader context: This book is open in Reader.');
  });

  test('falls back to metadata and TOC when body text is unavailable', async () => {
    const bookDoc = makeBookDoc({
      sections: [makeSection(0, ''), makeSection(1, '')],
    });

    const chapters = await buildReaderChaptersForAI(bookDoc);

    expect(chapters).toHaveLength(1);
    expect(chapters[0]).toMatchObject({
      id: 'book-context',
      title: 'Available book context',
    });
    expect(chapters[0]!.text).toContain('Title: Dynamic Context Book');
    expect(chapters[0]!.text).toContain('Table of contents:');
    expect(chapters[0]!.text).toContain('Part Two');
  });

  test('extracts visual context images from image-first reader sections', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(new Blob(['image-bytes'], { type: 'image/png' })),
      }),
    );
    const bookDoc = makeBookDoc({
      sections: [
        {
          id: 'comic-page-1',
          cfi: 'comic-page-1',
          size: 100,
          linear: 'yes',
          load: async () => ({ data: '<html><body><img src="blob:comic-image" /></body></html>' }),
        } as unknown as SectionItem,
      ],
    });

    const images = await buildReaderVisualContextImages(bookDoc, 'comic-page-1');

    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      id: 'comic-page-1',
      title: 'Visual page 1',
    });
    expect(images[0]!.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  test('renders PDF visual context from canvas load results without img tags', async () => {
    const onZoom = vi.fn(async ({ doc }: { doc: Document }) => {
      const target = doc.querySelector('#canvas') ?? doc.body;
      const canvas = doc.createElement('canvas');
      canvas.width = 2;
      canvas.height = 1;
      Object.defineProperty(canvas, 'getContext', {
        value: () => ({
          getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]) }),
        }),
      });
      Object.defineProperty(canvas, 'toBlob', {
        value: (callback: (blob: Blob | null) => void) => {
          callback(new Blob(['rendered-pdf-page'], { type: 'image/png' }));
        },
      });
      target.appendChild(canvas);
    });
    const bookDoc = makeBookDoc({
      sections: [
        {
          id: 'pdf-page-2',
          cfi: 'pdf-page-2',
          size: 100,
          linear: 'yes',
          load: async () => ({
            data: '<!doctype html><html><body><div id="canvas"></div></body></html>',
            onZoom,
          }),
        } as unknown as SectionItem,
      ],
    });

    const images = await buildReaderVisualContextImages(bookDoc, 'pdf-page-2');

    expect(onZoom).toHaveBeenCalledWith(expect.objectContaining({ scale: 1 }));
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      id: 'pdf-page-2',
      title: 'Visual page 1',
      visualSignal: 'nonblank',
      isBlankPage: false,
    });
    expect(images[0]!.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(document.querySelector('iframe[aria-hidden="true"]')).toBeNull();
  });

  test('keeps PDF pages with white margins but content elsewhere nonblank', async () => {
    const onZoom = vi.fn(async ({ doc }: { doc: Document }) => {
      const target = doc.querySelector('#canvas') ?? doc.body;
      const canvas = doc.createElement('canvas');
      canvas.width = 120;
      canvas.height = 120;
      Object.defineProperty(canvas, 'getContext', {
        value: () => ({
          getImageData: (x: number, y: number, width: number, height: number) => {
            const isContentRegion = x + width > 70 && y + height > 70;
            const pixel = isContentRegion ? [20, 20, 20, 255] : [255, 255, 255, 255];
            return {
              data: new Uint8ClampedArray(
                Array.from({ length: width * height }, () => pixel).flat(),
              ),
            };
          },
        }),
      });
      Object.defineProperty(canvas, 'toBlob', {
        value: (callback: (blob: Blob | null) => void) => {
          callback(new Blob(['white-margin-content-page'], { type: 'image/png' }));
        },
      });
      target.appendChild(canvas);
    });
    const bookDoc = makeBookDoc({
      sections: [
        {
          id: 'pdf-page-white-margin',
          cfi: 'pdf-page-white-margin',
          size: 100,
          linear: 'yes',
          load: async () => ({
            data: '<!doctype html><html><body><div id="canvas"></div></body></html>',
            onZoom,
          }),
        } as unknown as SectionItem,
      ],
    });

    const images = await buildReaderVisualContextImages(bookDoc, 'pdf-page-white-margin');

    expect(images[0]).toMatchObject({
      id: 'pdf-page-white-margin',
      visualSignal: 'nonblank',
      isBlankPage: false,
    });
  });

  test('marks rendered blank PDF canvas pages with a blank visual signal', async () => {
    const onZoom = vi.fn(async ({ doc }: { doc: Document }) => {
      const target = doc.querySelector('#canvas') ?? doc.body;
      const canvas = doc.createElement('canvas');
      canvas.width = 2;
      canvas.height = 1;
      Object.defineProperty(canvas, 'getContext', {
        value: () => ({
          getImageData: () => ({
            data: new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]),
          }),
        }),
      });
      Object.defineProperty(canvas, 'toBlob', {
        value: (callback: (blob: Blob | null) => void) => {
          callback(new Blob(['blank-pdf-page'], { type: 'image/png' }));
        },
      });
      target.appendChild(canvas);
    });
    const bookDoc = makeBookDoc({
      sections: [
        {
          id: 'pdf-page-blank',
          cfi: 'pdf-page-blank',
          size: 100,
          linear: 'yes',
          load: async () => ({
            data: '<!doctype html><html><body><div id="canvas"></div></body></html>',
            onZoom,
          }),
        } as unknown as SectionItem,
      ],
    });

    const images = await buildReaderVisualContextImages(bookDoc, 'pdf-page-blank');

    expect(images[0]).toMatchObject({
      id: 'pdf-page-blank',
      visualSignal: 'blank',
      isBlankPage: true,
    });
  });

  test('starts visual context at exact numeric section instead of prefix lookalike', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(new Blob(['image-bytes'], { type: 'image/png' })),
      }),
    );
    const bookDoc = makeBookDoc({
      sections: [
        {
          id: '1',
          cfi: '1',
          size: 100,
          linear: 'yes',
          load: async () => ({ data: '<html><body><img src="blob:page-1" /></body></html>' }),
        } as unknown as SectionItem,
        {
          id: '10',
          cfi: '10',
          size: 100,
          linear: 'yes',
          load: async () => ({ data: '<html><body><img src="blob:page-10" /></body></html>' }),
        } as unknown as SectionItem,
      ],
    });

    const images = await buildReaderVisualContextImages(bookDoc, '10#frag');

    expect(images[0]).toMatchObject({ id: '10', title: 'Visual page 2' });
  });

  test('falls back visual context start to canonical page number when href is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(new Blob(['image-bytes'], { type: 'image/png' })),
      }),
    );
    const bookDoc = makeBookDoc({
      sections: [1, 2, 3].map(
        (page) =>
          ({
            id: `page-${page}`,
            cfi: `page-${page}`,
            size: 100,
            linear: 'yes',
            load: async () => ({
              data: `<html><body><img src="blob:page-${page}" /></body></html>`,
            }),
          }) as unknown as SectionItem,
      ),
    });

    const images = await buildReaderVisualContextImages(bookDoc, 'missing-page', 3);

    expect(images[0]).toMatchObject({ id: 'page-3', title: 'Visual page 3' });
  });

  test('resolves numeric TOC section hrefs for PDF-style documents', async () => {
    const bookDoc = makeBookDoc({
      sections: [makeSection(0, 'This readable section has enough body text to become a chapter.')],
      splitTOCHref: (href: string) => [Number(href)],
    });

    const chapters = await buildReaderChaptersForAI(bookDoc);

    expect(chapters[0]).toMatchObject({
      id: '0',
      title: 'Part One',
    });
  });
});
