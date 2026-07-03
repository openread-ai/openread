import { testOpenReadBookRef } from '../utils/bookIdentityFixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CloudSyncService, COVER_DOWNLOAD_CONCURRENCY } from '@/services/cloudSync';
import type { Book } from '@/types/book';
import type { FileSystem } from '@/types/system';
import { batchGetDownloadUrls, deleteFile, downloadFile, uploadFile } from '@/libs/storage';
import { CLOUD_BOOKS_SUBDIR } from '@/services/constants';
import { getCoverFilename, getRemoteBookFilename } from '@/utils/book';

vi.mock('@/libs/storage', () => ({
  createProgressHandler: () => () => {},
  uploadFile: vi.fn(async () => undefined),
  downloadFile: vi.fn(),
  deleteFile: vi.fn(),
  batchGetDownloadUrls: vi.fn(),
}));

const baseBook = (overrides: Partial<Book> = {}): Book => ({
  hash: testOpenReadBookRef('0123456789abcdef0123456789abcdef'),
  title: 'Manual Book',
  author: 'Author',
  format: 'epub',
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const createFs = (existingPaths: Set<string>): FileSystem =>
  ({
    exists: vi.fn(async (path: string) => existingPaths.has(path)),
    openFile: vi.fn(async () => new File(['book'], 'book.epub')),
    writeFile: vi.fn(async () => {}),
    createDir: vi.fn(async () => {}),
  }) as unknown as FileSystem;

const createCoverBooks = (count: number): Book[] =>
  Array.from({ length: count }, (_, index) =>
    baseBook({
      hash: testOpenReadBookRef(index.toString(16).padStart(32, '0')),
      title: `Book ${index}`,
    }),
  );

describe('CloudSyncService storage lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not mark a cover-only record as uploaded without local book bytes', async () => {
    const fs = createFs(new Set(['0123456789abcdef0123456789abcdef/cover.png']));
    const service = new CloudSyncService(fs, '/books', async (path) => `/books/${path}`);
    const book = baseBook();

    await expect(service.uploadBook(book)).rejects.toThrow('Book file not uploaded');

    expect(uploadFile).not.toHaveBeenCalled();
    expect(book.uploadedAt).toBeUndefined();
  });

  it('uploads a local manual book and marks it uploaded', async () => {
    const book = baseBook();
    const fs = createFs(new Set(['0123456789abcdef0123456789abcdef/Manual Book.epub']));
    const service = new CloudSyncService(fs, '/books', async (path) => `/books/${path}`);

    await service.uploadBook(book);

    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(book.uploadedAt).toEqual(expect.any(Number));
    expect(book.downloadedAt).toEqual(expect.any(Number));
  });

  it('does not mark a book downloaded when download verification rejects', async () => {
    vi.mocked(downloadFile).mockRejectedValueOnce(new Error('Downloaded file size mismatch'));
    const book = baseBook({ uploadedAt: 123, downloadedAt: null });
    const fs = createFs(new Set([getCoverFilename(book)]));
    const service = new CloudSyncService(fs, '/books', async (path) => `/books/${path}`);

    await expect(service.downloadBook(book, {} as never)).rejects.toThrow(
      'Downloaded file size mismatch',
    );

    expect(downloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedSha256: book.platformHash,
        cfp: `${CLOUD_BOOKS_SUBDIR}/${getRemoteBookFilename(book)}`,
      }),
    );
    expect(book.downloadedAt).toBeNull();
  });

  it('bounds catalog cover downloads at the shared cover sync seam', async () => {
    const books = createCoverBooks(48);
    vi.mocked(batchGetDownloadUrls).mockResolvedValue(
      books.map((book) => ({
        lfp: getCoverFilename(book),
        cfp: `${CLOUD_BOOKS_SUBDIR}/${getCoverFilename(book)}`,
        downloadUrl: `https://r2.example/${book.hash}/cover.png`,
        sizeBytes: 123,
      })),
    );

    let activeDownloads = 0;
    let maxActiveDownloads = 0;
    vi.mocked(downloadFile).mockImplementation(async () => {
      activeDownloads++;
      maxActiveDownloads = Math.max(maxActiveDownloads, activeDownloads);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeDownloads--;
      return {};
    });

    const service = new CloudSyncService(createFs(new Set()), '/books', async (path) => path);

    await service.downloadBookCovers(books, {} as never);

    expect(batchGetDownloadUrls).toHaveBeenCalledWith(expect.any(Array), {
      concurrency: COVER_DOWNLOAD_CONCURRENCY,
    });
    expect(downloadFile).toHaveBeenCalledTimes(books.length);
    expect(maxActiveDownloads).toBeLessThanOrEqual(COVER_DOWNLOAD_CONCURRENCY);
    expect(Math.max(...books.map((book) => book.coverDownloadedAt ?? 0))).toBeGreaterThan(0);
  });

  it('keeps catalog cover download failures non-fatal', async () => {
    const books = createCoverBooks(3);
    vi.mocked(batchGetDownloadUrls).mockResolvedValue(
      books.map((book) => ({
        lfp: getCoverFilename(book),
        cfp: `${CLOUD_BOOKS_SUBDIR}/${getCoverFilename(book)}`,
        downloadUrl: `https://r2.example/${book.hash}/cover.png`,
        sizeBytes: 123,
      })),
    );
    vi.mocked(downloadFile)
      .mockRejectedValueOnce(new Error('Download intent failed: 429'))
      .mockResolvedValue({});

    const service = new CloudSyncService(createFs(new Set()), '/books', async (path) => path);

    await expect(service.downloadBookCovers(books, {} as never)).resolves.toBeUndefined();

    expect(downloadFile).toHaveBeenCalledTimes(books.length);
    expect(books[0]!.coverDownloadedAt).toBeUndefined();
    expect(books[1]!.coverDownloadedAt).toEqual(expect.any(Number));
    expect(books[2]!.coverDownloadedAt).toEqual(expect.any(Number));
  });

  it('does not delete cloud files when the book is not uploaded', async () => {
    const book = baseBook({ uploadedAt: null });
    const service = new CloudSyncService(
      createFs(new Set()),
      '/books',
      async (path) => `/books/${path}`,
    );

    await service.deleteBookFromCloud(book);

    expect(deleteFile).not.toHaveBeenCalled();
    expect(book.uploadedAt).toBeNull();
  });

  it('deletes both remote book and cover files and clears uploadedAt', async () => {
    const book = baseBook({ uploadedAt: 123 });
    const service = new CloudSyncService(
      createFs(new Set()),
      '/books',
      async (path) => `/books/${path}`,
    );

    await service.deleteBookFromCloud(book);

    expect(deleteFile).toHaveBeenCalledWith(`${CLOUD_BOOKS_SUBDIR}/${getRemoteBookFilename(book)}`);
    expect(deleteFile).toHaveBeenCalledWith(`${CLOUD_BOOKS_SUBDIR}/${getCoverFilename(book)}`);
    expect(deleteFile).toHaveBeenCalledTimes(2);
    expect(book.uploadedAt).toBeNull();
  });

  it('keeps uploadedAt retryable when one remote delete fails transiently', async () => {
    vi.mocked(deleteFile).mockRejectedValueOnce(new Error('remote delete failed'));
    const book = baseBook({ uploadedAt: 123 });
    const service = new CloudSyncService(
      createFs(new Set()),
      '/books',
      async (path) => `/books/${path}`,
    );

    await expect(service.deleteBookFromCloud(book)).resolves.toBeUndefined();

    expect(deleteFile).toHaveBeenCalledTimes(2);
    expect(book.uploadedAt).toBe(123);
  });

  it('clears uploadedAt when remote files are already missing', async () => {
    const book = baseBook({ uploadedAt: 123 });
    const service = new CloudSyncService(
      createFs(new Set()),
      '/books',
      async (path) => `/books/${path}`,
    );

    await service.deleteBookFromCloud(book);

    expect(deleteFile).toHaveBeenCalledTimes(2);
    expect(book.uploadedAt).toBeNull();
  });
});
