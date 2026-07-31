import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runAccountLibraryMutation } from '@/services/accountLibraryLifecycle';
import { cleanupDeletedBookArtifacts } from '@/services/deletedBookArtifactCleanup';
import { LOCAL_PERSISTENCE_PREFIXES } from '@/services/persistence/localPersistenceRegistry';
import { useBookDataStore } from '@/store/bookDataStore';
import type { TransferItem, TransferType } from '@/store/transferStore';
import type { Book } from '@/types/book';
import type { AppService, BaseDir, FileItem } from '@/types/system';
import { testLocalBookHash } from '../utils/bookIdentityFixtures';

const ownerUserId = 'user-a';

const book = (hash: Book['hash'], overrides: Partial<Book> = {}): Book => ({
  hash,
  title: `Book ${hash.slice(0, 6)}`,
  author: 'Author',
  format: 'epub',
  createdAt: 1,
  updatedAt: 2,
  deletedAt: 2,
  ...overrides,
});

const transfer = (
  hash: Book['hash'],
  type: TransferType,
  overrides: Partial<TransferItem> = {},
): TransferItem => ({
  id: `${type}-${hash}`,
  ownerUserId,
  bookHash: hash,
  bookTitle: 'Book',
  type,
  status: 'pending',
  progress: 0,
  totalBytes: 0,
  transferredBytes: 0,
  transferSpeed: 0,
  retryCount: 0,
  maxRetries: 3,
  createdAt: 1,
  priority: 1,
  isBackground: false,
  ...overrides,
});

const directoryKey = (path: string, base: BaseDir) => `${base}:${path}`;

function createAppService(initial: Record<string, FileItem[]> = {}) {
  const directories = new Map(Object.entries(initial));
  const appService = {
    exists: vi.fn(async (path: string, base: BaseDir) => directories.has(directoryKey(path, base))),
    readDirectory: vi.fn(
      async (path: string, base: BaseDir) => directories.get(directoryKey(path, base)) ?? [],
    ),
    deleteDir: vi.fn(async (path: string, base: BaseDir) => {
      directories.delete(directoryKey(path, base));
    }),
  } as unknown as AppService;
  return { appService, directories };
}

function seedBookData(...hashes: Book['hash'][]) {
  useBookDataStore.setState({
    booksData: Object.fromEntries(
      hashes.map((hash) => [
        hash,
        {
          id: hash,
          book: book(hash),
          file: new File(['book'], 'book.epub'),
          config: null,
          bookDoc: null,
          isFixedLayout: false,
        },
      ]),
    ),
    preSyncedConfigs: Object.fromEntries(hashes.map((hash) => [hash, { updatedAt: 1 }])),
  });
}

interface CleanupOverrides {
  libraryLoaded?: boolean;
  libraryReconciliationSettled?: boolean;
  transfers?: TransferItem[];
  openReaderBookKeys?: string[];
  ownerUserId?: string | null;
  isOwnerCurrent?: () => boolean;
  getCurrentState?: () => {
    library: readonly Book[];
    libraryLoaded: boolean;
    libraryReconciliationSettled: boolean;
    transfers: readonly TransferItem[];
    openReaderBookKeys: readonly string[];
  };
  storage?: Storage;
}

const runCleanup = (appService: AppService, library: Book[], overrides: CleanupOverrides = {}) => {
  const currentState = {
    library,
    libraryLoaded: overrides.libraryLoaded ?? true,
    libraryReconciliationSettled: overrides.libraryReconciliationSettled ?? true,
    transfers: overrides.transfers ?? [],
    openReaderBookKeys: overrides.openReaderBookKeys ?? [],
  };
  return cleanupDeletedBookArtifacts({
    appService,
    library,
    ownerUserId: overrides.ownerUserId === undefined ? ownerUserId : overrides.ownerUserId,
    isOwnerCurrent: overrides.isOwnerCurrent ?? (() => true),
    getCurrentState: overrides.getCurrentState ?? (() => currentState),
    storage: overrides.storage,
  });
};

