import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Book, BookConfig } from '@/types/book';
import type { StoredSyncMutation } from '@/services/sync/outbox';
import { SyncMutationDeliveryError } from '@/services/sync/engine';

type TestFileRecord = {
  id?: string;
  file_key: string;
  file_size: number;
  file_type: string;
  book_hash: string | null;
  created_at: string;
  updated_at: string | null;
};

const mocks = vi.hoisted(() => {
  const libraryBook = {
    hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    title: 'Local Book',
    author: 'Author',
    format: 'epub',
    createdAt: 1,
    updatedAt: 1,
    coverImageUrl: null,
  } as Book;

  const libraryState = {
    library: [libraryBook] as Book[],
    libraryLoaded: true,
    getVisibleLibrary: vi.fn(() => libraryState.library.filter((book) => !book.deletedAt)),
    updateBooks: vi.fn(),
    setLibrary: vi.fn((books: Book[]) => {
      libraryState.library = books;
    }),
    subscribe: vi.fn(),
  };

  const bookDataState = {
    configs: new Map<string, BookConfig>(),
    preSyncedConfigs: {} as Record<string, Partial<BookConfig>>,
    getConfig: vi.fn((key: string | null) =>
      key ? (bookDataState.configs.get(key) ?? null) : null,
    ),
    setConfig: vi.fn((key: string, partialConfig: Partial<BookConfig>) => {
      const existing = bookDataState.configs.get(key) ?? ({ updatedAt: 0 } as BookConfig);
      bookDataState.configs.set(key, { ...existing, ...partialConfig } as BookConfig);
    }),
    setPreSyncedConfig: vi.fn((bookHash: string, config: Partial<BookConfig>) => {
      bookDataState.preSyncedConfigs[bookHash] = config;
    }),
  };

  const settingsState = {
    settings: {} as Record<string, unknown>,
    setSettings: vi.fn((settings: Record<string, unknown>) => {
      settingsState.settings = settings;
    }),
  };

  const platformSidebarState = {
    collections: [] as Array<{
      id: string;
      name: string;
      bookHashes: string[];
      createdAt: string;
      updatedAt?: number;
      deletedAt?: number | null;
    }>,
    setState: vi.fn((patch: { collections?: typeof platformSidebarState.collections }) => {
      if (patch.collections) platformSidebarState.collections = patch.collections;
    }),
  };

  const appService = {
    exists: vi.fn(async () => true),
    downloadBookCovers: vi.fn(async () => undefined),
    generateCoverImageUrl: vi.fn(async () => null as string | null),
    saveLibraryBooks: vi.fn(),
    loadBookConfig: vi.fn(async () => ({ updatedAt: 0 }) as BookConfig),
    saveBookConfig: vi.fn(async () => undefined),
    saveSettings: vi.fn(),
  };

  const aiState = {
    currentBookHash: libraryBook.hash,
    conversations: [] as Array<{ id: string; updatedAt: number }>,
    activeConversationId: null as string | null,
    messages: [] as Array<{ id: string; conversationId: string }>,
  };

  const aiStore = {
    getAllConversations: vi.fn(async () => []),
    upsertConversations: vi.fn(async () => undefined),
    getMessages: vi.fn(async () => []),
    upsertMessages: vi.fn(async () => undefined),
    getConversations: vi.fn(async () => []),
  };

  return {
    libraryBook,
    libraryState,
    bookDataState,
    settingsState,
    platformSidebarState,
    appService,
    aiState,
    aiStore,
    pushChanges: vi.fn(),
    pullChanges: vi.fn(),
    listFiles: vi.fn(async () => ({
      files: [] as TestFileRecord[],
      total: 0,
      page: 1,
      pageSize: 0,
      totalPages: 1,
    })),
    getAppService: vi.fn(async () => appService),
  };
});

vi.mock('@/services/sync/client', () => ({
  pullCanonicalSyncChanges: mocks.pullChanges,
  reconcileCanonicalBooks: mocks.pushChanges,
}));

vi.mock('@/libs/storage', () => ({
  listFiles: mocks.listFiles,
}));

