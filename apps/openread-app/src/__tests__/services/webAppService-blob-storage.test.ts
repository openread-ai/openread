import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { indexedDBFileSystem } from '@/services/webAppService';

type StoredRecord = { path: string; content: unknown };

type FakeTransaction = {
  error: Error | null;
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  objectStore: () => FakeObjectStore;
};

type MutableIDBRequest<T> = {
  result: T | undefined;
  error: Error | null;
  onsuccess: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
};

type FakeObjectStore = {
  get: (key: string) => MutableIDBRequest<StoredRecord | undefined>;
  put: (record: StoredRecord) => void;
  delete: (key: string) => void;
  getAll: () => MutableIDBRequest<StoredRecord[]>;
};

const tick = (callback: () => void) => setTimeout(callback, 0);

const createRequest = <T>(): MutableIDBRequest<T> => ({
  result: undefined,
  error: null,
  onsuccess: null,
  onerror: null,
});

const installIndexedDB = () => {
  const files = new Map<string, StoredRecord>();

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
          const transaction: FakeTransaction = {
            error: null,
            oncomplete: null,
            onerror: null,
            objectStore: () => objectStore,
          };
          const complete = () => tick(() => transaction.oncomplete?.());
          const objectStore: FakeObjectStore = {
            get: (key: string) => {
              const request = createRequest<StoredRecord | undefined>();
              tick(() => {
                request.result = files.get(key);
                request.onsuccess?.(new Event('success'));
              });
              return request;
            },
            put: (record: StoredRecord) => {
              files.set(record.path, record);
              complete();
            },
            delete: (key: string) => {
              files.delete(key);
              complete();
            },
            getAll: () => {
              const request = createRequest<StoredRecord[]>();
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

describe('webAppService IndexedDB Blob storage', () => {
  let files: Map<string, StoredRecord>;

  beforeEach(() => {
    files = installIndexedDB();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes Blob-backed records without materializing them and reads/opens them compatibly', async () => {
    const blob = Object.defineProperties(new Blob(['book'], { type: 'application/epub+zip' }), {
      arrayBuffer: {
        value: vi.fn(() => Promise.resolve(new TextEncoder().encode('book').buffer)),
        configurable: true,
      },
      text: { value: vi.fn(() => Promise.resolve('book')), configurable: true },
    });
    const arrayBufferSpy = blob.arrayBuffer;

    await indexedDBFileSystem.writeFile('book.epub', 'Books', blob);

    const stored = [...files.values()][0];
    expect(stored?.content).toBe(blob);
    expect(arrayBufferSpy).not.toHaveBeenCalled();

    await expect(indexedDBFileSystem.readFile('book.epub', 'Books', 'text')).resolves.toBe('book');

    const file = await indexedDBFileSystem.openFile('book.epub', 'Books', 'book.epub');
    expect(file.name).toBe('book.epub');
    expect(file.size).toBe(4);
    expect(arrayBufferSpy).not.toHaveBeenCalled();
  });

  it('removes only the exact directory and leaves a sibling with the same prefix intact', async () => {
    await indexedDBFileSystem.writeFile('abc/book.epub', 'Books', 'delete me');
    await indexedDBFileSystem.writeFile('abc123/book.epub', 'Books', 'keep me');

    await expect(indexedDBFileSystem.readDir('abc', 'Books')).resolves.toEqual([
      { path: 'book.epub', size: 9 },
    ]);

    await indexedDBFileSystem.removeDir('abc', 'Books');

    await expect(indexedDBFileSystem.exists('abc/book.epub', 'Books')).resolves.toBe(false);
    await expect(indexedDBFileSystem.readFile('abc123/book.epub', 'Books', 'text')).resolves.toBe(
      'keep me',
    );
  });
});
