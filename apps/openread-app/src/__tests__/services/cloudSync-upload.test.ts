import { testOpenReadBookRef } from '../utils/bookIdentityFixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CloudSyncService, COVER_DOWNLOAD_CONCURRENCY } from '@/services/cloudSync';
import type { Book } from '@/types/book';
import type { FileSystem } from '@/types/system';
import { batchGetDownloadUrls, downloadFile, uploadFile } from '@/libs/storage';
import { CLOUD_BOOKS_SUBDIR } from '@/services/constants';
import { getCoverFilename, getLocalBookFilename, getRemoteBookFilename } from '@/utils/book';

const mockCaptureMessage = vi.hoisted(() => vi.fn());

vi.mock('@sentry/nextjs', () => ({
  captureMessage: mockCaptureMessage,
}));

vi.mock('@/utils/misc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/misc')>()),
  getOSPlatform: () => 'macos',
}));

vi.mock('@/libs/storage', () => ({
  createProgressHandler: () => () => {},
  uploadFile: vi.fn(async () => ({
    fileId: 'canonical-book-file',
    objectKey: 'users/user-1/books/canonical.epub',
  })),
  downloadFile: vi.fn(),
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

const coverDownloadResult = (
  book: Book,
  overrides: { downloadUrl?: string; sizeBytes?: number | null } = {},
) => ({
  lfp: getCoverFilename(book),
  cfp: `${CLOUD_BOOKS_SUBDIR}/${getCoverFilename(book)}`,
  bookHash: book.hash,
  title: book.title,
  format: book.format,
  downloadUrl: `https://r2.example/${book.hash}/cover.png`,
  sizeBytes: 123,
  ...overrides,
});

describe('CloudSyncService storage lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_PLATFORM', 'tauri');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not mark a cover-only record as uploaded without local book bytes', async () => {
    const fs = createFs(new Set(['0123456789abcdef0123456789abcdef/cover.png']));
    const service = new CloudSyncService(fs, '/books', async (path) => `/books/${path}`);
    const book = baseBook();

    await expect(service.uploadBook(book)).rejects.toThrow('Book file not uploaded');

    expect(uploadFile).not.toHaveBeenCalled();
    expect(book.uploadedAt).toBeUndefined();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('uploads a local manual book and marks it uploaded', async () => {
    const book = baseBook();
    const fs = createFs(new Set(['0123456789abcdef0123456789abcdef/Manual Book.epub']));
    const service = new CloudSyncService(fs, '/books', async (path) => `/books/${path}`);

    await service.uploadBook(book);

    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(book.sizeBytes).toBe(4);
    expect(book.uploadedAt).toEqual(expect.any(Number));
    expect(book.downloadedAt).toEqual(expect.any(Number));
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'Sideloaded cover pipeline produced no usable cover',
      {
        level: 'warning',
        tags: {
          reason: 'upload-skipped-no-local-cover',
          format: 'epub',
          platform: 'tauri',
        },
        extra: {
          book_hash: book.hash,
          title: 'Manual Book',
          size_bytes: 4,
        },
      },
    );
  });

  it('stays silent when a local cover is uploaded', async () => {
    const book = baseBook();
    const fs = createFs(new Set([getLocalBookFilename(book), getCoverFilename(book)]));
    const service = new CloudSyncService(fs, '/books', async (path) => `/books/${path}`);

    await service.uploadBook(book);

    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('keeps upload behavior unchanged when Sentry is unavailable', async () => {
    const book = baseBook();
    const fs = createFs(new Set([getLocalBookFilename(book)]));
    const service = new CloudSyncService(fs, '/books', async (path) => `/books/${path}`);
    mockCaptureMessage.mockImplementationOnce(() => {
      throw new Error('Sentry not initialized');
    });

    await expect(service.uploadBook(book)).resolves.toBeUndefined();

    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(book.uploadedAt).toEqual(expect.any(Number));
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

  it('bounds private cloud cover downloads at the shared cover sync seam', async () => {
    const books = createCoverBooks(48);
    vi.mocked(batchGetDownloadUrls).mockResolvedValue(
      books.map((book) => coverDownloadResult(book)),
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
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('reports a missing cover download URL and preserves the non-fatal skip', async () => {
    const book = baseBook();
    vi.mocked(batchGetDownloadUrls).mockResolvedValue([
      coverDownloadResult(book, { downloadUrl: undefined, sizeBytes: null }),
    ]);
    const service = new CloudSyncService(createFs(new Set()), '/books', async (path) => path);

    await expect(service.downloadBookCovers([book], {} as never)).resolves.toBeUndefined();

    expect(downloadFile).not.toHaveBeenCalled();
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'Sideloaded cover pipeline produced no usable cover',
      {
        level: 'warning',
        tags: {
          reason: 'download-skipped-no-url',
          format: 'epub',
          platform: 'tauri',
        },
        extra: {
          book_hash: book.hash,
          title: 'Manual Book',
          size_bytes: null,
        },
      },
    );
    const capturedPayload = mockCaptureMessage.mock.calls[0]?.[1] as
      | { extra?: Record<string, unknown> }
      | undefined;
    expect(capturedPayload?.extra).not.toHaveProperty('message');
    expect(capturedPayload?.extra).not.toHaveProperty('error_message');
    expect(capturedPayload?.extra).not.toHaveProperty('stack');
  });

  it('keeps private cloud cover download failures non-fatal', async () => {
    const books = createCoverBooks(3);
    vi.mocked(batchGetDownloadUrls).mockResolvedValue(
      books.map((book) => coverDownloadResult(book)),
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
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'Sideloaded cover pipeline produced no usable cover',
      {
        level: 'warning',
        tags: {
          reason: 'cover-download-threw',
          format: 'epub',
          platform: 'tauri',
        },
        extra: {
          book_hash: books[0]!.hash,
          title: 'Book 0',
          size_bytes: 123,
          error_name: 'Error',
        },
      },
    );
    const capturedPayload = mockCaptureMessage.mock.calls[0]?.[1] as
      | { extra?: Record<string, unknown> }
      | undefined;
    expect(capturedPayload?.extra).not.toHaveProperty('message');
    expect(capturedPayload?.extra).not.toHaveProperty('error_message');
    expect(capturedPayload?.extra).not.toHaveProperty('stack');
  });

  it('downloads covers for storage-backed user imports', async () => {
    const userBook = baseBook({ storagePath: 'Openread/Books/user-import.epub' });
    vi.mocked(batchGetDownloadUrls).mockResolvedValue([coverDownloadResult(userBook)]);
    vi.mocked(downloadFile).mockResolvedValue({});
    const service = new CloudSyncService(createFs(new Set()), '/books', async (path) => path);

    await service.downloadBookCovers([userBook], {} as never);

    expect(batchGetDownloadUrls).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          bookHash: userBook.hash,
          title: userBook.title,
          format: userBook.format,
        }),
      ],
      { concurrency: COVER_DOWNLOAD_CONCURRENCY },
    );
    expect(downloadFile).toHaveBeenCalledTimes(1);
  });

  it('does not request private cover URLs for catalog books', async () => {
    const catalogBook = baseBook({
      hash: testOpenReadBookRef('catalog:11111111-1111-4111-8111-111111111111'),
      catalogBookId: '11111111-1111-4111-8111-111111111111',
      storagePath: 'catalog/books/source/book.epub',
    });
    const service = new CloudSyncService(createFs(new Set()), '/books', async (path) => path);

    await service.downloadBookCovers([catalogBook], {} as never);

    expect(batchGetDownloadUrls).not.toHaveBeenCalled();
    expect(downloadFile).not.toHaveBeenCalled();
    expect(catalogBook.coverDownloadedAt).toBeUndefined();
  });

  it('skips the private cover leg when a direct catalog download is requested', async () => {
    const catalogBook = baseBook({
      hash: testOpenReadBookRef('catalog:11111111-1111-4111-8111-111111111111'),
      catalogBookId: '11111111-1111-4111-8111-111111111111',
      storagePath: 'catalog/books/source/book.epub',
    });
    const service = new CloudSyncService(createFs(new Set()), '/books', async (path) => path);

    await service.downloadBook(catalogBook, {} as never, true);

    expect(downloadFile).not.toHaveBeenCalled();
    expect(catalogBook.coverDownloadedAt).toBeUndefined();
  });
});
