import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadFile } from '@/libs/storage';
import { indexedDBFileSystem } from '@/services/webAppService';
import type { AppService, BaseDir } from '@/types/system';
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

type StoredContent = ArrayBuffer | Blob;

type TestAppService = AppService & {
  files: Map<string, StoredContent>;
  movedFiles: Array<{ srcPath: string; dstPath: string }>;
};

const toArrayBuffer = async (value: string): Promise<ArrayBuffer> =>
  new TextEncoder().encode(value).buffer as ArrayBuffer;

const storedArrayBuffer = async (content: StoredContent): Promise<ArrayBuffer> =>
  content instanceof Blob ? content.arrayBuffer() : content;

const storedText = async (content: StoredContent): Promise<string> =>
  new TextDecoder().decode(await storedArrayBuffer(content));

const blobLike = (value: string) =>
  Object.defineProperties(new Blob([value]), {
    arrayBuffer: { value: vi.fn(() => toArrayBuffer(value)), configurable: true },
    text: { value: vi.fn(() => Promise.resolve(value)), configurable: true },
  });

type FakeIDBRecord = { path: string; content: unknown };

type MutableIDBRequest<T> = {
  result: T | undefined;
  error: Error | null;
  onsuccess: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
};

type FakeIDBTransaction = {
  error: Error | null;
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  objectStore: () => FakeIDBObjectStore;
};

type FakeIDBObjectStore = {
  get: (key: string) => MutableIDBRequest<FakeIDBRecord | undefined>;
  put: (record: FakeIDBRecord) => void;
  delete: (key: string) => void;
  getAll: () => MutableIDBRequest<FakeIDBRecord[]>;
};

const tick = (callback: () => void) => setTimeout(callback, 0);

const createRequest = <T>(): MutableIDBRequest<T> => ({
  result: undefined,
  error: null,
  onsuccess: null,
  onerror: null,
});

const installIndexedDB = () => {
  const files = new Map<string, FakeIDBRecord>();

  const indexedDB = {
    open: vi.fn(() => {
      const openRequest = {
        result: null as IDBDatabase | null,
        error: null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onupgradeneeded: null as (() => void) | null,
      };

      const db = {
        objectStoreNames: {
          contains: (name: string) => name === 'files',
        },
        createObjectStore: vi.fn(),
        transaction: vi.fn(() => {
          const transaction: FakeIDBTransaction = {
            error: null,
            oncomplete: null,
            onerror: null,
            objectStore: () => objectStore,
          };
          const complete = () => tick(() => transaction.oncomplete?.());
          const objectStore: FakeIDBObjectStore = {
            get: (key: string) => {
              const request = createRequest<FakeIDBRecord | undefined>();
              tick(() => {
                request.result = files.get(key);
                request.onsuccess?.(new Event('success'));
              });
              return request;
            },
            put: (record: FakeIDBRecord) => {
              files.set(record.path, record);
              complete();
            },
            delete: (key: string) => {
              files.delete(key);
              complete();
            },
            getAll: () => {
              const request = createRequest<FakeIDBRecord[]>();
              tick(() => {
                request.result = [...files.values()];
                request.onsuccess?.(new Event('success'));
              });
              return request;
            },
          };
          return transaction;
        }),
      } as unknown as IDBDatabase;

      tick(() => {
        openRequest.result = db;
        openRequest.onupgradeneeded?.();
        openRequest.onsuccess?.();
      });

      return openRequest;
    }),
  } as unknown as IDBFactory;

  vi.stubGlobal('indexedDB', indexedDB);
  return files;
};

const createIndexedDBAppService = (): AppService =>
  ({
    writeFile: (path: string, base: BaseDir, content: string | ArrayBuffer | Blob) =>
      indexedDBFileSystem.writeFile(path, base, content),
    openFile: (path: string, base: BaseDir) => indexedDBFileSystem.openFile(path, base),
    deleteFile: (path: string, base: BaseDir) => indexedDBFileSystem.removeFile(path, base),
    exists: (path: string, base: BaseDir) => indexedDBFileSystem.exists(path, base),
    copyFile: (srcPath: string, dstPath: string, base: BaseDir) =>
      indexedDBFileSystem.copyFile(srcPath, dstPath, base),
    moveFile: (srcPath: string, dstPath: string, base: BaseDir) =>
      indexedDBFileSystem.moveFile?.(srcPath, dstPath, base),
  }) as unknown as AppService;

const sha256 = async (value: string): Promise<string> => {
  const hash = await crypto.subtle.digest('SHA-256', await toArrayBuffer(value));
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const createAppService = (): TestAppService => {
  const files = new Map<string, StoredContent>();
  const appService = {
    files,
    movedFiles: [],
    writeFile: vi.fn(async (path: string, _base, content: string | ArrayBuffer | Blob) => {
      if (typeof content === 'string') {
        files.set(path, await toArrayBuffer(content));
        return;
      }
      files.set(path, content);
    }),
    openFile: vi.fn(async (path: string) => {
      const content = files.get(path);
      if (!content) throw new Error(`File not found: ${path}`);
      return {
        name: path,
        size: content instanceof Blob ? content.size : content.byteLength,
        arrayBuffer: async () => storedArrayBuffer(content),
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

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('writes the web download Blob directly to temp storage without materializing an ArrayBuffer', async () => {
    const appService = createAppService();
    const blob = blobLike('book');
    const arrayBufferSpy = blob.arrayBuffer;
    webDownloadMock.mockResolvedValueOnce({
      headers: { 'content-length': '4' },
      blob,
    });

    await downloadFile({
      appService,
      cfp: 'remote/book.epub',
      dst: '/books/book.epub',
      url: 'https://r2.example/book.epub',
      expectedSizeBytes: 4,
    });

    expect(appService.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('/books/book.epub.download-'),
      'None',
      blob,
    );
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(appService.files.get('/books/book.epub')).toBe(blob);
  });

  it('keeps size-only web verification on the IndexedDB Blob path without materializing bytes', async () => {
    installIndexedDB();
    const appService = createIndexedDBAppService();
    const blob = blobLike('book');
    const arrayBufferSpy = blob.arrayBuffer;
    webDownloadMock.mockResolvedValueOnce({
      headers: { 'content-length': '4' },
      blob,
    });

    await downloadFile({
      appService,
      cfp: 'remote/book.epub',
      dst: '/books/book.epub',
      url: 'https://r2.example/book.epub',
      expectedSizeBytes: 4,
    });

    expect(arrayBufferSpy).not.toHaveBeenCalled();
    const file = await indexedDBFileSystem.openFile('/books/book.epub', 'None');
    expect(file.size).toBe(4);
    expect(arrayBufferSpy).not.toHaveBeenCalled();
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

    await expect(storedText(appService.files.get('/books/book.epub')!)).resolves.toBe('book');
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

    await expect(storedText(appService.files.get('/books/book.epub')!)).resolves.toBe('old-book');
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
    await expect(storedText(appService.files.get(backupPath!)!)).resolves.toBe('old-book');
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
