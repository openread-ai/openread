import { beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadFile } from '@/libs/storage';
import type { AppService } from '@/types/system';
import type { ProgressHandler } from '@/utils/transfer';

const { isWebAppPlatformMock, tauriDownloadMock, webDownloadMock } = vi.hoisted(() => ({
  isWebAppPlatformMock: vi.fn(() => true),
  tauriDownloadMock: vi.fn(),
  webDownloadMock: vi.fn(),
}));

vi.mock('@/services/environment', () => ({
  getNodeAPIBaseUrl: () => 'https://api.openread.test',
  isWebAppPlatform: isWebAppPlatformMock,
}));

vi.mock('@/utils/fetch', () => ({
  fetchWithAuth: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/utils/transfer', () => ({
  tauriUpload: vi.fn(),
  webUpload: vi.fn(),
  tauriDownload: tauriDownloadMock,
  webDownload: webDownloadMock,
}));

type TestAppService = AppService & {
  files: Map<string, ArrayBuffer>;
  movedFiles: Array<{ srcPath: string; dstPath: string }>;
};

const toArrayBuffer = async (value: string): Promise<ArrayBuffer> =>
  new TextEncoder().encode(value).buffer as ArrayBuffer;

const blobLike = (value: string) => ({
  arrayBuffer: () => toArrayBuffer(value),
});