describe('cleanupDeletedBookArtifacts', () => {
  beforeEach(() => {
    localStorage.clear();
    useBookDataStore.setState({ booksData: {}, preSyncedConfigs: {} });
  });

  it('evicts all hash-addressed artifacts while retaining the tombstone row', async () => {
    const hash = testLocalBookHash('cleanup-success');
    const tombstone = book(hash);
    const { appService, directories } = createAppService({
      [directoryKey(hash, 'Books')]: [
        { path: 'book.epub', size: 100 },
        { path: 'cover.png', size: 25 },
      ],
      [directoryKey(`search/${hash}`, 'Cache')]: [{ path: 'query.json', size: 10 }],
    });
    seedBookData(hash);
    const targetKey = `${LOCAL_PERSISTENCE_PREFIXES.readerSearchHistory}${hash}`;
    const otherHash = testLocalBookHash('cleanup-other');
    const otherKey = `${LOCAL_PERSISTENCE_PREFIXES.readerSearchHistory}${otherHash}`;
    localStorage.setItem(targetKey, 'target');
    localStorage.setItem(otherKey, 'other');

    const summary = await runCleanup(appService, [tombstone]);

    expect(summary).toEqual({
      candidates: 1,
      evicted: 1,
      retained: 0,
      failed: 0,
      bytesReclaimed: 135,
      localStorageKeysRemoved: 1,
      evictedBookHashes: [hash],
    });
    expect(directories.has(directoryKey(hash, 'Books'))).toBe(false);
    expect(directories.has(directoryKey(`search/${hash}`, 'Cache'))).toBe(false);
    expect(localStorage.getItem(targetKey)).toBeNull();
    expect(localStorage.getItem(otherKey)).toBe('other');
    expect(useBookDataStore.getState().booksData[hash]).toBeUndefined();
    expect(useBookDataStore.getState().preSyncedConfigs[hash]).toBeUndefined();
    expect(tombstone.deletedAt).toBe(2);
  });

  it.each([
    ['unloaded availability', { libraryLoaded: false }],
    ['unsettled availability', { libraryReconciliationSettled: false }],
  ])('retains artifacts for %s', async (_label, overrides) => {
    const hash = testLocalBookHash(`cleanup-${_label}`);
    const { appService } = createAppService({
      [directoryKey(hash, 'Books')]: [{ path: 'book.epub', size: 100 }],
    });

    const summary = await runCleanup(appService, [book(hash)], overrides);

    expect(summary.retained).toBe(1);
    expect(appService.deleteDir).not.toHaveBeenCalled();
  });

  it('retains artifacts when an active duplicate makes availability present', async () => {
    const hash = testLocalBookHash('cleanup-present');
    const tombstone = book(hash);
    const active = book(hash, { deletedAt: null, updatedAt: 3 });
    const { appService } = createAppService({
      [directoryKey(hash, 'Books')]: [{ path: 'book.epub', size: 100 }],
    });

    const summary = await runCleanup(appService, [tombstone, active]);

    expect(summary.retained).toBe(1);
    expect(appService.deleteDir).not.toHaveBeenCalled();
  });

  it.each(['upload', 'download'] as const)(
    'retains artifacts while a %s is pending',
    async (type) => {
      const hash = testLocalBookHash(`cleanup-${type}`);
      const { appService } = createAppService({
        [directoryKey(hash, 'Books')]: [{ path: 'book.epub', size: 100 }],
      });

      const summary = await runCleanup(appService, [book(hash)], {
        transfers: [transfer(hash, type)],
      });

      expect(summary.retained).toBe(1);
      expect(appService.deleteDir).not.toHaveBeenCalled();
    },
  );

  it('retains artifacts while the exact book is open in the reader', async () => {
    const hash = testLocalBookHash('cleanup-reader-open');
    const { appService } = createAppService({
      [directoryKey(hash, 'Books')]: [{ path: 'book.epub', size: 100 }],
    });

    const summary = await runCleanup(appService, [book(hash)], {
      openReaderBookKeys: [`${hash}::reader-session`],
    });

    expect(summary.retained).toBe(1);
    expect(appService.deleteDir).not.toHaveBeenCalled();
  });

  it('retains artifacts when the initiating account no longer owns the library', async () => {
    const hash = testLocalBookHash('cleanup-owner-changed');
    const { appService } = createAppService({
      [directoryKey(hash, 'Books')]: [{ path: 'book.epub', size: 100 }],
    });

    const summary = await runCleanup(appService, [book(hash)], {
      isOwnerCurrent: () => false,
    });

    expect(summary.retained).toBe(1);
    expect(appService.deleteDir).not.toHaveBeenCalled();
  });

  it.each(['reader', 'transfer', 'availability'] as const)(
    'rechecks live %s state after filesystem inspection before deletion',
    async (gate) => {
      const hash = testLocalBookHash(`cleanup-live-${gate}`);
      const tombstone = book(hash);
      const { appService, directories } = createAppService({
        [directoryKey(hash, 'Books')]: [{ path: 'book.epub', size: 100 }],
      });
      const currentState = {
        library: [tombstone] as Book[],
        libraryLoaded: true,
        libraryReconciliationSettled: true,
        transfers: [] as TransferItem[],
        openReaderBookKeys: [] as string[],
      };
      vi.mocked(appService.readDirectory).mockImplementation(async (path, base) => {
        if (gate === 'reader') currentState.openReaderBookKeys = [`${hash}::reader-session`];
        if (gate === 'transfer') currentState.transfers = [transfer(hash, 'upload')];
        if (gate === 'availability') {
          currentState.library = [tombstone, book(hash, { deletedAt: null, updatedAt: 3 })];
        }
        return directories.get(directoryKey(path, base)) ?? [];
      });

      const summary = await runCleanup(appService, [tombstone], {
        getCurrentState: () => currentState,
      });

      expect(summary).toMatchObject({ evicted: 0, retained: 1, failed: 0 });
      expect(appService.deleteDir).not.toHaveBeenCalled();
      expect(directories.has(directoryKey(hash, 'Books'))).toBe(true);
    },
  );

  it('rechecks live gates before clearing localStorage and BookData', async () => {
    const hash = testLocalBookHash('cleanup-live-runtime-state');
    const tombstone = book(hash);
    const { appService, directories } = createAppService({
      [directoryKey(hash, 'Books')]: [{ path: 'book.epub', size: 100 }],
    });
    const currentState = {
      library: [tombstone] as Book[],
      libraryLoaded: true,
      libraryReconciliationSettled: true,
      transfers: [] as TransferItem[],
      openReaderBookKeys: [] as string[],
    };
    vi.mocked(appService.deleteDir).mockImplementation(async (path, base) => {
      directories.delete(directoryKey(path, base));
      currentState.openReaderBookKeys = [`${hash}::reader-session`];
    });
    const targetKey = `${LOCAL_PERSISTENCE_PREFIXES.readerSearchHistory}${hash}`;
    localStorage.setItem(targetKey, 'keep');
    seedBookData(hash);

    const summary = await runCleanup(appService, [tombstone], {
      getCurrentState: () => currentState,
    });

    expect(summary).toMatchObject({ evicted: 0, retained: 1, failed: 0, bytesReclaimed: 100 });
    expect(localStorage.getItem(targetKey)).toBe('keep');
    expect(useBookDataStore.getState().booksData[hash]).toBeDefined();
  });

  it('serializes eviction with account transition so the next owner artifacts are retained', async () => {
    const hash = testLocalBookHash('cleanup-owner-transition');
    const { appService, directories } = createAppService({
      [directoryKey(hash, 'Books')]: [{ path: 'owner-a.epub', size: 100 }],
    });
    let currentOwner = ownerUserId;
    let signalDeleteStarted!: () => void;
    const deleteStarted = new Promise<void>((resolve) => {
      signalDeleteStarted = resolve;
    });
    let finishDelete!: () => void;
    const deleteCanFinish = new Promise<void>((resolve) => {
      finishDelete = resolve;
    });
    vi.mocked(appService.deleteDir).mockImplementation(async (path, base) => {
      signalDeleteStarted();
      await deleteCanFinish;
      directories.delete(directoryKey(path, base));
    });

    const cleanup = runCleanup(appService, [book(hash)], {
      isOwnerCurrent: () => currentOwner === ownerUserId,
    });
    await deleteStarted;

    const transition = runAccountLibraryMutation(async () => {
      currentOwner = 'user-b';
      directories.set(directoryKey(hash, 'Books'), [{ path: 'owner-b.epub', size: 200 }]);
    });
    await Promise.resolve();
    expect(currentOwner).toBe(ownerUserId);

    finishDelete();
    await cleanup;
    await transition;

    expect(currentOwner).toBe('user-b');
    expect(directories.get(directoryKey(hash, 'Books'))).toEqual([
      { path: 'owner-b.epub', size: 200 },
    ]);
  });

  it('retains bytes for another owner or a legacy ownerless transfer', async () => {
    const hash = testLocalBookHash('cleanup-cross-owner-transfer');
    const { appService } = createAppService({
      [directoryKey(hash, 'Books')]: [{ path: 'book.epub', size: 100 }],
    });

    for (const blockingTransfer of [
      transfer(hash, 'upload', { ownerUserId: 'user-b' }),
      transfer(hash, 'upload', { ownerUserId: undefined, status: 'failed' }),
    ]) {
      const summary = await runCleanup(appService, [book(hash)], {
        transfers: [blockingTransfer],
      });
      expect(summary.retained).toBe(1);
    }
    expect(appService.deleteDir).not.toHaveBeenCalled();
  });

  it('preserves reclaimed-byte evidence when a later directory inspection fails', async () => {
    const hash = testLocalBookHash('cleanup-partial-bytes');
    const { appService, directories } = createAppService({
      [directoryKey(hash, 'Books')]: [{ path: 'book.epub', size: 100 }],
      [directoryKey(`search/${hash}`, 'Cache')]: [{ path: 'query.json', size: 20 }],
    });
    vi.mocked(appService.readDirectory).mockImplementation(async (path, base) => {
      if (path === `search/${hash}` && base === 'Cache') throw new Error('cache unavailable');
      return directories.get(directoryKey(path, base)) ?? [];
    });

    const summary = await runCleanup(appService, [book(hash)]);

    expect(summary).toMatchObject({ evicted: 0, retained: 0, failed: 1, bytesReclaimed: 100 });
    expect(directories.has(directoryKey(hash, 'Books'))).toBe(false);
    expect(directories.has(directoryKey(`search/${hash}`, 'Cache'))).toBe(true);
  });

  it('continues after a per-hash filesystem failure and clears runtime data only on success', async () => {
    const failingHash = testLocalBookHash('cleanup-failing-hash');
    const successHash = testLocalBookHash('cleanup-following-hash');
    const { appService, directories } = createAppService({
      [directoryKey(failingHash, 'Books')]: [{ path: 'book.epub', size: 100 }],
      [directoryKey(successHash, 'Books')]: [{ path: 'book.epub', size: 200 }],
    });
    vi.mocked(appService.readDirectory).mockImplementation(async (path, base) => {
      if (path === failingHash && base === 'Books') throw new Error('filesystem unavailable');
      return directories.get(directoryKey(path, base)) ?? [];
    });
    seedBookData(failingHash, successHash);
    const library = [book(failingHash), book(successHash)];

    const summary = await runCleanup(appService, library);

    expect(summary).toMatchObject({ candidates: 2, evicted: 1, failed: 1, bytesReclaimed: 200 });
    expect(useBookDataStore.getState().booksData[failingHash]).toBeDefined();
    expect(useBookDataStore.getState().booksData[successHash]).toBeUndefined();
    expect(library.every((entry) => entry.deletedAt === 2)).toBe(true);
  });

  it('allows a cleaned hash directory to be recreated for a working re-import', async () => {
    const hash = testLocalBookHash('cleanup-reimport');
    const { appService, directories } = createAppService({
      [directoryKey(hash, 'Books')]: [{ path: 'old.epub', size: 100 }],
    });

    await runCleanup(appService, [book(hash)]);
    directories.set(directoryKey(hash, 'Books'), [{ path: 'reimported.epub', size: 150 }]);

    await expect(appService.exists(hash, 'Books')).resolves.toBe(true);
    await expect(appService.readDirectory(hash, 'Books')).resolves.toEqual([
      { path: 'reimported.epub', size: 150 },
    ]);
  });
});