vi.mock('@/utils/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  },
  createSupabaseClient: vi.fn(),
}));

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: Object.assign(
    (selector?: (state: typeof mocks.libraryState) => unknown) =>
      selector ? selector(mocks.libraryState) : mocks.libraryState,
    { getState: () => mocks.libraryState, subscribe: mocks.libraryState.subscribe },
  ),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: { getState: vi.fn(() => mocks.bookDataState) },
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: {
    getState: vi.fn(() => mocks.settingsState),
  },
}));

vi.mock('@/services/environment', () => ({
  default: {
    getAppService: mocks.getAppService,
  },
}));

vi.mock('@/store/platformSidebarStore', () => ({
  usePlatformSidebarStore: Object.assign(() => mocks.platformSidebarState, {
    getState: () => mocks.platformSidebarState,
    setState: mocks.platformSidebarState.setState,
  }),
}));

vi.mock('@/services/ai/storage/aiStore', () => ({
  aiStore: mocks.aiStore,
}));

vi.mock('@/store/aiChatStore', () => ({
  useAIChatStore: {
    getState: vi.fn(() => mocks.aiState),
    setState: vi.fn((patch: Partial<typeof mocks.aiState>) => Object.assign(mocks.aiState, patch)),
  },
}));

vi.mock('@/utils/access', () => ({
  getAccessToken: vi.fn(async () => 'token'),
}));

vi.mock('@/utils/fetch', () => ({
  getPlatformFetch: vi.fn(() => fetch),
}));

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

const deletionRecord = (): StoredSyncMutation => ({
  id: 'mutation-delete-1',
  entity: 'book',
  entityId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  op: 'delete',
  baseRevision: null,
  userId: 'user-1',
  deviceId: 'device-1',
  clientUpdatedAt: 2,
  tombstone: { deletedAt: 2 },
  status: 'pending',
  retryCount: 0,
  createdAt: 2,
  updatedAt: 2,
  nextAttemptAt: 2,
  leaseOwner: null,
  leaseExpiresAt: null,
  lastError: null,
});

