import { describe, expect, it, vi } from 'vitest';

vi.mock('@/libs/document', () => ({ EXTS: { epub: 'epub' } }));

import { reconcileCatalogBookContent } from '@/services/cloudSync';
import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';
import { getCatalogContentSourceFilename, getLocalBookFilename } from '@/utils/book';
import { testOpenReadBookRef } from '../utils/bookIdentityFixtures';

const catalogBook = (overrides: Partial<Book> = {}): Book => ({
  hash: testOpenReadBookRef('catalog:7231ff9a-24b9-4074-9369-bc7f88ffb179'),
  title: 'Catalog Book',
  author: 'Author',
  format: 'epub',
  catalogBookId: '7231ff9a-24b9-4074-9369-bc7f88ffb179',
  storagePath: 'catalog/books/gutenberg/book/new-sha/book.epub',
  progress: [4, 10],
  createdAt: 1,
  updatedAt: 2,
  ...overrides,
});

const createAppService = (
  book: Book,
  observedStoragePath?: string,
  observedLocalFilename = getLocalBookFilename(book),
) => {
  const files = new Map<string, string>();
  if (observedStoragePath) {
    files.set(
      getCatalogContentSourceFilename(book),
      JSON.stringify({
        storagePath: observedStoragePath,
        localFilename: observedLocalFilename,
      }),
    );
  }

  const appService = {
    exists: vi.fn(async (path: string, base: string) => {
      if (base !== 'Books') return false;
      return path === getLocalBookFilename(book) || files.has(path);
    }),
    readFile: vi.fn(async (path: string) => {
      const content = files.get(path);
      if (content === undefined) throw new Error('ENOENT');
      return content;
    }),
    writeFile: vi.fn(async (path: string, _base: string, content: string) => {
      files.set(path, content);
    }),
    downloadBook: vi.fn(async (candidate: Book, _onlyCover: boolean, redownload: boolean) => {
      expect(redownload).toBe(true);
      files.set(
        getCatalogContentSourceFilename(candidate),
        JSON.stringify({
          storagePath: candidate.storagePath,
          localFilename: getLocalBookFilename(candidate),
        }),
      );
    }),
  } as unknown as AppService;

  return { appService, files };
};

describe('catalog content reconciliation', () => {
  it('keeps a local file whose observed source matches the desired storage path', async () => {
    const book = catalogBook();
    const { appService } = createAppService(book, book.storagePath!);

    await expect(reconcileCatalogBookContent(book, appService)).resolves.toEqual({
      action: 'keep',
      reason: 'observed-source-matches',
    });
    expect(appService.downloadBook).not.toHaveBeenCalled();
  });

  it('replaces a differing local source once without changing stable reading identity', async () => {
    const book = catalogBook();
    const stableHash = book.hash;
    const stableProgress = book.progress;
    const { appService } = createAppService(book, 'catalog/books/gutenberg/book/old-sha/book.epub');

    await expect(reconcileCatalogBookContent(book, appService)).resolves.toEqual({
      action: 'redownload',
      reason: 'observed-source-differs',
    });
    await expect(reconcileCatalogBookContent(book, appService)).resolves.toEqual({
      action: 'keep',
      reason: 'observed-source-matches',
    });

    expect(appService.downloadBook).toHaveBeenCalledTimes(1);
    expect(appService.downloadBook).toHaveBeenCalledWith(book, false, true);
    expect(book.hash).toBe(stableHash);
    expect(book.progress).toBe(stableProgress);
  });

  it('keeps every unflagged unknown source when the remediation set is empty', async () => {
    const books = [
      catalogBook(),
      catalogBook({
        hash: testOpenReadBookRef('catalog:7231ff9a-24b9-4074-9369-bc7f88ffb180'),
        catalogBookId: '7231ff9a-24b9-4074-9369-bc7f88ffb180',
      }),
    ];
    const services = books.map((book) => createAppService(book).appService);

    const results = await Promise.all(
      books.map((book, index) => reconcileCatalogBookContent(book, services[index]!)),
    );

    expect(results).toEqual([
      { action: 'keep', reason: 'observed-source-unknown' },
      { action: 'keep', reason: 'observed-source-unknown' },
    ]);
    expect(services.every((service) => !vi.mocked(service.downloadBook).mock.calls.length)).toBe(
      true,
    );
  });

  it('treats a sidecar for a different local filename as unknown', async () => {
    const book = catalogBook();
    const { appService } = createAppService(book, book.storagePath!, 'old-title.epub');

    await expect(reconcileCatalogBookContent(book, appService)).resolves.toEqual({
      action: 'keep',
      reason: 'observed-source-unknown',
    });
    expect(appService.downloadBook).not.toHaveBeenCalled();
  });

  it('redownloads a flagged unknown source once under normal completion', async () => {
    const book = catalogBook({ contentReconcileRequired: true });
    const { appService } = createAppService(book);

    await expect(reconcileCatalogBookContent(book, appService)).resolves.toEqual({
      action: 'redownload',
      reason: 'required-observed-source-unknown',
    });
    await expect(reconcileCatalogBookContent(book, appService)).resolves.toEqual({
      action: 'keep',
      reason: 'observed-source-matches',
    });

    expect(appService.downloadBook).toHaveBeenCalledTimes(1);
  });

  it('does not prefetch a catalog book whose local file is absent', async () => {
    const book = catalogBook({ contentReconcileRequired: true });
    const { appService } = createAppService(book);
    vi.mocked(appService.exists).mockResolvedValue(false);

    await expect(reconcileCatalogBookContent(book, appService)).resolves.toEqual({
      action: 'keep',
      reason: 'local-file-absent',
    });
    expect(appService.downloadBook).not.toHaveBeenCalled();
  });
});
