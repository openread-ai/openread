import { beforeEach, describe, expect, it, vi } from 'vitest';

import { batchGetDownloadUrls } from '@/libs/storage';

const { fetchWithAuthMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
}));

vi.mock('@/services/environment', () => ({
  getNodeAPIBaseUrl: () => 'https://api.openread.test',
  isWebAppPlatform: () => true,
}));

vi.mock('@/utils/fetch', () => ({
  fetchWithAuth: fetchWithAuthMock,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

const coverFiles = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    lfp: `book-${index}/cover.png`,
    cfp: `books/book-${index}/cover.png`,
  }));

const response = (body: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    json: async () => body,
  }) as Response;

describe('batchGetDownloadUrls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bounds cover download intent requests by the requested concurrency', async () => {
    const files = coverFiles(48);
    let activeRequests = 0;
    let maxActiveRequests = 0;

    fetchWithAuthMock.mockImplementation(async (_url: string, init: RequestInit) => {
      activeRequests++;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeRequests--;

      const { logicalPath } = JSON.parse(init.body as string) as { logicalPath: string };
      return response({
        fileId: null,
        objectKey: logicalPath,
        downloadUrl: `https://r2.example/${logicalPath}`,
        sizeBytes: 123,
      });
    });

    const results = await batchGetDownloadUrls(files, { concurrency: 4 });

    expect(fetchWithAuthMock).toHaveBeenCalledTimes(files.length);
    expect(maxActiveRequests).toBeLessThanOrEqual(4);
    expect(results).toHaveLength(files.length);
    expect(results.every((result) => result.downloadUrl)).toBe(true);
  });

  it('treats 429 cover download intent failures as non-fatal missing URLs', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(response({}, false, 429)).mockResolvedValueOnce(
      response({
        fileId: null,
        objectKey: 'books/book-1/cover.png',
        downloadUrl: 'https://r2.example/books/book-1/cover.png',
        sizeBytes: 123,
      }),
    );

    const results = await batchGetDownloadUrls(coverFiles(2), { concurrency: 1 });

    expect(results[0]).toMatchObject({ downloadUrl: undefined, sizeBytes: null });
    expect(results[1]).toMatchObject({
      downloadUrl: 'https://r2.example/books/book-1/cover.png',
      sizeBytes: 123,
    });
  });
});
