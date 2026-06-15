import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CloudSyncService } from '@/services/cloudSync';
import type { Book } from '@/types/book';
import type { FileSystem } from '@/types/system';
import { uploadFile } from '@/libs/storage';

vi.mock('@/libs/storage', () => ({
  createProgressHandler: () => () => {},
  uploadFile: vi.fn(async () => undefined),
  downloadFile: vi.fn(),
  deleteFile: vi.fn(),
  batchGetDownloadUrls: vi.fn(),
}));

const baseBook = (overrides: Partial<Book> = {}): Book => ({
  hash: '0123456789abcdef0123456789abcdef',
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
  }) as unknown as FileSystem;

describe('CloudSyncService uploadBook', () => {
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
});
