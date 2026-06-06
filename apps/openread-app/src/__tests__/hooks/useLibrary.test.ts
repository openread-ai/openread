import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibrary } from '@/hooks/useLibrary';
import type { Book } from '@/types/book';

const mocks = vi.hoisted(() => {
  const state = {
    library: [] as Book[],
    libraryLoaded: false,
  };
  const setLibrary = vi.fn((books: Book[]) => {
    state.library = books;
    state.libraryLoaded = true;
  });
  const setSettings = vi.fn();
  const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
  const saveSettings = vi.fn().mockResolvedValue(undefined);
  const loadLibraryBooks = vi.fn().mockResolvedValue([]);
  const loadSettings = vi.fn().mockResolvedValue({});
  const resetAccountScopedCollections = vi.fn();
  const pullNow = vi.fn().mockResolvedValue(undefined);
  const start = vi.fn();
  let user: { id: string } | null = null;

  const useLibraryStore = Object.assign(
    vi.fn(() => ({ setLibrary })),
    {
      getState: vi.fn(() => state),
    },
  );

  return {
    state,
    setLibrary,
    setSettings,
    saveLibraryBooks,
    saveSettings,
    loadLibraryBooks,
    loadSettings,
    resetAccountScopedCollections,
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
    }),
  },
}));

describe('useLibrary account isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.state.library = [];
    mocks.state.libraryLoaded = false;
    mocks.setUser(null);
    mocks.loadLibraryBooks.mockResolvedValue([]);
    mocks.saveLibraryBooks.mockResolvedValue(undefined);
    mocks.saveSettings.mockResolvedValue(undefined);
    mocks.loadSettings.mockResolvedValue({});
    mocks.resetAccountScopedCollections.mockClear();
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
    expect(mocks.saveLibraryBooks).toHaveBeenCalledWith([]);
    expect(mocks.resetAccountScopedCollections).toHaveBeenCalled();
    expect(mocks.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        lastSyncedAtBooks: 0,
        lastSyncedAtConfigs: 0,
        lastSyncedAtNotes: 0,
        lastSyncedAtSettings: 0,
      }),
    );
    expect(localStorage.getItem('openread_library_owner_user_id')).toBe('account-b');
    expect(mocks.start).toHaveBeenCalledWith('account-b');
    expect(mocks.pullNow).toHaveBeenCalledWith('books');
  });

  it('does not load disk books for anonymous users', async () => {
    mocks.loadLibraryBooks.mockResolvedValue([
      { hash: 'private-book', title: 'Private', author: 'A', format: 'epub' } as Book,
    ]);

    const { result } = renderHook(() => useLibrary());

    await waitFor(() => expect(result.current.libraryLoaded).toBe(true));
    expect(mocks.setLibrary).toHaveBeenCalledWith([]);
    expect(mocks.loadLibraryBooks).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.pullNow).not.toHaveBeenCalled();
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
  });
});
