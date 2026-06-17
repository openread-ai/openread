import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibrary } from '@/hooks/useLibrary';
import type { Book } from '@/types/book';

const mocks = vi.hoisted(() => {
  const state = {
    library: [] as Book[],
    libraryLoaded: false,
    isReconciling: false,
    libraryOwnerUserId: null as string | null,
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
  const setSettings = vi.fn();
  const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
  const saveSettings = vi.fn().mockResolvedValue(undefined);
  const loadLibraryBooks = vi.fn().mockResolvedValue([]);
  const loadSettings = vi.fn().mockResolvedValue({});
  const resetAccountScopedCollections = vi.fn();
  const setCollectionsOwnerUserId = vi.fn();
  const pullNow = vi.fn().mockResolvedValue(undefined);
  const start = vi.fn();
  let user: { id: string } | null = null;

  const useLibraryStore = Object.assign(
    vi.fn(() => ({
      setLibrary,
      setLibraryOwnerUserId,
      setIsReconciling,
      libraryLoaded: state.libraryLoaded,
      libraryOwnerUserId: state.libraryOwnerUserId,
      isReconciling: state.isReconciling,
    })),
    {
      getState: vi.fn(() => state),
    },
  );

  return {
    state,
    setLibrary,
    setLibraryOwnerUserId,
    setIsReconciling,
    setSettings,
    saveLibraryBooks,
    saveSettings,
    loadLibraryBooks,
    loadSettings,
    resetAccountScopedCollections,
    setCollectionsOwnerUserId,
    pullNow,
    start,
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
  useEnv: () => ({
    envConfig: {
      getAppService: vi.fn().mockResolvedValue({
        loadSettings: mocks.loadSettings,
        loadLibraryBooks: mocks.loadLibraryBooks,
        saveLibraryBooks: mocks.saveLibraryBooks,
        saveSettings: mocks.saveSettings,
      }),
    },
  }),
}));

vi.mock('@/services/sync/syncWorker', () => ({
  syncWorker: {
    start: mocks.start,
    pullNow: mocks.pullNow,
  },
}));

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: mocks.useLibraryStore,
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ setSettings: mocks.setSettings }),
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
    mocks.state.libraryOwnerUserId = null;
    mocks.setUser(null);
    mocks.setLibraryOwnerUserId.mockClear();
    mocks.setIsReconciling.mockClear();
    mocks.loadLibraryBooks.mockResolvedValue([]);
    mocks.saveLibraryBooks.mockResolvedValue(undefined);
    mocks.saveSettings.mockResolvedValue(undefined);
    mocks.loadSettings.mockResolvedValue({});
    mocks.resetAccountScopedCollections.mockClear();
    mocks.setCollectionsOwnerUserId.mockClear();
    mocks.pullNow.mockResolvedValue(undefined);
    mocks.start.mockClear();
  });

  it('clears stale local library when the authenticated user changes', async () => {
    const staleBook = {
      hash: 'account-a-book',
      title: 'Account A',
      author: 'A',
      format: 'epub',
    } as Book;
    mocks.state.library = [staleBook];
    localStorage.setItem('openread_library_owner_user_id', 'account-a');
    mocks.setUser({ id: 'account-b' });

    const { result } = renderHook(() => useLibrary());

    await waitFor(() => expect(result.current.libraryLoaded).toBe(true));
    expect(mocks.setLibrary).toHaveBeenCalledWith([]);
    expect(mocks.setLibrary.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setLibraryOwnerUserId.mock.invocationCallOrder[0]!,
    );
    expect(mocks.saveLibraryBooks).toHaveBeenCalledWith([]);
    expect(mocks.resetAccountScopedCollections).toHaveBeenCalled();
    expect(mocks.setCollectionsOwnerUserId).toHaveBeenCalledWith('account-b');
    expect(mocks.saveSettings).toHaveBeenCalledWith(expect.objectContaining({}));
    expect(mocks.setLibraryOwnerUserId).toHaveBeenCalledWith('account-b');
    expect(localStorage.getItem('openread_library_owner_user_id')).toBe('account-b');
    expect(mocks.start).toHaveBeenCalledWith('account-b');
    expect(mocks.pullNow).toHaveBeenCalledWith('books');
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
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.pullNow).not.toHaveBeenCalled();
    expect(mocks.setIsReconciling).not.toHaveBeenCalled();
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

  it('does not rerun the initial reconcile when remounted for the same loaded account', async () => {
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
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.pullNow).not.toHaveBeenCalled();
    expect(mocks.setIsReconciling).not.toHaveBeenCalled();
    expect(mocks.loadLibraryBooks).not.toHaveBeenCalled();
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
    await waitFor(() => expect(mocks.pullNow).toHaveBeenCalledWith('books'));
    expect(result.current.libraryLoaded).toBe(true);

    resolvePull();
    await waitFor(() => expect(mocks.setIsReconciling).toHaveBeenLastCalledWith(false));
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
    expect(mocks.setIsReconciling).toHaveBeenCalledWith(true);

    resolvePull();

    await waitFor(() => expect(result.current.libraryLoaded).toBe(true));
    expect(mocks.setIsReconciling).toHaveBeenLastCalledWith(false);
  });
});
