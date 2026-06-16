import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Book, BookConfig } from '@/types/book';

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
    saveLibraryBooks: vi.fn(),
    saveSettings: vi.fn(),
  };

  return {
    libraryBook,
    libraryState,
    bookDataState,
    settingsState,
    platformSidebarState,
    appService,
    pushChanges: vi.fn(),
    pullChanges: vi.fn(),
    getAppService: vi.fn(async () => appService),
  };
});

vi.mock('@/libs/sync', () => ({
  SyncClient: vi.fn().mockImplementation(function SyncClient() {
    return {
      pushChanges: mocks.pushChanges,
      pullChanges: mocks.pullChanges,
    };
  }),
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
  aiStore: {},
}));

vi.mock('@/store/aiChatStore', () => ({
  useAIChatStore: { getState: vi.fn(() => ({})) },
}));

vi.mock('@/utils/access', () => ({
  getAccessToken: vi.fn(async () => 'token'),
}));

vi.mock('@/utils/fetch', () => ({
  getPlatformFetch: vi.fn(() => fetch),
}));

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('SyncWorker book reconcile queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mocks.appService.saveSettings.mockClear();
    mocks.pullChanges.mockResolvedValue({ books: [] });
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

  it('applies canonical bookConfig tombstones and advances the config watermark', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    const bookKey = `${mocks.libraryBook.hash}-epub`;
    mocks.settingsState.settings = { lastSyncedAtConfigs: 999 };
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
    expect(mocks.settingsState.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ lastSyncedAtConfigs: 3000 }),
    );
    expect(mocks.appService.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ lastSyncedAtConfigs: 3000 }),
    );
  });

  it('applies canonical bookNote tombstones and advances the notes watermark', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    const bookKey = `${mocks.libraryBook.hash}-epub`;
    mocks.settingsState.settings = { lastSyncedAtNotes: 999 };
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
    expect(mocks.settingsState.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ lastSyncedAtNotes: 4000 }),
    );
    expect(mocks.appService.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ lastSyncedAtNotes: 4000 }),
    );
  });

  it('applies canonical collection tombstones and advances the settings watermark', async () => {
    const { SyncWorker } = await import('@/services/sync/syncWorker');
    const worker = new SyncWorker();
    (worker as unknown as { stopped: boolean; userId: string }).stopped = false;
    (worker as unknown as { stopped: boolean; userId: string }).userId = 'user-1';

    mocks.settingsState.settings = { lastSyncedAtSettings: 999 };
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
    expect(mocks.settingsState.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ lastSyncedAtSettings: 5000 }),
    );
    expect(mocks.appService.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ lastSyncedAtSettings: 5000 }),
    );
  });
});
