import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibrary } from '@/hooks/useLibrary';
import type { Book } from '@/types/book';

const mocks = vi.hoisted(() => {
  const state = {
    library: [] as Book[],
    libraryLoaded: false,
    isReconciling: false,
    syncError: null as string | null,
    libraryOwnerUserId: null as string | null,
    getVisibleLibrary() {
      return this.library.filter((book) => !book.deletedAt);
    },
  };
  const setLibrary = vi.fn((books: Book[]) => {
    state.library = books;
    state.libraryLoaded = true;
  });
  const setLibraryOwnerUserId = vi.fn((userId: string | null) => {
    state.libraryOwnerUserId = userId;
  });
  const setIsReconciling = vi.fn((reconciling: boolean) => {
    state.isReconciling = reconciling;
  });
  const setSyncError = vi.fn((error: string | null) => {
    state.syncError = error;
  });
  const setSettings = vi.fn();
  const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
  const saveSettings = vi.fn().mockResolvedValue(undefined);
  const loadLibraryBooks = vi.fn().mockResolvedValue([]);
  const loadSettings = vi.fn().mockResolvedValue({});
  const appService = {
    loadSettings,
    loadLibraryBooks,
    saveLibraryBooks,
    saveSettings,
  };
  const envConfig = { getAppService: vi.fn().mockResolvedValue(appService) };
  const resetAccountScopedCollections = vi.fn();
  const setCollectionsOwnerUserId = vi.fn();
  const libraryViewState = { selectedBooks: [] as string[], isSelectMode: false };
  const clearSelection = vi.fn(() => {
    libraryViewState.selectedBooks = [];
  });
  const setSelectMode = vi.fn((enabled: boolean) => {
    libraryViewState.isSelectMode = enabled;
    if (!enabled) libraryViewState.selectedBooks = [];
  });
  const pullNow = vi.fn().mockResolvedValue(undefined);
  const start = vi.fn();
  const stop = vi.fn();
  const resetCanonicalSyncCursors = vi.fn();
  let user: { id: string } | null = null;

  const getLibraryStoreState = () => ({
    ...state,
    setLibrary,
    setLibraryOwnerUserId,
    setIsReconciling,
    setSyncError,
    getVisibleLibrary: () => state.library.filter((book) => !book.deletedAt),
  });
  const useLibraryStore = Object.assign(
    vi.fn((selector?: (storeState: ReturnType<typeof getLibraryStoreState>) => unknown) => {
      const storeState = getLibraryStoreState();
      return selector ? selector(storeState) : storeState;
    }),
    {
      getState: vi.fn(getLibraryStoreState),
    },
  );

  return {
    state,
    setLibrary,
    setLibraryOwnerUserId,
    setIsReconciling,
    setSyncError,
    setSettings,
    saveLibraryBooks,
    saveSettings,
    loadLibraryBooks,
    loadSettings,
    appService,
    envConfig,
    resetAccountScopedCollections,
    setCollectionsOwnerUserId,
    libraryViewState,
    clearSelection,
    setSelectMode,
    pullNow,
    start,
    stop,
    resetCanonicalSyncCursors,
    get user() {
      return user;
    },
    setUser(nextUser: { id: string } | null) {
      user = nextUser;
    },
    useLibraryStore,
  };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: mocks.envConfig }),
}));

vi.mock('@/services/sync/syncWorker', () => ({
  syncWorker: {
    start: mocks.start,
    stop: mocks.stop,
    pullNow: mocks.pullNow,
    get status() {
      return { error: mocks.state.syncError };
    },
  },
}));

vi.mock('@/services/sync/cursors', () => ({
  resetCanonicalSyncCursors: mocks.resetCanonicalSyncCursors,
}));

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: mocks.useLibraryStore,
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ setSettings: mocks.setSettings }),
}));

vi.mock('@/store/libraryViewStore', () => ({
  useLibraryViewStore: {
    getState: () => ({
      clearSelection: mocks.clearSelection,
      setSelectMode: mocks.setSelectMode,
    }),
  },
}));

vi.mock('@/store/platformSidebarStore', () => ({
  usePlatformSidebarStore: {
    getState: () => ({
      resetAccountScopedCollections: mocks.resetAccountScopedCollections,
      setCollectionsOwnerUserId: mocks.setCollectionsOwnerUserId,
    }),
  },
}));