describe('SyncWorker book reconcile queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.libraryState.library = [mocks.libraryBook];
    mocks.libraryState.libraryLoaded = true;
    mocks.libraryState.getVisibleLibrary.mockImplementation(() =>
      mocks.libraryState.library.filter((book) => !book.deletedAt),
    );
    mocks.bookDataState.configs.clear();
    mocks.bookDataState.preSyncedConfigs = {};
    mocks.bookDataState.getConfig.mockClear();
    mocks.bookDataState.setConfig.mockClear();
    mocks.bookDataState.setPreSyncedConfig.mockClear();
    mocks.settingsState.settings = {};
    mocks.settingsState.setSettings.mockClear();
    mocks.platformSidebarState.collections = [];
    mocks.platformSidebarState.setState.mockClear();
    mocks.appService.exists.mockResolvedValue(true);
    mocks.appService.downloadBookCovers.mockClear();
    mocks.appService.generateCoverImageUrl.mockReset();
    mocks.appService.generateCoverImageUrl.mockResolvedValue(null);
    mocks.appService.saveLibraryBooks.mockClear();
    mocks.appService.loadBookConfig.mockReset();
    mocks.appService.loadBookConfig.mockResolvedValue({ updatedAt: 0 } as BookConfig);
    mocks.appService.saveBookConfig.mockClear();
    mocks.appService.saveSettings.mockClear();
    mocks.aiState.currentBookHash = mocks.libraryBook.hash;
    mocks.aiState.conversations = [];
    mocks.aiState.activeConversationId = null;
    mocks.aiState.messages = [];
    mocks.aiStore.getAllConversations.mockClear();
    mocks.aiStore.getAllConversations.mockResolvedValue([]);
    mocks.aiStore.upsertConversations.mockClear();
    mocks.aiStore.getMessages.mockClear();
    mocks.aiStore.getMessages.mockResolvedValue([]);
    mocks.aiStore.upsertMessages.mockClear();
    mocks.aiStore.getConversations.mockClear();
    mocks.aiStore.getConversations.mockResolvedValue([]);
    mocks.listFiles.mockReset();
    mocks.listFiles.mockResolvedValue({
      files: [] as TestFileRecord[],
      total: 0,
      page: 1,
      pageSize: 0,
      totalPages: 1,
    });
    mocks.pullChanges.mockResolvedValue({ books: [] });
  });

  it('keeps a busy delivery caller pending until its requested rerun completes', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    const successfulDrain = {
      attempted: 1,
      accepted: 1,
      conflicted: 0,
      failed: 0,
      remaining: 0,
    };
    const record = deletionRecord();
    const delivery = {
      status: 'accepted' as const,
      mutationIds: [record.id],
      acceptedMutationIds: [record.id],
      pendingMutationIds: [],
      failedMutationIds: [],
    };
    let resolveFirstDrain!: (result: typeof successfulDrain) => void;
    let resolveQueuedDrain!: (result: typeof successfulDrain) => void;
    const firstDrain = new Promise<typeof successfulDrain>((resolve) => {
      resolveFirstDrain = resolve;
    });
    const queuedDrain = new Promise<typeof successfulDrain>((resolve) => {
      resolveQueuedDrain = resolve;
    });
    const drainOnce = vi.fn().mockReturnValueOnce(firstDrain).mockReturnValueOnce(queuedDrain);
    const resolveDelivery = vi.fn(async () => delivery);
    const engine = { drainOnce, pendingCount: vi.fn(async () => 0), resolveDelivery };
    const testWorker = worker as unknown as {
      stopped: boolean;
      userId: string;
      canonicalEngine: typeof engine;
    };
    testWorker.stopped = false;
    testWorker.userId = 'user-1';
    testWorker.canonicalEngine = engine;

    const activeCall = worker.syncNow();
    await vi.waitFor(() => expect(drainOnce).toHaveBeenCalledTimes(1));

    let busyCallSettled = false;
    const busyCall = worker.syncNow([record], record.userId).then((result) => {
      busyCallSettled = true;
      return result;
    });
    await flushMicrotasks();
    expect(busyCallSettled).toBe(false);
    expect(resolveDelivery).not.toHaveBeenCalled();

    resolveFirstDrain(successfulDrain);
    await vi.waitFor(() => expect(drainOnce).toHaveBeenCalledTimes(2));
    expect(busyCallSettled).toBe(false);
    expect(resolveDelivery).not.toHaveBeenCalled();

    resolveQueuedDrain(successfulDrain);
    await expect(busyCall).resolves.toEqual(delivery);
    await expect(activeCall).resolves.toBeUndefined();
    expect(resolveDelivery).toHaveBeenCalledWith([record], record.userId);
  });

  it('returns a truthful durable failed delivery result for the same user', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    const record = deletionRecord();
    const failedDelivery = {
      status: 'failed' as const,
      mutationIds: [record.id],
      acceptedMutationIds: [],
      pendingMutationIds: [],
      failedMutationIds: [record.id],
    };
    const drainOnce = vi.fn(async () => ({
      attempted: 1,
      accepted: 0,
      conflicted: 1,
      failed: 0,
      remaining: 0,
    }));
    const resolveDelivery = vi.fn(async () => failedDelivery);
    const engine = { drainOnce, pendingCount: vi.fn(async () => 0), resolveDelivery };
    const testWorker = worker as unknown as {
      stopped: boolean;
      userId: string;
      canonicalEngine: typeof engine;
    };
    testWorker.stopped = false;
    testWorker.userId = 'user-1';
    testWorker.canonicalEngine = engine;

    await expect(worker.syncNow([record], record.userId)).resolves.toEqual(failedDelivery);
    expect(resolveDelivery).toHaveBeenCalledWith([record], record.userId);
  });

  it('fails closed when the active user changes before delivery resolution', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    const record = deletionRecord();
    const drainResult = {
      attempted: 0,
      accepted: 0,
      conflicted: 0,
      failed: 0,
      remaining: 1,
    };
    let resolveDrain!: (result: typeof drainResult) => void;
    const drainOnce = vi.fn(
      () =>
        new Promise<typeof drainResult>((resolve) => {
          resolveDrain = resolve;
        }),
    );
    const resolveDelivery = vi.fn();
    const engine = { drainOnce, pendingCount: vi.fn(async () => 1), resolveDelivery };
    const testWorker = worker as unknown as {
      stopped: boolean;
      userId: string;
      canonicalEngine: typeof engine | null;
    };
    testWorker.stopped = false;
    testWorker.userId = 'user-1';
    testWorker.canonicalEngine = engine;

    const result = worker.syncNow([record], record.userId);
    await vi.waitFor(() => expect(drainOnce).toHaveBeenCalledTimes(1));
    testWorker.userId = 'user-2';
    testWorker.canonicalEngine = null;
    resolveDrain(drainResult);

    await expect(result).rejects.toBeInstanceOf(SyncMutationDeliveryError);
    expect(resolveDelivery).not.toHaveBeenCalled();
  });

  it('fails closed when the user changes during durable delivery resolution', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    const record = deletionRecord();
    const delivery = {
      status: 'pending' as const,
      mutationIds: [record.id],
      acceptedMutationIds: [],
      pendingMutationIds: [record.id],
      failedMutationIds: [],
    };
    let resolveDelivery!: (result: typeof delivery) => void;
    const deliveryPromise = new Promise<typeof delivery>((resolve) => {
      resolveDelivery = resolve;
    });
    const engine = {
      drainOnce: vi.fn(async () => ({
        attempted: 0,
        accepted: 0,
        conflicted: 0,
        failed: 0,
        remaining: 1,
      })),
      pendingCount: vi.fn(async () => 1),
      resolveDelivery: vi.fn(() => deliveryPromise),
    };
    const testWorker = worker as unknown as {
      stopped: boolean;
      userId: string;
      canonicalEngine: typeof engine | null;
    };
    testWorker.stopped = false;
    testWorker.userId = 'user-1';
    testWorker.canonicalEngine = engine;

    const result = worker.syncNow([record], record.userId);
    await vi.waitFor(() => expect(engine.resolveDelivery).toHaveBeenCalledTimes(1));
    testWorker.userId = 'user-2';
    testWorker.canonicalEngine = null;
    resolveDelivery(delivery);

    await expect(result).rejects.toBeInstanceOf(SyncMutationDeliveryError);
  });

  it('fails closed without draining when delivery is requested after stop', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    const record = deletionRecord();
    const drainOnce = vi.fn();
    const engine = {
      drainOnce,
      pendingCount: vi.fn(async () => 1),
      resolveDelivery: vi.fn(),
    };
    const testWorker = worker as unknown as {
      stopped: boolean;
      userId: string;
      canonicalEngine: typeof engine;
    };
    testWorker.stopped = true;
    testWorker.userId = 'user-1';
    testWorker.canonicalEngine = engine;

    await expect(worker.syncNow([record], record.userId)).rejects.toBeInstanceOf(
      SyncMutationDeliveryError,
    );
    expect(drainOnce).not.toHaveBeenCalled();
    expect(engine.resolveDelivery).not.toHaveBeenCalled();
  });

  it('recovers terminal failed outbox records before lifecycle drain', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    const callOrder: string[] = [];
    const recoverFailed = vi.fn(async () => {
      callOrder.push('recover');
      return [{ id: 'note-mutation-1' }];
    });
    const drainOnce = vi.fn(async () => {
      callOrder.push('drain');
      return { attempted: 1, accepted: 1, conflicted: 0, failed: 0, remaining: 0 };
    });
    const testWorker = worker as unknown as {
      stopped: boolean;
      userId: string;
      canonicalEngine: {
        recoverFailed: typeof recoverFailed;
        drainOnce: typeof drainOnce;
        pendingCount: () => Promise<number>;
      };
      drainQueueWithTerminalFailureRecovery: () => Promise<void>;
    };
    testWorker.stopped = false;
    testWorker.userId = 'user-1';
    testWorker.canonicalEngine = { recoverFailed, drainOnce, pendingCount: vi.fn(async () => 0) };

    await testWorker.drainQueueWithTerminalFailureRecovery();

    expect(recoverFailed).toHaveBeenCalledTimes(1);
    expect(drainOnce).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['recover', 'drain']);
    expect(worker.status.lastDrainResult).toEqual({ synced: 1, failed: 0, remaining: 0 });
  });

  it('does not repeatedly recover the same failed outbox records in one session', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    const recoverFailed = vi.fn(async () => [{ id: 'note-mutation-1' }]);
    const drainOnce = vi.fn(async () => ({
      attempted: 1,
      accepted: 0,
      conflicted: 0,
      failed: 1,
      remaining: 0,
    }));
    const testWorker = worker as unknown as {
      stopped: boolean;
      userId: string;
      canonicalEngine: {
        recoverFailed: typeof recoverFailed;
        drainOnce: typeof drainOnce;
        pendingCount: () => Promise<number>;
      };
      drainQueueWithTerminalFailureRecovery: () => Promise<void>;
    };
    testWorker.stopped = false;
    testWorker.userId = 'user-1';
    testWorker.canonicalEngine = { recoverFailed, drainOnce, pendingCount: vi.fn(async () => 0) };

    await testWorker.drainQueueWithTerminalFailureRecovery();
    await testWorker.drainQueueWithTerminalFailureRecovery();

    expect(recoverFailed).toHaveBeenCalledTimes(1);
    expect(drainOnce).toHaveBeenCalledTimes(2);
  });

  it('recovers a cover from canonical files metadata when book uploadedAt is missing', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    mocks.appService.exists.mockResolvedValue(false);
    mocks.appService.generateCoverImageUrl.mockResolvedValue('blob:cover');
    mocks.listFiles.mockResolvedValueOnce({
      files: [
        {
          id: 'cover-file-1',
          file_key: `user-1/Openread/Books/${mocks.libraryBook.hash}/cover.png`,
          file_size: 1234,
          file_type: 'cover',
          book_hash: mocks.libraryBook.hash,
          created_at: '2026-06-16T00:00:00.000Z',
          updated_at: '2026-06-16T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 1,
      totalPages: 1,
    });
    mocks.pushChanges.mockResolvedValueOnce({ reconcile: { upsert: [], remove: [] } });

    await worker.pullNow('books');

    expect(mocks.listFiles).toHaveBeenCalled();
    expect(mocks.appService.downloadBookCovers).toHaveBeenCalledWith([mocks.libraryBook]);
    expect(mocks.appService.generateCoverImageUrl).toHaveBeenCalledWith(mocks.libraryBook);
    expect(mocks.libraryState.library[0]).toMatchObject({ coverImageUrl: 'blob:cover' });
    expect(mocks.appService.saveLibraryBooks).toHaveBeenCalledWith(mocks.libraryState.library);
  });

  it('keeps pullNow(books) pending until an active and queued reconcile settle', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    mocks.pushChanges
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );

    const firstPull = worker.pullNow('books');
    await vi.waitFor(() => expect(mocks.pushChanges).toHaveBeenCalledTimes(1));

    const secondPull = worker.pullNow('books');
    let secondSettled = false;
    secondPull.then(() => {
      secondSettled = true;
    });

    resolveFirst({ reconcile: {} });
    await flushMicrotasks();

    expect(secondSettled).toBe(false);
    await vi.waitFor(() => expect(mocks.pushChanges).toHaveBeenCalledTimes(2));

    resolveSecond({ reconcile: {} });
    await expect(secondPull).resolves.toBeUndefined();
    await expect(firstPull).resolves.toBeUndefined();
    expect(secondSettled).toBe(true);
  });

  it('skips malformed remote book config rows while applying valid first-open configs', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.pullChanges.mockResolvedValueOnce({
      configs: [
        {
          book_hash: 'not-a-syncable-hash',
          updated_at: '2026-06-25T00:00:00.000Z',
        },
        {
          book_hash: mocks.libraryBook.hash,
          progress: [4, 10],
          location: 'epubcfi(/6/18)',
          updated_at: '2026-06-25T00:00:10.000Z',
        },
      ],
      cursorByEntity: { bookConfig: 'remote-cursor-1' },
    });

    const configs = await worker.pullBookConfigs();

    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({
      bookHash: mocks.libraryBook.hash,
      progress: [4, 10],
      location: 'epubcfi(/6/18)',
    });
    expect(mocks.bookDataState.configs.get(mocks.libraryBook.hash)).toMatchObject({
      progress: [4, 10],
      location: 'epubcfi(/6/18)',
    });
    expect(mocks.bookDataState.preSyncedConfigs[mocks.libraryBook.hash]).toMatchObject({
      progress: [4, 10],
      location: 'epubcfi(/6/18)',
    });
    expect(consoleError).toHaveBeenCalledWith(
      '[SyncWorker] Skipping malformed remote book config row:',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it('advances the config watermark for malformed-only remote rows after logging skip', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const { getCanonicalSyncCursor } = await import('@/services/sync/cursors');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    const skippedAt = '2026-06-25T00:00:20.000Z';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.pullChanges.mockResolvedValueOnce({
      configs: [{ book_hash: 'not-a-syncable-hash', updated_at: skippedAt }],
      cursorByEntity: {},
    });

    const configs = await worker.pullBookConfigs();

    expect(configs).toEqual([]);
    expect(getCanonicalSyncCursor('user-1', 'bookConfig')).toBe(new Date(skippedAt).getTime());
    expect(consoleError).toHaveBeenCalledWith(
      '[SyncWorker] Skipping malformed remote book config row:',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it('advances the notes watermark for malformed-only remote rows after logging skip', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const { getCanonicalSyncCursor } = await import('@/services/sync/cursors');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    const skippedAt = '2026-06-25T00:00:30.000Z';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.pullChanges.mockResolvedValueOnce({
      notes: [{ book_hash: 'not-a-syncable-hash', id: 'bad-note', updated_at: skippedAt }],
      cursorByEntity: {},
    });

    const notes = await worker.pullBookNotes();

    expect(notes).toEqual([]);
    expect(getCanonicalSyncCursor('user-1', 'bookNote')).toBe(new Date(skippedAt).getTime());
    expect(consoleError).toHaveBeenCalledWith(
      '[SyncWorker] Skipping malformed remote book note row:',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it('does not advance the config cursor when a remote config row fails local persistence', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const { getCanonicalSyncCursor } = await import('@/services/sync/cursors');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    mocks.appService.saveBookConfig.mockRejectedValueOnce(new Error('disk full'));
    mocks.pullChanges.mockResolvedValueOnce({
      configs: [
        {
          book_hash: mocks.libraryBook.hash,
          progress: [4, 10],
          location: 'epubcfi(/6/18)',
          updated_at: '2026-06-25T00:00:40.000Z',
        },
      ],
      cursorByEntity: { bookConfig: '9999999999999' },
    });

    const configs = await worker.pullBookConfigs();

    expect(configs).toEqual([]);
    expect(getCanonicalSyncCursor('user-1', 'bookConfig')).toBe(0);
    expect(mocks.bookDataState.configs.get(mocks.libraryBook.hash)).toBeUndefined();
  });

  it('does not advance the note cursor when a remote note row fails local persistence', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const { getCanonicalSyncCursor } = await import('@/services/sync/cursors');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    mocks.appService.saveBookConfig.mockRejectedValueOnce(new Error('disk full'));
    mocks.pullChanges.mockResolvedValueOnce({
      notes: [
        {
          book_hash: mocks.libraryBook.hash,
          id: 'note-remote-1',
          type: 'annotation',
          cfi: 'epubcfi(/6/4)',
          note: 'remote note',
          created_at: '2026-06-25T00:00:45.000Z',
          updated_at: '2026-06-25T00:00:45.000Z',
        },
      ],
      cursorByEntity: { bookNote: '9999999999999' },
    });

    const notes = await worker.pullBookNotes();

    expect(notes).toEqual([]);
    expect(getCanonicalSyncCursor('user-1', 'bookNote')).toBe(0);
    expect(mocks.bookDataState.configs.get(mocks.libraryBook.hash)).toBeUndefined();
  });

  it('applies canonical bookConfig tombstones and advances the config watermark', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    const bookKey = mocks.libraryBook.hash;
    mocks.settingsState.settings = {};
    mocks.bookDataState.configs.set(bookKey, {
      bookHash: mocks.libraryBook.hash,
      location: 'epubcfi(/6/2)',
      progress: [1, 10],
      searchConfig: { q: 'old' },
      viewSettings: { fontSize: 16 },
      updatedAt: 1000,
    } as BookConfig);
    mocks.pullChanges.mockResolvedValueOnce({
      configs: [],
      tombstones: [
        {
          entity: 'bookConfig',
          entityId: mocks.libraryBook.hash,
          serverRevision: 'delete-rev-1',
          serverUpdatedAt: 3000,
          deletedAt: 3000,
        },
      ],
    });

    await worker.pullNow('configs');

    expect(mocks.bookDataState.configs.get(bookKey)).toMatchObject({
      bookHash: mocks.libraryBook.hash,
      location: undefined,
      progress: undefined,
      searchConfig: undefined,
      viewSettings: undefined,
      updatedAt: 3000,
    });
    expect(mocks.bookDataState.preSyncedConfigs[mocks.libraryBook.hash]).toMatchObject({
      bookHash: mocks.libraryBook.hash,
      updatedAt: 3000,
    });
    expect(mocks.settingsState.setSettings).not.toHaveBeenCalled();
    expect(mocks.appService.saveSettings).not.toHaveBeenCalled();
  });

  it('applies canonical bookNote tombstones and advances the notes watermark', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    const bookKey = mocks.libraryBook.hash;
    mocks.settingsState.settings = {};
    mocks.bookDataState.configs.set(bookKey, {
      bookHash: mocks.libraryBook.hash,
      updatedAt: 1000,
      booknotes: [
        {
          bookHash: mocks.libraryBook.hash,
          id: 'note-1',
          type: 'annotation',
          cfi: 'epubcfi(/6/4)',
          note: 'stale note',
          createdAt: 500,
          updatedAt: 1000,
        },
      ],
    } as BookConfig);
    mocks.pullChanges.mockResolvedValueOnce({
      notes: [],
      tombstones: [
        {
          entity: 'bookNote',
          entityId: `${mocks.libraryBook.hash}:note-1`,
          serverRevision: 'delete-rev-2',
          serverUpdatedAt: 4000,
          deletedAt: 4000,
        },
      ],
    });

    await worker.pullNow('notes');

    expect(mocks.bookDataState.configs.get(bookKey)?.booknotes?.[0]).toMatchObject({
      id: 'note-1',
      updatedAt: 4000,
      deletedAt: 4000,
    });
    expect(mocks.settingsState.setSettings).not.toHaveBeenCalled();
    expect(mocks.appService.saveSettings).not.toHaveBeenCalled();
  });

  it('does not advance the config cursor when a config tombstone fails local persistence', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const { getCanonicalSyncCursor } = await import('@/services/sync/cursors');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    const bookKey = mocks.libraryBook.hash;
    mocks.bookDataState.configs.set(bookKey, {
      bookHash: mocks.libraryBook.hash,
      location: 'epubcfi(/6/2)',
      progress: [1, 10],
      updatedAt: 1000,
    } as BookConfig);
    mocks.appService.saveBookConfig.mockRejectedValueOnce(new Error('disk full'));
    mocks.pullChanges.mockResolvedValueOnce({
      configs: [],
      tombstones: [
        {
          entity: 'bookConfig',
          entityId: mocks.libraryBook.hash,
          serverRevision: 'delete-rev-fail',
          serverUpdatedAt: 5000,
          deletedAt: 5000,
        },
      ],
      cursorByEntity: { bookConfig: '9999999999999' },
    });

    await worker.pullNow('configs');

    expect(getCanonicalSyncCursor('user-1', 'bookConfig')).toBe(0);
    expect(mocks.bookDataState.configs.get(bookKey)).toMatchObject({
      location: 'epubcfi(/6/2)',
      progress: [1, 10],
      updatedAt: 1000,
    });
  });

  it('does not advance the note cursor when a note tombstone fails local persistence', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const { getCanonicalSyncCursor } = await import('@/services/sync/cursors');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    const bookKey = mocks.libraryBook.hash;
    mocks.bookDataState.configs.set(bookKey, {
      bookHash: mocks.libraryBook.hash,
      updatedAt: 1000,
      booknotes: [
        {
          bookHash: mocks.libraryBook.hash,
          id: 'note-1',
          type: 'annotation',
          cfi: 'epubcfi(/6/4)',
          note: 'local note',
          createdAt: 500,
          updatedAt: 1000,
        },
      ],
    } as BookConfig);
    mocks.appService.saveBookConfig.mockRejectedValueOnce(new Error('disk full'));
    mocks.pullChanges.mockResolvedValueOnce({
      notes: [],
      tombstones: [
        {
          entity: 'bookNote',
          entityId: `${mocks.libraryBook.hash}:note-1`,
          serverRevision: 'delete-rev-fail',
          serverUpdatedAt: 6000,
          deletedAt: 6000,
        },
      ],
      cursorByEntity: { bookNote: '9999999999999' },
    });

    await worker.pullNow('notes');

    expect(getCanonicalSyncCursor('user-1', 'bookNote')).toBe(0);
    expect(mocks.bookDataState.configs.get(bookKey)?.booknotes?.[0]).toMatchObject({
      id: 'note-1',
      note: 'local note',
      updatedAt: 1000,
    });
    expect(mocks.bookDataState.configs.get(bookKey)?.booknotes?.[0]?.deletedAt).toBeUndefined();
  });

  it('uses book-scoped persisted AI cursors without Date.now fallback', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(999999);
    mocks.pullChanges
      .mockResolvedValueOnce({
        aiConversations: [
          {
            id: 'conversation-1',
            bookHash: mocks.libraryBook.hash,
            title: 'Remote thread',
            createdAt: 1000,
            updatedAt: 2000,
          },
        ],
        aiMessages: [
          {
            id: 'message-1',
            conversationId: 'conversation-1',
            role: 'assistant',
            content: 'hello',
            createdAt: 2100,
          },
        ],
        cursorByEntity: {},
      })
      .mockResolvedValueOnce({
        aiConversations: [],
        aiMessages: [],
        cursorByEntity: {},
      });

    await worker.pullRemoteAIConversations();
    await worker.pullRemoteAIConversations();

    expect(mocks.pullChanges).toHaveBeenNthCalledWith(
      1,
      1,
      'ai',
      mocks.libraryBook.hash,
      undefined,
      [],
    );
    expect(mocks.pullChanges).toHaveBeenNthCalledWith(
      2,
      2001,
      'ai',
      mocks.libraryBook.hash,
      undefined,
      [],
    );
    expect(mocks.aiStore.upsertConversations).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'conversation-1' }),
    ]);
    expect(mocks.aiStore.upsertMessages).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'message-1' }),
    ]);
    expect(nowSpy).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });

  it('applies canonical collection tombstones and advances the settings watermark', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    mocks.settingsState.settings = {};
    mocks.platformSidebarState.collections = [
      {
        id: 'collection-1',
        name: 'Favorites',
        bookHashes: [mocks.libraryBook.hash],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: 1000,
      },
    ];
    mocks.pullChanges.mockResolvedValueOnce({
      settings: null,
      collections: [],
      settingsUpdatedAt: 5000,
      tombstones: [
        {
          entity: 'collection',
          entityId: 'collection-1',
          serverRevision: 'delete-rev-3',
          serverUpdatedAt: 5000,
          deletedAt: 5000,
        },
      ],
    });

    await worker.pullNow('settings');

    expect(mocks.platformSidebarState.collections).toEqual([]);
    expect(mocks.settingsState.setSettings).toHaveBeenCalledWith(expect.any(Object));
    expect(mocks.appService.saveSettings).toHaveBeenCalledWith(expect.any(Object));
  });
});