const sha256 = async (value: string): Promise<string> => {
  const hash = await crypto.subtle.digest('SHA-256', await toArrayBuffer(value));
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const createAppService = (): TestAppService => {
  const files = new Map<string, ArrayBuffer>();
  const appService = {
    files,
    movedFiles: [],
    writeFile: vi.fn(async (path: string, _base, content: string | ArrayBuffer | File) => {
      if (typeof content === 'string') {
        files.set(path, await toArrayBuffer(content));
        return;
      }
      if (content instanceof File) {
        files.set(path, await content.arrayBuffer());
        return;
      }
      files.set(path, content);
    }),
    openFile: vi.fn(async (path: string) => {
      const content = files.get(path);
      if (!content) throw new Error(`File not found: ${path}`);
      return {
        name: path,
        size: content.byteLength,
        arrayBuffer: async () => content,
        close: vi.fn(),
      } as unknown as File;
    }),
    deleteFile: vi.fn(async (path: string) => {
      files.delete(path);
    }),
    exists: vi.fn(async (path: string) => files.has(path)),
    copyFile: vi.fn(async (srcPath: string, dstPath: string) => {
      const content = files.get(srcPath);
      if (!content) throw new Error(`File not found: ${srcPath}`);
      files.set(dstPath, content);
    }),
    moveFile: vi.fn(async (srcPath: string, dstPath: string) => {
      const content = files.get(srcPath);
      if (!content) throw new Error(`File not found: ${srcPath}`);
      files.set(dstPath, content);
      files.delete(srcPath);
      appService.movedFiles.push({ srcPath, dstPath });
    }),
  } as unknown as TestAppService;
  return appService;
};

describe('downloadFile integrity and atomic commit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isWebAppPlatformMock.mockReturnValue(true);
  });

  it('cleans temp bytes and leaves no final file when web size verification fails', async () => {
    const appService = createAppService();
    webDownloadMock.mockResolvedValueOnce({
      headers: { 'content-length': '3' },
      blob: blobLike('bad'),
    });

    await expect(
      downloadFile({
        appService,
        cfp: 'remote/book.epub',
        dst: '/books/book.epub',
        url: 'https://r2.example/book.epub',
        expectedSizeBytes: 4,
      }),
    ).rejects.toThrow('Downloaded file size mismatch');

    expect(appService.files.has('/books/book.epub')).toBe(false);
    expect(
      Array.from(appService.files.keys()).filter((path) => path.includes('.download-')),
    ).toEqual([]);
    expect(appService.moveFile).not.toHaveBeenCalled();
  });

  it('rejects hash mismatches before final commit', async () => {
    const appService = createAppService();
    webDownloadMock.mockResolvedValueOnce({
      headers: { 'content-length': '4' },
      blob: blobLike('book'),
    });

    await expect(
      downloadFile({
        appService,
        cfp: 'remote/book.epub',
        dst: '/books/book.epub',
        url: 'https://r2.example/book.epub',
        expectedSizeBytes: 4,
        expectedSha256: '0'.repeat(64),
      }),
    ).rejects.toThrow('Downloaded file hash mismatch');

    expect(appService.files.has('/books/book.epub')).toBe(false);
    expect(
      Array.from(appService.files.keys()).filter((path) => path.includes('.download-')),
    ).toEqual([]);
  });

  it('promotes a verified web download and preserves progress callbacks', async () => {
    const appService = createAppService();
    const onProgress = vi.fn<ProgressHandler>();
    webDownloadMock.mockImplementationOnce(async (_url: string, progress?: ProgressHandler) => {
      progress?.({ progress: 4, total: 4, transferSpeed: 10 });
      return { headers: { 'content-length': '4' }, blob: blobLike('book') };
    });

    const headers = await downloadFile({
      appService,
      cfp: 'remote/book.epub',
      dst: '/books/book.epub',
      url: 'https://r2.example/book.epub',
      expectedSizeBytes: 4,
      expectedSha256: await sha256('book'),
      onProgress,
    });

    expect(headers).toEqual({ 'content-length': '4' });
    expect(onProgress).toHaveBeenCalledWith({ progress: 4, total: 4, transferSpeed: 10 });
    expect(appService.files.get('/books/book.epub')).toBeTruthy();
    expect(appService.movedFiles).toHaveLength(1);
    expect(appService.movedFiles[0]!.dstPath).toBe('/books/book.epub');
    expect(
      Array.from(appService.files.keys()).filter((path) => path.includes('.download-')),
    ).toEqual([]);
  });

  it('replaces an existing final file only after web download verification succeeds', async () => {
    const appService = createAppService();
    appService.files.set('/books/book.epub', await toArrayBuffer('old-book'));
    webDownloadMock.mockResolvedValueOnce({
      headers: { 'content-length': '4' },
      blob: blobLike('book'),
    });

    await downloadFile({
      appService,
      cfp: 'remote/book.epub',
      dst: '/books/book.epub',
      url: 'https://r2.example/book.epub',
      expectedSizeBytes: 4,
      expectedSha256: await sha256('book'),
    });

    expect(new TextDecoder().decode(appService.files.get('/books/book.epub')!)).toBe('book');
    expect(appService.movedFiles.map(({ dstPath }) => dstPath)).toEqual([
      expect.stringContaining('/books/book.epub.replace-'),
      '/books/book.epub',
    ]);
    expect(Array.from(appService.files.keys()).some((path) => path.includes('.replace-'))).toBe(
      false,
    );
    expect(
      Array.from(appService.files.keys()).filter((path) => path.includes('.download-')),
    ).toEqual([]);
  });

  it('preserves an existing final file when temp verification fails', async () => {
    const appService = createAppService();
    appService.files.set('/books/book.epub', await toArrayBuffer('old-book'));
    webDownloadMock.mockResolvedValueOnce({
      headers: { 'content-length': '3' },
      blob: blobLike('bad'),
    });

    await expect(
      downloadFile({
        appService,
        cfp: 'remote/book.epub',
        dst: '/books/book.epub',
        url: 'https://r2.example/book.epub',
        expectedSizeBytes: 4,
      }),
    ).rejects.toThrow('Downloaded file size mismatch');

    expect(new TextDecoder().decode(appService.files.get('/books/book.epub')!)).toBe('old-book');
    expect(appService.moveFile).not.toHaveBeenCalled();
    expect(
      Array.from(appService.files.keys()).filter((path) => path.includes('.download-')),
    ).toEqual([]);
  });

  it('keeps the backup when promotion and restore fail after verification', async () => {
    const appService = createAppService();
    appService.files.set('/books/book.epub', await toArrayBuffer('old-book'));
    appService.moveFile = vi.fn(async (srcPath: string, dstPath: string) => {
      if (srcPath.includes('.download-') && dstPath === '/books/book.epub') {
        throw new Error('promotion failed');
      }
      if (srcPath.includes('.replace-') && dstPath === '/books/book.epub') {
        throw new Error('restore failed');
      }

      const content = appService.files.get(srcPath);
      if (!content) throw new Error(`File not found: ${srcPath}`);
      appService.files.set(dstPath, content);
      appService.files.delete(srcPath);
      appService.movedFiles.push({ srcPath, dstPath });
    });
    webDownloadMock.mockResolvedValueOnce({
      headers: { 'content-length': '4' },
      blob: blobLike('book'),
    });

    await expect(
      downloadFile({
        appService,
        cfp: 'remote/book.epub',
        dst: '/books/book.epub',
        url: 'https://r2.example/book.epub',
        expectedSizeBytes: 4,
        expectedSha256: await sha256('book'),
      }),
    ).rejects.toThrow('promotion failed');

    const backupPath = Array.from(appService.files.keys()).find((path) =>
      path.includes('.replace-'),
    );
    expect(backupPath).toBeTruthy();
    expect(new TextDecoder().decode(appService.files.get(backupPath!)!)).toBe('old-book');
    expect(appService.files.has('/books/book.epub')).toBe(false);
    expect(
      Array.from(appService.files.keys()).filter((path) => path.includes('.download-')),
    ).toEqual([]);
  });

  it('downloads native bytes to temp before moving the verified file to final', async () => {
    const appService = createAppService();
    isWebAppPlatformMock.mockReturnValue(false);
    tauriDownloadMock.mockImplementationOnce(async (_url: string, tempPath: string) => {
      await appService.writeFile(tempPath, 'None', await toArrayBuffer('book'));
      return { 'content-length': '4' };
    });

    await downloadFile({
      appService,
      cfp: 'remote/book.epub',
      dst: '/books/book.epub',
      url: 'https://r2.example/book.epub',
      expectedSizeBytes: 4,
      expectedSha256: await sha256('book'),
    });

    expect(tauriDownloadMock).toHaveBeenCalledWith(
      'https://r2.example/book.epub',
      expect.stringContaining('/books/book.epub.download-'),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(appService.files.get('/books/book.epub')).toBeTruthy();
    expect(appService.movedFiles).toHaveLength(1);
    expect(
      Array.from(appService.files.keys()).filter((path) => path.includes('.download-')),
    ).toEqual([]);
  });
});
