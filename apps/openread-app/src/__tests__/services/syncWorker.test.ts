import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Book, BookConfig } from '@/types/book';
import type { BaseDir } from '@/types/system';
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
    libraryOwnerUserId: 'user-1' as string | null,
    getVisibleLibrary: vi.fn(() => libraryState.library.filter((book) => !book.deletedAt)),
    updateBooks: vi.fn(),
    setLibrary: vi.fn((books: Book[]) => {
      libraryState.library = books;
    }),
    subscribe: vi.fn(),
  };

  const bookDataState = {
    configs: new Map<string, BookConfig>(),
    remoteConfigs: {} as Record<string, { ownerUserId: string; config: Partial<BookConfig> }>,
    getConfig: vi.fn((key: string | null) =>
      key ? (bookDataState.configs.get(key) ?? null) : null,
    ),
    setConfig: vi.fn((key: string, partialConfig: Partial<BookConfig>) => {
      const existing = bookDataState.configs.get(key) ?? ({ updatedAt: 0 } as BookConfig);
      bookDataState.configs.set(key, { ...existing, ...partialConfig } as BookConfig);
    }),
    setRemoteConfig: vi.fn((bookHash: string, ownerUserId: string, config: Partial<BookConfig>) => {
      bookDataState.remoteConfigs[bookHash] = { ownerUserId, config };
    }),
    getRemoteConfig: vi.fn((bookHash: string) => {
      const remote = bookDataState.remoteConfigs[bookHash];
      return remote?.ownerUserId === libraryState.libraryOwnerUserId ? remote.config : null;
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
    exists: vi.fn(async (_path: string, _base: BaseDir) => true),
    readFile: vi.fn(async () => JSON.stringify({ storagePath: 'catalog/observed.epub' })),
    writeFile: vi.fn(async () => undefined),
    downloadBook: vi.fn(async () => undefined),
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
    upsertConversations: vi.fn(async () => true),
    getMessages: vi.fn(async () => []),
    upsertMessages: vi.fn(async () => true),
    getConversations: vi.fn(async () => []),
  };
  const getBookChatGeneration = vi.fn(() => 0);
  const isBookChatGenerationCurrent = vi.fn(() => true);

  return {
    libraryBook,
    libraryState,
    bookDataState,
    settingsState,
    platformSidebarState,
    appService,
    aiState,
    aiStore,
    getBookChatGeneration,
    isBookChatGenerationCurrent,
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
    cleanupDeletedBookArtifacts: vi.fn(async (_input?: unknown) => ({
      candidates: 0,
      evicted: 0,
      retained: 0,
      failed: 0,
      bytesReclaimed: 0,
      localStorageKeysRemoved: 0,
      evictedBookHashes: [] as string[],
    })),
  };
});

vi.mock('@/services/sync/client', () => ({
  pullCanonicalSyncChanges: mocks.pullChanges,
  reconcileCanonicalBooks: mocks.pushChanges,
}));

vi.mock('@/libs/storage', () => ({
  listFiles: mocks.listFiles,
}));