describe('useLibrary account isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.state.library = [];
    mocks.state.libraryLoaded = false;
    mocks.state.isReconciling = false;
    mocks.state.syncError = null;
    mocks.state.libraryOwnerUserId = null;
    mocks.libraryViewState.selectedBooks = [];
    mocks.libraryViewState.isSelectMode = false;
    mocks.setUser(null);
    mocks.setLibraryOwnerUserId.mockClear();
    mocks.setIsReconciling.mockClear();
    mocks.setSyncError.mockClear();
    mocks.loadLibraryBooks.mockResolvedValue([]);
    mocks.saveLibraryBooks.mockResolvedValue(undefined);
    mocks.saveSettings.mockResolvedValue(undefined);
    mocks.loadSettings.mockResolvedValue({});
    mocks.resetAccountScopedCollections.mockClear();
    mocks.setCollectionsOwnerUserId.mockClear();
    mocks.clearSelection.mockClear();
    mocks.setSelectMode.mockClear();
    mocks.pullNow.mockResolvedValue(undefined);
    mocks.start.mockClear();
    mocks.stop.mockClear();
    mocks.resetCanonicalSyncCursors.mockClear();
  });

  it('clears stale local library and same-hash selection when the user changes', async () => {
    const staleBook = {
      hash: 'shared-account-book',
      title: 'Account A',
      author: 'A',
      format: 'epub',
    } as Book;
    mocks.state.library = [staleBook];
    mocks.libraryViewState.selectedBooks = [staleBook.hash];
    mocks.libraryViewState.isSelectMode = true;
    localStorage.setItem('openread_library_owner_user_id', 'account-a');
    mocks.setUser({ id: 'account-b' });

    const { result } = renderHook(() => useLibrary());

    await waitFor(() => expect(result.current.libraryLoaded).toBe(true));
    expect(mocks.stop).toHaveBeenCalled();
    expect(mocks.setLibrary).toHaveBeenCalledWith([]);
    expect(mocks.stop.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setLibrary.mock.invocationCallOrder[0]!,
    );
    expect(mocks.setLibrary.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setLibraryOwnerUserId.mock.invocationCallOrder[0]!,
    );
    expect(mocks.saveLibraryBooks).toHaveBeenCalledWith([]);
    expect(mocks.resetAccountScopedCollections).toHaveBeenCalled();
    expect(mocks.clearSelection).toHaveBeenCalled();
    expect(mocks.setSelectMode).toHaveBeenCalledWith(false);
    expect(mocks.libraryViewState.selectedBooks).toEqual([]);
    expect(mocks.libraryViewState.isSelectMode).toBe(false);
    expect(mocks.clearSelection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setLibrary.mock.invocationCallOrder[0]!,
    );
    expect(mocks.setSelectMode.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setLibraryOwnerUserId.mock.invocationCallOrder[0]!,
    );
    expect(mocks.setCollectionsOwnerUserId).toHaveBeenCalledWith('account-b');
    expect(mocks.saveSettings).not.toHaveBeenCalled();
    expect(mocks.resetCanonicalSyncCursors).toHaveBeenCalledWith('account-b');
    expect(mocks.setLibraryOwnerUserId).toHaveBeenCalledWith('account-b');
    expect(localStorage.getItem('openread_library_owner_user_id')).toBe('account-b');
    expect(mocks.start).toHaveBeenCalledWith('account-b');
    expect(mocks.pullNow).toHaveBeenCalledWith('books');
    expect(mocks.setIsReconciling).toHaveBeenNthCalledWith(1, true);
    expect(mocks.setIsReconciling).toHaveBeenLastCalledWith(false);
  });

  it('does not commit a new owner when the owner-mismatch disk wipe fails', async () => {
    const staleBook = {
      hash: 'account-a-book',
      title: 'Account A',
      author: 'A',
      format: 'epub',
    } as Book;
    mocks.state.library = [staleBook];
    mocks.state.libraryOwnerUserId = 'account-a';
    localStorage.setItem('openread_library_owner_user_id', 'account-a');
    mocks.setUser({ id: 'account-b' });
    mocks.saveLibraryBooks.mockRejectedValueOnce(new Error('disk wipe failed'));

    const { result } = renderHook(() => useLibrary());

    await waitFor(() => expect(mocks.setSyncError).toHaveBeenCalledWith('disk wipe failed'));
    expect(result.current.libraryLoaded).toBe(false);
    expect(mocks.clearSelection).toHaveBeenCalled();
    expect(mocks.setSelectMode).toHaveBeenCalledWith(false);
    expect(mocks.stop).toHaveBeenCalled();
    expect(mocks.setLibrary).toHaveBeenCalledWith([]);
    expect(mocks.stop.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setLibrary.mock.invocationCallOrder[0]!,
    );
    expect(mocks.setLibraryOwnerUserId).not.toHaveBeenCalledWith('account-b');
    expect(mocks.setCollectionsOwnerUserId).not.toHaveBeenCalledWith('account-b');
    expect(localStorage.getItem('openread_library_owner_user_id')).toBe('account-a');
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.pullNow).not.toHaveBeenCalled();
    expect(mocks.loadLibraryBooks).not.toHaveBeenCalled();
    expect(mocks.setIsReconciling).toHaveBeenNthCalledWith(1, true);
    expect(mocks.setIsReconciling).toHaveBeenLastCalledWith(false);
  });

  it('does not load disk books for anonymous users', async () => {
    mocks.loadLibraryBooks.mockResolvedValue([
      { hash: 'private-book', title: 'Private', author: 'A', format: 'epub' } as Book,
    ]);

    const { result } = renderHook(() => useLibrary());

    await waitFor(() => expect(result.current.libraryLoaded).toBe(true));
    expect(mocks.setLibrary).toHaveBeenCalledWith([]);
    expect(mocks.setLibraryOwnerUserId).toHaveBeenCalledWith(null);
    expect(mocks.loadLibraryBooks).not.toHaveBeenCalled();
    expect(mocks.resetAccountScopedCollections).toHaveBeenCalled();
    expect(mocks.setCollectionsOwnerUserId).toHaveBeenCalledWith(null);
    expect(mocks.stop).toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.pullNow).not.toHaveBeenCalled();
    expect(mocks.setIsReconciling).not.toHaveBeenCalledWith(true);
  });

  it('does not reuse anonymous readiness when the authenticated account resolves', async () => {
    let resolvePull: () => void = () => {};
    const { result, rerender } = renderHook(() => useLibrary());

    await waitFor(() => expect(result.current.libraryLoaded).toBe(true));

    mocks.pullNow.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolvePull = resolve;
      }),
    );
    mocks.setUser({ id: 'account-after-anonymous' });
    rerender();

    expect(result.current.libraryLoaded).toBe(false);
    await waitFor(() => expect(mocks.pullNow).toHaveBeenCalledWith('books'));
    expect(result.current.libraryLoaded).toBe(false);

    resolvePull();
    await waitFor(() => expect(result.current.libraryLoaded).toBe(true));
  });

  it('ignores a cancelled account completion that settles after the current account', async () => {
    let resolveAccountA: () => void = () => {};
    let resolveAccountB: () => void = () => {};
    const accountAPull = new Promise<void>((resolve) => {
      resolveAccountA = resolve;
    });
    const accountBPull = new Promise<void>((resolve) => {
      resolveAccountB = resolve;
    });
    mocks.pullNow.mockReturnValueOnce(accountAPull).mockReturnValueOnce(accountBPull);
    mocks.setUser({ id: 'account-a' });

    const { result, rerender } = renderHook(() => useLibrary());

    await waitFor(() => expect(mocks.pullNow).toHaveBeenCalledTimes(1));
    expect(result.current.libraryLoaded).toBe(false);
    expect(result.current.libraryReconciliationSettled).toBe(false);

    mocks.setUser({ id: 'account-b' });
    rerender();

    await waitFor(() => expect(mocks.pullNow).toHaveBeenCalledTimes(2));
    expect(result.current.libraryLoaded).toBe(false);

    await act(async () => {
      resolveAccountB();
      await accountBPull;
    });
    await waitFor(() => expect(result.current.libraryLoaded).toBe(true));
    expect(result.current.libraryReconciliationSettled).toBe(true);

    await act(async () => {
      resolveAccountA();
      await accountAPull;
    });
    expect(result.current.libraryLoaded).toBe(true);
    expect(result.current.libraryReconciliationSettled).toBe(true);
  });

  it('does not let stale disk load overwrite an in-memory account library', async () => {
    const activeBook = {
      hash: 'active-account-book',
      title: 'Active Account',
      author: 'A',
      format: 'epub',
    } as Book;
    const staleDiskBook = {
      hash: 'stale-disk-book',
      title: 'Stale Disk',
      author: 'B',
      format: 'epub',
    } as Book;
    mocks.state.library = [activeBook];
    localStorage.setItem('openread_library_owner_user_id', 'account-a');
    mocks.setUser({ id: 'account-a' });
    mocks.loadLibraryBooks.mockResolvedValue([staleDiskBook]);

    const { result } = renderHook(() => useLibrary());

    await waitFor(() => expect(result.current.libraryLoaded).toBe(true));
    expect(mocks.setLibrary).not.toHaveBeenCalledWith([staleDiskBook]);
    expect(mocks.state.library).toEqual([activeBook]);
    expect(mocks.start).toHaveBeenCalledWith('account-a');
    expect(mocks.pullNow).toHaveBeenCalledWith('books');
    expect(mocks.setIsReconciling).toHaveBeenNthCalledWith(1, true);
    expect(mocks.setIsReconciling).toHaveBeenLastCalledWith(false);
  });

  it('reattaches regenerated disk cover URLs to an already-hydrated cached library', async () => {
    const cachedBook = {
      hash: 'cached-local-book',
      title: 'Cached Local Book',
      author: 'A',
      format: 'epub',
      updatedAt: 200,
    } as Book;
    const diskBookWithRegeneratedCover = {
      ...cachedBook,
      title: 'Older Disk Title',
      updatedAt: 100,
      coverImageUrl: 'blob:http://localhost:3000/regenerated-cover',
    } as Book;
    mocks.state.library = [cachedBook];
    mocks.state.libraryLoaded = true;
    mocks.state.libraryOwnerUserId = 'account-cover-refresh';
    localStorage.setItem('openread_library_owner_user_id', 'account-cover-refresh');
    mocks.setUser({ id: 'account-cover-refresh' });
    mocks.loadLibraryBooks.mockResolvedValue([diskBookWithRegeneratedCover]);

    const { result } = renderHook(() => useLibrary());

    await waitFor(() => expect(result.current.libraryLoaded).toBe(true));
    await waitFor(() =>
      expect(mocks.setLibrary).toHaveBeenCalledWith([
        expect.objectContaining({
          hash: 'cached-local-book',
          title: 'Cached Local Book',
          updatedAt: 200,
          coverImageUrl: 'blob:http://localhost:3000/regenerated-cover',
        }),
      ]),
    );
    expect(mocks.state.library).toEqual([
      expect.objectContaining({
        hash: 'cached-local-book',
        title: 'Cached Local Book',
        updatedAt: 200,
        coverImageUrl: 'blob:http://localhost:3000/regenerated-cover',
      }),
    ]);
  });

  it('reruns the account lifecycle idempotently when remounted for the same loaded account', async () => {
    localStorage.setItem('openread_library_owner_user_id', 'account-remount');
    mocks.setUser({ id: 'account-remount' });

    const { result, unmount } = renderHook(() => useLibrary());

    await waitFor(() => expect(result.current.libraryLoaded).toBe(true));
    expect(mocks.start).toHaveBeenCalledWith('account-remount');
    expect(mocks.pullNow).toHaveBeenCalledWith('books');

    mocks.start.mockClear();
    mocks.pullNow.mockClear();
    mocks.setIsReconciling.mockClear();
    mocks.loadLibraryBooks.mockClear();
    unmount();

    const { result: remounted } = renderHook(() => useLibrary());

    await waitFor(() => expect(remounted.current.libraryLoaded).toBe(true));
    expect(mocks.start).toHaveBeenCalledWith('account-remount');
    expect(mocks.pullNow).toHaveBeenCalledWith('books');
    expect(mocks.setIsReconciling).toHaveBeenCalledWith(true);
    expect(mocks.loadLibraryBooks).toHaveBeenCalled();
  });

  it('returns account-scoped cached library immediately while reconcile runs in the background', async () => {
    const cachedBook = {
      hash: 'cached-book',
      title: 'Cached Book',
      author: 'A',
      format: 'epub',
    } as Book;
    let resolvePull: () => void = () => {};
    mocks.state.library = [cachedBook];
    mocks.state.libraryLoaded = true;
    mocks.state.libraryOwnerUserId = 'account-cached';
    localStorage.setItem('openread_library_owner_user_id', 'account-cached');
    mocks.setUser({ id: 'account-cached' });
    mocks.pullNow.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolvePull = resolve;
      }),
    );

    const { result } = renderHook(() => useLibrary());

    expect(result.current.libraryLoaded).toBe(true);
    expect(result.current.libraryReconciliationSettled).toBe(false);
    await waitFor(() => expect(mocks.pullNow).toHaveBeenCalledWith('books'));
    expect(result.current.libraryLoaded).toBe(true);
    expect(result.current.libraryReconciliationSettled).toBe(false);

    resolvePull();
    await waitFor(() => expect(result.current.libraryReconciliationSettled).toBe(true));
    expect(mocks.setIsReconciling).toHaveBeenLastCalledWith(false);
  });

  it('keeps libraryLoaded false until the initial authenticated book reconcile settles without account cache', async () => {
    let resolvePull: () => void = () => {};
    mocks.setUser({ id: 'account-a' });
    mocks.pullNow.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolvePull = resolve;
      }),
    );

    const { result } = renderHook(() => useLibrary());

    await waitFor(() => expect(mocks.pullNow).toHaveBeenCalledWith('books'));
    expect(result.current.libraryLoaded).toBe(false);
    expect(result.current.libraryReconciliationSettled).toBe(false);
    expect(mocks.setIsReconciling).toHaveBeenCalledWith(true);

    resolvePull();

    await waitFor(() => expect(result.current.libraryLoaded).toBe(true));
    expect(result.current.libraryReconciliationSettled).toBe(true);
    expect(mocks.setIsReconciling).toHaveBeenLastCalledWith(false);
  });
});
