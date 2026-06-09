import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Book } from '@/types/book';

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

  return {
    libraryBook,
    libraryState,
    pushChanges: vi.fn(),
    pullChanges: vi.fn(),
    drain: vi.fn(async () => ({ synced: 0, failed: 0, remaining: 0 })),
    getAppService: vi.fn(async () => ({
      exists: vi.fn(async () => true),
      saveLibraryBooks: vi.fn(),
      saveSettings: vi.fn(),
    })),
  };
});

vi.mock('@/services/sync/offlineQueue', () => ({
  offlineQueue: {
    get pendingCount() {
      return 0;
    },
    drain: mocks.drain,
  },
}));

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
  useBookDataStore: { getState: vi.fn(() => ({})) },
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: {
    getState: vi.fn(() => ({
      settings: {},
      setSettings: vi.fn(),
    })),
  },
}));

vi.mock('@/services/environment', () => ({
  default: {
    getAppService: mocks.getAppService,
  },
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
});