vi.mock('@/services/deletedBookArtifactCleanup', () => ({
  cleanupDeletedBookArtifacts: mocks.cleanupDeletedBookArtifacts,
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
  getBookChatGeneration: mocks.getBookChatGeneration,
  isBookChatGenerationCurrent: mocks.isBookChatGenerationCurrent,
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

// Load the mocked worker graph during file collection, outside individual test budgets.
await import('@/services/sync/syncWorker');

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

const remoteCopyCases = Array.from({ length: 16 }, (_, mask) => ({
  label: mask.toString(2).padStart(4, '0'),
  catalogBookId: Boolean(mask & 1),
  storagePath: Boolean(mask & 2),
  catalogHash: Boolean(mask & 4),
  uploadedAt: Boolean(mask & 8),
}));

describe('SyncWorker book reconcile queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.libraryState.library = [mocks.libraryBook];
    mocks.libraryState.libraryLoaded = true;
    mocks.libraryState.libraryOwnerUserId = 'user-1';
    mocks.libraryState.getVisibleLibrary.mockImplementation(() =>
      mocks.libraryState.library.filter((book) => !book.deletedAt),
    );
    mocks.bookDataState.configs.clear();
    mocks.bookDataState.remoteConfigs = {};
    mocks.bookDataState.getConfig.mockClear();
    mocks.bookDataState.setConfig.mockClear();
    mocks.bookDataState.setRemoteConfig.mockClear();
    mocks.settingsState.settings = {};
    mocks.settingsState.setSettings.mockClear();
    mocks.platformSidebarState.collections = [];
    mocks.platformSidebarState.setState.mockClear();
    mocks.appService.exists.mockResolvedValue(true);
    mocks.appService.readFile.mockReset();
    mocks.appService.readFile.mockResolvedValue(
      JSON.stringify({ storagePath: 'catalog/observed.epub' }),
    );
    mocks.appService.writeFile.mockClear();
    mocks.appService.downloadBook.mockReset();
    mocks.appService.downloadBook.mockResolvedValue(undefined);
    mocks.appService.downloadBookCovers.mockClear();
    mocks.appService.generateCoverImageUrl.mockReset();
    mocks.appService.generateCoverImageUrl.mockResolvedValue(null);
    mocks.appService.saveLibraryBooks.mockReset();
    mocks.appService.saveLibraryBooks.mockResolvedValue(undefined);
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
    mocks.aiStore.upsertConversations.mockResolvedValue(true);
    mocks.aiStore.getMessages.mockClear();
    mocks.aiStore.getMessages.mockResolvedValue([]);
    mocks.aiStore.upsertMessages.mockClear();
    mocks.aiStore.upsertMessages.mockResolvedValue(true);
    mocks.aiStore.getConversations.mockClear();
    mocks.aiStore.getConversations.mockResolvedValue([]);
    mocks.getBookChatGeneration.mockReset();
    mocks.getBookChatGeneration.mockReturnValue(0);
    mocks.isBookChatGenerationCurrent.mockReset();
    mocks.isBookChatGenerationCurrent.mockReturnValue(true);
    mocks.listFiles.mockReset();
    mocks.listFiles.mockResolvedValue({
      files: [] as TestFileRecord[],
      total: 0,
      page: 1,
      pageSize: 0,
      totalPages: 1,
    });
    mocks.pullChanges.mockResolvedValue({ books: [] });
    mocks.pushChanges.mockReset();
    mocks.cleanupDeletedBookArtifacts.mockReset();
    mocks.cleanupDeletedBookArtifacts.mockResolvedValue({
      candidates: 0,
      evicted: 0,
      retained: 0,
      failed: 0,
      bytesReclaimed: 0,
      localStorageKeysRemoved: 0,
      evictedBookHashes: [],
    });
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

  it('prunes a server-absent tombstone only after local artifact eviction completes', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const tombstone = { ...mocks.libraryBook, deletedAt: 2 } as Book;
    mocks.libraryState.library = [tombstone];
    mocks.pushChanges.mockResolvedValueOnce({
      reconcile: { upsert: [], remove: [tombstone.hash] },
    });
    mocks.cleanupDeletedBookArtifacts.mockResolvedValueOnce({
      candidates: 1,
      evicted: 1,
      retained: 0,
      failed: 0,
      bytesReclaimed: 100,
      localStorageKeysRemoved: 1,
      evictedBookHashes: [tombstone.hash],
    });
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    await worker.pullNow('books');

    expect(mocks.cleanupDeletedBookArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({
        library: [tombstone],
        ownerUserId: 'user-1',
      }),
    );
    expect(mocks.libraryState.library).toEqual([]);
    expect(mocks.appService.saveLibraryBooks).toHaveBeenCalledWith([]);
  });

  it('converts a cross-device server removal to a durable tombstone before eviction and prune', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const activeBook = { ...mocks.libraryBook, deletedAt: null, uploadedAt: 1 } as Book;
    mocks.libraryState.library = [activeBook];
    mocks.pushChanges.mockResolvedValueOnce({
      reconcile: { upsert: [], remove: [activeBook.hash] },
    });
    mocks.cleanupDeletedBookArtifacts.mockResolvedValueOnce({
      candidates: 1,
      evicted: 1,
      retained: 0,
      failed: 0,
      bytesReclaimed: 100,
      localStorageKeysRemoved: 1,
      evictedBookHashes: [activeBook.hash],
    });
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    await worker.pullNow('books');

    const cleanupInput = mocks.cleanupDeletedBookArtifacts.mock.calls[0]?.[0] as {
      library: Book[];
      getCurrentState: () => { libraryReconciliationSettled: boolean };
    };
    expect(cleanupInput.library).toEqual([
      expect.objectContaining({
        hash: activeBook.hash,
        deletedAt: expect.any(Number),
        downloadedAt: null,
        coverDownloadedAt: null,
      }),
    ]);
    expect(cleanupInput.getCurrentState().libraryReconciliationSettled).toBe(true);
    expect(mocks.appService.saveLibraryBooks.mock.calls[0]?.[0]).toEqual(cleanupInput.library);
    expect(mocks.appService.saveLibraryBooks.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.cleanupDeletedBookArtifacts.mock.invocationCallOrder[0]!,
    );
    expect(mocks.cleanupDeletedBookArtifacts.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.appService.saveLibraryBooks.mock.invocationCallOrder[1]!,
    );
    expect(mocks.appService.saveLibraryBooks.mock.calls[1]?.[0]).toEqual([]);
    expect(mocks.libraryState.library).toEqual([]);
  });

  it('leaves a never-uploaded non-catalog active row untouched for a synthetic removal', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const localOnlyBook = {
      ...mocks.libraryBook,
      deletedAt: null,
      uploadedAt: null,
      catalogBookId: undefined,
    } as Book;
    mocks.libraryState.library = [localOnlyBook];
    mocks.pushChanges.mockResolvedValueOnce({
      reconcile: { upsert: [], remove: [localOnlyBook.hash] },
    });
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    await worker.pullNow('books');

    expect(mocks.libraryState.library).toEqual([localOnlyBook]);
    expect(mocks.cleanupDeletedBookArtifacts).not.toHaveBeenCalled();
    expect(mocks.appService.saveLibraryBooks).not.toHaveBeenCalled();
  });

  it.each(remoteCopyCases)(
    'preserves server-removal eligibility for remote-copy combination $label',
    async ({ catalogBookId, storagePath, catalogHash, uploadedAt }) => {
      const { SyncWorker } = await import('@/services/sync/syncWorker');
      const book = {
        ...mocks.libraryBook,
        hash: (catalogHash
          ? 'catalog:7231ff9a-24b9-4074-9369-bc7f88ffb179'
          : mocks.libraryBook.hash) as Book['hash'],
        catalogBookId: catalogBookId ? '7231ff9a-24b9-4074-9369-bc7f88ffb179' : null,
        storagePath: storagePath ? 'Openread/Books/remote-copy.epub' : null,
        uploadedAt: uploadedAt ? 1 : null,
        deletedAt: null,
      } as Book;
      mocks.libraryState.library = [book];
      mocks.pushChanges.mockResolvedValueOnce({
        reconcile: { upsert: [], remove: [book.hash] },
      });
      const worker = new SyncWorker();
      (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
      (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';
      const expectedRemoval = catalogBookId || storagePath || catalogHash || uploadedAt;

      await worker.pullNow('books');

      if (expectedRemoval) {
        expect(mocks.libraryState.library).toEqual([
          expect.objectContaining({ hash: book.hash, deletedAt: expect.any(Number) }),
        ]);
        expect(mocks.cleanupDeletedBookArtifacts).toHaveBeenCalledTimes(1);
      } else {
        expect(mocks.libraryState.library).toEqual([book]);
        expect(mocks.cleanupDeletedBookArtifacts).not.toHaveBeenCalled();
      }
    },
  );

  it('queues an ordinary concurrent save before the durable tombstone repair', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const activeBook = { ...mocks.libraryBook, deletedAt: null, uploadedAt: 1 } as Book;
    const unrelated = {
      ...mocks.libraryBook,
      hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      title: 'Unrelated',
    } as Book;
    const added = {
      ...mocks.libraryBook,
      hash: 'cccccccccccccccccccccccccccccccc',
      title: 'Added concurrently',
    } as Book;
    mocks.libraryState.library = [activeBook, unrelated];
    mocks.pushChanges.mockResolvedValueOnce({
      reconcile: { upsert: [], remove: [activeBook.hash] },
    });
    let releaseFirstSave!: () => void;
    const firstSaveGate = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    let releaseOrdinarySave!: () => void;
    const ordinarySaveGate = new Promise<void>((resolve) => {
      releaseOrdinarySave = resolve;
    });
    let saveTail = Promise.resolve();
    let saveInvocation = 0;
    let durableLibrary: Book[] = [];
    mocks.appService.saveLibraryBooks.mockImplementation((books: Book[]) => {
      const invocation = saveInvocation++;
      const snapshot = books.map((book) => ({ ...book }));
      const save = saveTail.then(async () => {
        if (invocation === 0) await firstSaveGate;
        if (invocation === 1) await ordinarySaveGate;
        durableLibrary = snapshot;
      });
      saveTail = save.catch(() => undefined);
      return save;
    });
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    const pull = worker.pullNow('books');
    await vi.waitFor(() => expect(mocks.appService.saveLibraryBooks).toHaveBeenCalledTimes(1));
    const updatedUnrelated = { ...unrelated, title: 'Unrelated updated concurrently' };
    const ordinaryLibrary = [activeBook, updatedUnrelated, added];
    mocks.libraryState.setLibrary(ordinaryLibrary);
    const ordinarySave = mocks.appService.saveLibraryBooks(ordinaryLibrary);
    releaseFirstSave();
    await vi.waitFor(() => expect(mocks.appService.saveLibraryBooks).toHaveBeenCalledTimes(3));
    releaseOrdinarySave();
    await Promise.all([ordinarySave, pull]);

    expect(mocks.libraryState.library).toEqual([
      expect.objectContaining({ hash: activeBook.hash, deletedAt: expect.any(Number) }),
      updatedUnrelated,
      added,
    ]);
    expect(mocks.appService.saveLibraryBooks.mock.calls[1]?.[0]).toEqual(ordinaryLibrary);
    expect(mocks.appService.saveLibraryBooks.mock.calls[2]?.[0]).toEqual(
      mocks.libraryState.library,
    );
    expect(durableLibrary).toEqual(mocks.libraryState.library);
  });

  it('repersists an active revival that lands during the final prune save', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const tombstone = { ...mocks.libraryBook, deletedAt: 2 } as Book;
    const revived = { ...tombstone, deletedAt: null, updatedAt: 3 } as Book;
    mocks.libraryState.library = [tombstone];
    mocks.pushChanges.mockResolvedValueOnce({
      reconcile: { upsert: [], remove: [tombstone.hash] },
    });
    mocks.cleanupDeletedBookArtifacts.mockResolvedValueOnce({
      candidates: 1,
      evicted: 1,
      retained: 0,
      failed: 0,
      bytesReclaimed: 100,
      localStorageKeysRemoved: 1,
      evictedBookHashes: [tombstone.hash],
    });
    let resolvePruneSave!: () => void;
    const pruneSave = new Promise<void>((resolve) => {
      resolvePruneSave = resolve;
    });
    mocks.appService.saveLibraryBooks.mockImplementationOnce(() => pruneSave);
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    const pull = worker.pullNow('books');
    await vi.waitFor(() => expect(mocks.appService.saveLibraryBooks).toHaveBeenCalledWith([]));
    mocks.libraryState.setLibrary([revived]);
    resolvePruneSave();
    await pull;

    expect(mocks.appService.saveLibraryBooks).toHaveBeenCalledTimes(2);
    expect(mocks.appService.saveLibraryBooks.mock.calls[1]?.[0]).toEqual([revived]);
    expect(mocks.libraryState.library).toEqual([revived]);
  });

  it('retains a server-absent tombstone through failed eviction and prunes it on a later success', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const tombstone = { ...mocks.libraryBook, deletedAt: 2 } as Book;
    mocks.libraryState.library = [tombstone];
    mocks.pushChanges.mockResolvedValue({
      reconcile: { upsert: [], remove: [tombstone.hash] },
    });
    mocks.cleanupDeletedBookArtifacts
      .mockResolvedValueOnce({
        candidates: 1,
        evicted: 0,
        retained: 0,
        failed: 1,
        bytesReclaimed: 0,
        localStorageKeysRemoved: 0,
        evictedBookHashes: [],
      })
      .mockResolvedValueOnce({
        candidates: 1,
        evicted: 1,
        retained: 0,
        failed: 0,
        bytesReclaimed: 100,
        localStorageKeysRemoved: 1,
        evictedBookHashes: [tombstone.hash],
      });
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    await worker.pullNow('books');

    expect(mocks.libraryState.library).toEqual([tombstone]);
    expect(mocks.appService.saveLibraryBooks).not.toHaveBeenCalled();

    await worker.pullNow('books');

    expect(mocks.cleanupDeletedBookArtifacts).toHaveBeenCalledTimes(2);
    expect(mocks.libraryState.library).toEqual([]);
    expect(mocks.appService.saveLibraryBooks).toHaveBeenCalledWith([]);
  });

  it('does not prune an evicted tombstone without settled server absence', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const tombstone = { ...mocks.libraryBook, deletedAt: 2 } as Book;
    mocks.libraryState.library = [tombstone];
    mocks.pushChanges.mockResolvedValueOnce({ reconcile: { upsert: [], remove: [] } });
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    await worker.pullNow('books');

    expect(mocks.cleanupDeletedBookArtifacts).not.toHaveBeenCalled();
    expect(mocks.libraryState.library).toEqual([tombstone]);
    expect(mocks.appService.saveLibraryBooks).not.toHaveBeenCalled();
  });

  it('keeps catalog reconciliation failures non-fatal and retries on the next sync', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const catalogBook = {
      ...mocks.libraryBook,
      hash: 'catalog:7231ff9a-24b9-4074-9369-bc7f88ffb179',
      catalogBookId: '7231ff9a-24b9-4074-9369-bc7f88ffb179',
      storagePath: 'catalog/books/gutenberg/book/new-sha/book.epub',
      contentReconcileRequired: true,
    } as Book;
    mocks.libraryState.library = [catalogBook];
    mocks.appService.exists.mockImplementation(async (path: string, _base: BaseDir) =>
      path.endsWith('.epub'),
    );
    mocks.appService.downloadBook
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const worker = new SyncWorker();
    const internal = worker as unknown as {
      stopped: boolean;
      userId: string;
      reconcileCatalogContent: (userId: string) => Promise<void>;
    };
    internal.stopped = false;
    internal.userId = 'user-1';

    await expect(internal.reconcileCatalogContent('user-1')).resolves.toBeUndefined();
    await expect(internal.reconcileCatalogContent('user-1')).resolves.toBeUndefined();

    expect(mocks.appService.downloadBook).toHaveBeenCalledTimes(2);
    expect(mocks.appService.downloadBook).toHaveBeenCalledWith(catalogBook, false, true);
    expect(warnSpy).toHaveBeenCalledWith(
      '[SyncWorker] Catalog content reconciliation failed',
      expect.objectContaining({ bookHash: catalogBook.hash, errorName: 'Error' }),
    );
    warnSpy.mockRestore();
  });

  it('logs a zero-candidate cover convergence decision with its exclusion reason', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const coveredBook = { ...mocks.libraryBook, coverImageUrl: 'blob:existing' } as Book;
    mocks.libraryState.library = [coveredBook];
    mocks.pushChanges.mockResolvedValueOnce({ reconcile: { upsert: [], remove: [] } });
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await worker.pullNow('books');

      expect(logSpy).toHaveBeenCalledWith('[SyncWorker] Cover convergence decision:', {
        libraryLength: 1,
        candidatesLength: 0,
        needsDownloadLength: 0,
        coverFileBookHashesSize: 0,
        excluded: {
          deleted: { count: 0, titles: [] },
          'catalog-backed': { count: 0, titles: [] },
          'has-cover-url': { count: 1, titles: ['Local Book'] },
          'no-file-metadata': { count: 0, titles: [] },
          'local-file-exists': { count: 0, titles: [] },
        },
      });
    } finally {
      logSpy.mockRestore();
    }
  });

  it('attributes a candidate excluded by the local existence check', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const localCoverBook = { ...mocks.libraryBook, uploadedAt: 1 } as Book;
    mocks.libraryState.library = [localCoverBook];
    mocks.appService.exists.mockResolvedValue(true);
    mocks.pushChanges.mockResolvedValueOnce({ reconcile: { upsert: [], remove: [] } });
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await worker.pullNow('books');

      expect(logSpy).toHaveBeenCalledWith('[SyncWorker] Cover convergence decision:', {
        libraryLength: 1,
        candidatesLength: 1,
        needsDownloadLength: 0,
        coverFileBookHashesSize: 0,
        excluded: {
          deleted: { count: 0, titles: [] },
          'catalog-backed': { count: 0, titles: [] },
          'has-cover-url': { count: 0, titles: [] },
          'no-file-metadata': { count: 0, titles: [] },
          'local-file-exists': { count: 1, titles: ['Local Book'] },
        },
      });
      expect(mocks.appService.downloadBookCovers).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });

  it('converges a missing user-import cover after an offline start reconnects', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const syncedUserBook = {
      ...mocks.libraryBook,
      catalogBookId: null,
      storagePath: 'Openread/Books/user-import.epub',
    } as Book;
    mocks.libraryState.library = [syncedUserBook];
    const worker = new SyncWorker();
    let online = false;
    const onlineSpy = vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
    mocks.pushChanges.mockResolvedValue({});
    mocks.appService.exists.mockResolvedValue(false);
    mocks.appService.downloadBookCovers.mockName('downloadBookCovers');
    mocks.appService.generateCoverImageUrl.mockResolvedValue('blob:cover');
    mocks.listFiles.mockImplementation(async () => {
      if (!online) throw new Error('offline');
      return {
        files: [
          {
            id: 'reconnected-cover',
            file_key: `user-1/Openread/Books/${syncedUserBook.hash}/cover.png`,
            file_size: 1234,
            file_type: 'cover',
            book_hash: syncedUserBook.hash,
            created_at: '2026-08-06T00:00:00.000Z',
            updated_at: '2026-08-06T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 1,
        totalPages: 1,
      };
    });

    try {
      worker.start('user-1');

      await vi.waitFor(() => expect(mocks.listFiles).toHaveBeenCalledTimes(1));
      expect(mocks.appService.downloadBookCovers).not.toHaveBeenCalled();

      online = true;
      window.dispatchEvent(new Event('online'));

      await vi.waitFor(() => expect(mocks.appService.downloadBookCovers).toHaveBeenCalledTimes(1));
      expect(mocks.appService.downloadBookCovers).toHaveBeenCalledWith([syncedUserBook]);
      expect(mocks.appService.generateCoverImageUrl).toHaveBeenCalledWith(syncedUserBook);
    } finally {
      worker.stop();
      onlineSpy.mockRestore();
    }
  });

  it('waits for reconnect reconciliation before cover convergence', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const syncedUserBook = {
      ...mocks.libraryBook,
      catalogBookId: null,
      storagePath: 'Openread/Books/user-import.epub',
    } as Book;
    mocks.libraryState.library = [syncedUserBook];
    const worker = new SyncWorker();
    let online = false;
    const onlineSpy = vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
    let resolveReconcile!: (value: unknown) => void;
    const reconcile = new Promise<unknown>((resolve) => {
      resolveReconcile = resolve;
    });
    mocks.pushChanges.mockReturnValue(reconcile);
    mocks.appService.exists.mockResolvedValue(false);
    mocks.appService.generateCoverImageUrl.mockResolvedValue('blob:cover');
    mocks.listFiles.mockImplementation(async () => {
      if (!online) throw new Error('offline');
      return {
        files: [
          {
            id: 'reconnected-cover',
            file_key: `user-1/Openread/Books/${syncedUserBook.hash}/cover.png`,
            file_size: 1234,
            file_type: 'cover',
            book_hash: syncedUserBook.hash,
            created_at: '2026-08-06T00:00:00.000Z',
            updated_at: '2026-08-06T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 1,
        totalPages: 1,
      };
    });

    try {
      worker.start('user-1');

      await vi.waitFor(() => expect(mocks.listFiles).toHaveBeenCalledTimes(1));
      expect(mocks.appService.downloadBookCovers).not.toHaveBeenCalled();
      mocks.listFiles.mockClear();

      online = true;
      window.dispatchEvent(new Event('online'));

      await vi.waitFor(() => expect(mocks.pushChanges).toHaveBeenCalledTimes(1));
      expect(mocks.listFiles).not.toHaveBeenCalled();

      resolveReconcile({});
      await vi.waitFor(() =>
        expect(mocks.appService.downloadBookCovers).toHaveBeenCalledWith([syncedUserBook]),
      );
      expect(mocks.appService.generateCoverImageUrl).toHaveBeenCalledWith(syncedUserBook);
    } finally {
      worker.stop();
      onlineSpy.mockRestore();
    }
  });

  it('checks but does not redownload an existing local cover after reconnect', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const locallyCoveredBook = { ...mocks.libraryBook, uploadedAt: 1 } as Book;
    mocks.libraryState.library = [locallyCoveredBook];
    const worker = new SyncWorker();
    let online = false;
    const onlineSpy = vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
    mocks.appService.exists.mockResolvedValue(true);
    mocks.pushChanges.mockResolvedValue({});

    try {
      worker.start('user-1');

      await vi.waitFor(() => expect(mocks.appService.exists).toHaveBeenCalledTimes(1));
      expect(mocks.appService.downloadBookCovers).not.toHaveBeenCalled();
      mocks.appService.exists.mockClear();
      mocks.appService.generateCoverImageUrl.mockClear();

      online = true;
      window.dispatchEvent(new Event('online'));

      await vi.waitFor(() => expect(mocks.appService.exists).toHaveBeenCalledTimes(1));
      expect(mocks.appService.generateCoverImageUrl).toHaveBeenCalledWith(locallyCoveredBook);
      expect(mocks.appService.downloadBookCovers).not.toHaveBeenCalled();
    } finally {
      worker.stop();
      onlineSpy.mockRestore();
    }
  });

  it('downloads a missing local cover for a synced user import on steady-state startup', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const syncedUserBook = {
      ...mocks.libraryBook,
      catalogBookId: null,
      storagePath: 'Openread/Books/user-import.epub',
    } as Book;
    mocks.libraryState.library = [syncedUserBook];
    const worker = new SyncWorker();
    mocks.appService.exists.mockResolvedValue(false);
    mocks.appService.generateCoverImageUrl.mockResolvedValue('blob:cover');
    mocks.listFiles.mockResolvedValue({
      files: [
        {
          id: 'steady-state-cover',
          file_key: `user-1/Openread/Books/${syncedUserBook.hash}/cover.png`,
          file_size: 1234,
          file_type: 'cover',
          book_hash: syncedUserBook.hash,
          created_at: '2026-08-06T00:00:00.000Z',
          updated_at: '2026-08-06T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 1,
      totalPages: 1,
    });
    mocks.pushChanges.mockResolvedValue({});

    try {
      worker.start('user-1');

      await vi.waitFor(() =>
        expect(mocks.appService.downloadBookCovers).toHaveBeenCalledWith([syncedUserBook]),
      );
      expect(mocks.appService.generateCoverImageUrl).toHaveBeenCalledWith(syncedUserBook);
    } finally {
      worker.stop();
    }
  });

  it('does not redownload a steady-state cover that already exists locally', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    mocks.appService.exists.mockResolvedValue(true);
    mocks.appService.generateCoverImageUrl.mockResolvedValue('blob:cover');
    mocks.listFiles.mockResolvedValue({
      files: [
        {
          id: 'existing-local-cover',
          file_key: `user-1/Openread/Books/${mocks.libraryBook.hash}/cover.png`,
          file_size: 1234,
          file_type: 'cover',
          book_hash: mocks.libraryBook.hash,
          created_at: '2026-08-06T00:00:00.000Z',
          updated_at: '2026-08-06T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 1,
      totalPages: 1,
    });
    mocks.pushChanges.mockResolvedValue({});

    try {
      worker.start('user-1');

      await vi.waitFor(() =>
        expect(mocks.appService.generateCoverImageUrl).toHaveBeenCalledWith(mocks.libraryBook),
      );
      expect(mocks.appService.downloadBookCovers).not.toHaveBeenCalled();
    } finally {
      worker.stop();
    }
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

  it('never treats catalog books as private cover download candidates', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const catalogBook = {
      ...mocks.libraryBook,
      hash: 'catalog:11111111-1111-4111-8111-111111111111',
      catalogBookId: '11111111-1111-4111-8111-111111111111',
      storagePath: 'catalog/books/source/book.epub',
      uploadedAt: 123,
      coverImageUrl: null,
    } as Book;
    mocks.libraryState.library = [catalogBook];
    mocks.listFiles.mockResolvedValueOnce({
      files: [
        {
          id: 'catalog-cover-file',
          file_key: `user-1/Openread/Books/${catalogBook.hash}/cover.png`,
          file_size: 1234,
          file_type: 'cover',
          book_hash: catalogBook.hash,
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
    mocks.appService.readFile.mockResolvedValueOnce(
      JSON.stringify({ storagePath: catalogBook.storagePath }),
    );
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    await worker.pullNow('books');

    expect(mocks.listFiles).toHaveBeenCalled();
    expect(mocks.appService.exists).toHaveBeenCalled();
    expect(mocks.appService.downloadBook).not.toHaveBeenCalled();
    expect(mocks.appService.downloadBookCovers).not.toHaveBeenCalled();
    expect(mocks.appService.generateCoverImageUrl).not.toHaveBeenCalled();
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
    expect(mocks.bookDataState.remoteConfigs[mocks.libraryBook.hash]?.config).toMatchObject({
      progress: [4, 10],
      location: 'epubcfi(/6/18)',
    });
    expect(consoleError).toHaveBeenCalledWith(
      '[SyncWorker] Skipping malformed remote book config row:',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it('does not advance either account cursor when owner changes during an empty config pull', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const { getCanonicalSyncCursor } = await import('@/services/sync/cursors');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';
    let releasePull!: () => void;
    mocks.pullChanges.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releasePull = () =>
            resolve({ configs: [], tombstones: [], cursorByEntity: { bookConfig: 2000 } });
        }),
    );

    const pulling = worker.pullBookConfigs();
    await vi.waitFor(() => expect(mocks.pullChanges).toHaveBeenCalled());
    mocks.libraryState.libraryOwnerUserId = 'user-2';
    (worker as unknown as { userId: string }).userId = 'user-2';
    releasePull();
    await pulling;

    expect(getCanonicalSyncCursor('user-1', 'bookConfig')).toBe(0);
    expect(getCanonicalSyncCursor('user-2', 'bookConfig')).toBe(0);
  });

  it('does not advance either account cursor when owner changes during queued config apply', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const { getCanonicalSyncCursor } = await import('@/services/sync/cursors');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';
    let releasePersistence!: () => void;
    mocks.appService.saveBookConfig.mockImplementationOnce(
      () => new Promise<undefined>((resolve) => (releasePersistence = () => resolve(undefined))),
    );
    mocks.pullChanges.mockResolvedValueOnce({
      configs: [
        {
          id: 'config-owner-switch',
          book_hash: mocks.libraryBook.hash,
          user_id: 'user-1',
          updated_at: 2000,
          deleted_at: null,
          data: {
            bookHash: mocks.libraryBook.hash,
            location: 'epubcfi(/6/6)',
            progress: [3, 10],
            updatedAt: 2000,
          },
        },
      ],
      tombstones: [],
      cursorByEntity: { bookConfig: 2000 },
    });

    const pulling = worker.pullBookConfigs();
    await vi.waitFor(() => expect(mocks.appService.saveBookConfig).toHaveBeenCalled());
    mocks.libraryState.libraryOwnerUserId = 'user-2';
    (worker as unknown as { userId: string }).userId = 'user-2';
    releasePersistence();
    await pulling;

    expect(getCanonicalSyncCursor('user-1', 'bookConfig')).toBe(0);
    expect(getCanonicalSyncCursor('user-2', 'bookConfig')).toBe(0);
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
    expect(mocks.bookDataState.remoteConfigs[mocks.libraryBook.hash]?.config).toMatchObject({
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
    expect(mocks.aiStore.upsertConversations).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'conversation-1' })],
      expect.any(Function),
    );
    expect(mocks.aiStore.upsertMessages).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'message-1' })],
      expect.any(Function),
    );
    expect(nowSpy).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });

  it('does not apply a remote AI pull invalidated by book chat eviction', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    let resolvePull: ((value: unknown) => void) | undefined;
    mocks.pullChanges.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePull = resolve;
        }),
    );

    const pull = worker.pullRemoteAIConversations();
    await vi.waitFor(() => expect(mocks.pullChanges).toHaveBeenCalledOnce());
    mocks.isBookChatGenerationCurrent.mockReturnValue(false);
    resolvePull?.({
      aiConversations: [
        {
          id: 'late-conversation',
          bookHash: mocks.libraryBook.hash,
          title: 'Late remote thread',
          createdAt: 1000,
          updatedAt: 2000,
        },
      ],
      aiMessages: [],
      cursorByEntity: {},
    });
    await pull;

    expect(mocks.aiStore.upsertConversations).not.toHaveBeenCalled();
    expect(mocks.aiStore.upsertMessages).not.toHaveBeenCalled();
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
