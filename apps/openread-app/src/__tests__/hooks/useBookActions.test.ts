import { testOpenReadBookRef } from '../utils/bookIdentityFixtures';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBookActions } from '@/hooks/useBookActions';
import { runAccountLibraryMutation } from '@/services/accountLibraryLifecycle';
import {
  enqueueBookForSync,
  enqueueBooksForSync,
  requireSyncMutationUserId,
} from '@/services/sync/helpers';
import { SyncMutationDeliveryError } from '@/services/sync/engine';
import type { Book } from '@/types/book';

// Use vi.hoisted so these variables are available inside vi.mock factories (which are hoisted)
const {
  mockLibraryStoreState,
  mockPlatformSidebarStoreState,
  mockLibraryViewStoreState,
  mockDispatch,
  mockAppService,
} = vi.hoisted(() => {
  const mockLibraryStoreState = {
    library: [] as Book[],
    libraryOwnerUserId: 'user-1' as string | null,
    updateBook: vi.fn().mockResolvedValue(undefined),
    setLibrary: vi.fn(),
  };
  const mockPlatformSidebarStoreState = {
    addBookToCollection: vi.fn(),
    collections: [] as Array<{ id: string; bookHashes: string[] }>,
    removeBookFromCollection: vi.fn(),
  };
  const mockLibraryViewStoreState = {
    clearSelection: vi.fn(),
    setSelectMode: vi.fn(),
  };
  const mockDispatch = vi.fn();
  const mockAppService = {
    deleteDir: vi.fn().mockResolvedValue(undefined),
    saveLibraryBooks: vi.fn().mockResolvedValue(undefined),
  };
  return {
    mockLibraryStoreState,
    mockPlatformSidebarStoreState,
    mockLibraryViewStoreState,
    mockDispatch,
    mockAppService,
  };
});

// Mock environment config
vi.mock('@/services/environment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/environment')>();
  return {
    ...actual,
    default: {
      getAppService: vi.fn().mockResolvedValue(mockAppService),
    },
    getAPIBaseUrl: vi.fn(() => 'http://localhost:3000/api'),
  };
});

// Mock event dispatcher
vi.mock('@/utils/event', () => ({
  eventDispatcher: {
    dispatch: (...args: unknown[]) => mockDispatch(...args),
  },
}));

// Mock stores - useLibraryStore also needs getState for optimistic rollback
vi.mock('@/store/libraryStore', () => {
  const useLibraryStoreMock = (selector: (state: typeof mockLibraryStoreState) => unknown) =>
    selector(mockLibraryStoreState);
  useLibraryStoreMock.getState = () => mockLibraryStoreState;
  return { useLibraryStore: useLibraryStoreMock };
});

vi.mock('@/store/platformSidebarStore', () => {
  const usePlatformSidebarStoreMock = (
    selector: (state: typeof mockPlatformSidebarStoreState) => unknown,
  ) => selector(mockPlatformSidebarStoreState);
  usePlatformSidebarStoreMock.getState = () => mockPlatformSidebarStoreState;
  return { usePlatformSidebarStore: usePlatformSidebarStoreMock };
});

vi.mock('@/store/libraryViewStore', () => ({
  useLibraryViewStore: (selector: (state: typeof mockLibraryViewStoreState) => unknown) =>
    selector(mockLibraryViewStoreState),
}));

vi.mock('@/store/bookDataStore', () => {
  const mockBookDataStore = {
    getConfig: vi.fn(),
    setConfig: vi.fn(),
  };
  const useBookDataStoreMock = (selector: (state: typeof mockBookDataStore) => unknown) =>
    selector(mockBookDataStore);
  useBookDataStoreMock.getState = () => mockBookDataStore;
  return { useBookDataStore: useBookDataStoreMock };
});

vi.mock('@/utils/access', () => ({
  getAccessToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/services/sync/helpers', () => ({
  enqueueBookForSync: vi.fn().mockResolvedValue(undefined),
  enqueueBooksForSync: vi.fn().mockResolvedValue(undefined),
  handleFireAndForgetSyncEnqueue: vi.fn((promise: Promise<void>) => {
    void promise.catch(() => {});
  }),
  requireSyncMutationUserId: vi.fn().mockReturnValue('user-1'),
  SyncMutationContextUnavailableError: class extends Error {},
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

const createMockBook = (overrides: Partial<Book> = {}): Book => ({
  hash: testOpenReadBookRef(`hash-${Math.random().toString(36).substring(7)}`),
  title: 'Test Book',
  author: 'Test Author',
  format: 'epub',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  coverImageUrl: null,
  ...overrides,
});

describe('useBookActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLibraryStoreState.library = [];
    mockLibraryStoreState.libraryOwnerUserId = 'user-1';
    mockLibraryStoreState.updateBook = vi.fn().mockResolvedValue(undefined);
    mockLibraryStoreState.setLibrary = vi.fn();
    mockPlatformSidebarStoreState.addBookToCollection = vi.fn();
    mockPlatformSidebarStoreState.collections = [];
    mockPlatformSidebarStoreState.removeBookFromCollection = vi.fn();
    mockLibraryViewStoreState.clearSelection = vi.fn();
    mockLibraryViewStoreState.setSelectMode = vi.fn();
    mockAppService.deleteDir = vi.fn().mockResolvedValue(undefined);
    mockAppService.saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
    vi.mocked(enqueueBookForSync).mockResolvedValue(undefined);
    vi.mocked(enqueueBooksForSync).mockResolvedValue(undefined);
    vi.mocked(requireSyncMutationUserId).mockReturnValue('user-1');
  });

  describe('setReadingStatus', () => {
    it('updates book reading status', async () => {
      const mockBook = createMockBook({ hash: testOpenReadBookRef('book-123') });
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.setReadingStatus(mockBook, 'finished');
      });

      expect(mockLibraryStoreState.updateBook).toHaveBeenCalledTimes(1);
      const [, updatedBook] = mockLibraryStoreState.updateBook.mock.calls[0] as [unknown, Book];
      expect(updatedBook.hash).toBe(mockBook.hash);
      expect(updatedBook.readingStatus).toBe('finished');
      expect(updatedBook.updatedAt).toBeGreaterThan(0);
    });

    it('updates book reading status to unread', async () => {
      const mockBook = createMockBook({
        hash: testOpenReadBookRef('book-456'),
        readingStatus: 'finished',
      });
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.setReadingStatus(mockBook, 'unread');
      });

      const [, updatedBook] = mockLibraryStoreState.updateBook.mock.calls[0] as [unknown, Book];
      expect(updatedBook.readingStatus).toBe('unread');
    });

    it('updates book reading status to reading', async () => {
      const mockBook = createMockBook({ hash: testOpenReadBookRef('book-789') });
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.setReadingStatus(mockBook, 'reading');
      });

      const [, updatedBook] = mockLibraryStoreState.updateBook.mock.calls[0] as [unknown, Book];
      expect(updatedBook.readingStatus).toBe('reading');
    });
  });

  describe('renameBook', () => {
    it('updates book title', async () => {
      const mockBook = createMockBook({
        hash: testOpenReadBookRef('book-123'),
        title: 'Old Title',
      });
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.renameBook(mockBook, 'New Title');
      });

      expect(mockLibraryStoreState.updateBook).toHaveBeenCalledTimes(1);
      const [, updatedBook] = mockLibraryStoreState.updateBook.mock.calls[0] as [unknown, Book];
      expect(updatedBook.title).toBe('New Title');
    });

    it('trims whitespace from title', async () => {
      const mockBook = createMockBook({ hash: testOpenReadBookRef('book-123') });
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.renameBook(mockBook, '  Trimmed Title  ');
      });

      const [, updatedBook] = mockLibraryStoreState.updateBook.mock.calls[0] as [unknown, Book];
      expect(updatedBook.title).toBe('Trimmed Title');
    });

    it('does not update if title is empty', async () => {
      const mockBook = createMockBook({ hash: testOpenReadBookRef('book-123') });
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.renameBook(mockBook, '   ');
      });

      expect(mockLibraryStoreState.updateBook).not.toHaveBeenCalled();
    });

    it('does not update if title is empty string', async () => {
      const mockBook = createMockBook({ hash: testOpenReadBookRef('book-123') });
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.renameBook(mockBook, '');
      });

      expect(mockLibraryStoreState.updateBook).not.toHaveBeenCalled();
    });
  });

  describe('bulkSetReadingStatus', () => {
    it('updates multiple books and exits select mode', async () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('book-1') }),
        createMockBook({ hash: testOpenReadBookRef('book-2') }),
        createMockBook({ hash: testOpenReadBookRef('book-3') }),
      ];
      mockLibraryStoreState.library = books;
      const hashes = books.map((book) => book.hash);
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.bulkSetReadingStatus(hashes, 'finished');
      });

      expect(mockLibraryStoreState.updateBook).toHaveBeenCalledTimes(3);
      expect(mockLibraryViewStoreState.clearSelection).toHaveBeenCalled();
      expect(mockLibraryViewStoreState.setSelectMode).toHaveBeenCalledWith(false);
    });

    it('sets correct reading status for each book', async () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('book-1') }),
        createMockBook({ hash: testOpenReadBookRef('book-2') }),
      ];
      mockLibraryStoreState.library = books;
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.bulkSetReadingStatus(
          books.map((book) => book.hash),
          'unread',
        );
      });

      const calls = mockLibraryStoreState.updateBook.mock.calls as [unknown, Book][];
      calls.forEach(([, book]) => {
        expect(book.readingStatus).toBe('unread');
      });
    });

    it('skips books that are not found in library', async () => {
      const books = [createMockBook({ hash: testOpenReadBookRef('book-1') })];
      mockLibraryStoreState.library = books;
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.bulkSetReadingStatus(
          [books[0]!.hash, testOpenReadBookRef('missing-book')],
          'finished',
        );
      });

      // Only the existing book should be updated
      expect(mockLibraryStoreState.updateBook).toHaveBeenCalledTimes(1);
    });
  });

  describe('permanentlyDeleteBook', () => {
    it('durably enqueues the exact single-book tombstone before local persistence and hiding', async () => {
      const book = createMockBook({ hash: testOpenReadBookRef('book-delete-1') });
      const unrelated = createMockBook({ hash: testOpenReadBookRef('book-unrelated-1') });
      mockLibraryStoreState.library = [book, unrelated];
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.permanentlyDeleteBook(book);
      });

      expect(mockAppService.saveLibraryBooks).toHaveBeenCalledTimes(1);
      const [enqueuedBook] = vi.mocked(enqueueBooksForSync).mock.calls[0]![0];
      const committedLibrary = mockAppService.saveLibraryBooks.mock.calls[0]?.[0] as Book[];
      expect(enqueuedBook).toMatchObject({ hash: book.hash, downloadedAt: null });
      expect(enqueuedBook?.deletedAt).toEqual(expect.any(Number));
      expect(committedLibrary[1]).toBe(unrelated);
      expect(enqueueBooksForSync).toHaveBeenCalledWith([enqueuedBook], 'user-1');
      expect(mockLibraryStoreState.setLibrary).toHaveBeenCalledWith(committedLibrary);
      expect(vi.mocked(enqueueBooksForSync).mock.invocationCallOrder[0]).toBeLessThan(
        mockAppService.saveLibraryBooks.mock.invocationCallOrder[0],
      );
      expect(mockAppService.saveLibraryBooks.mock.invocationCallOrder[0]).toBeLessThan(
        mockLibraryStoreState.setLibrary.mock.invocationCallOrder[0],
      );
    });

    it('rebases a deferred single success onto current unrelated and target updates', async () => {
      const book = createMockBook({ hash: testOpenReadBookRef('book-deferred-success') });
      const unrelated = createMockBook({ hash: testOpenReadBookRef('unrelated-before') });
      const added = createMockBook({ hash: testOpenReadBookRef('added-during-delivery') });
      mockLibraryStoreState.library = [book, unrelated];
      const accepted = {
        status: 'accepted' as const,
        mutationIds: ['mutation-delete'],
        acceptedMutationIds: ['mutation-delete'],
        pendingMutationIds: [],
        failedMutationIds: [],
      };
      let resolveDelivery!: (result: typeof accepted) => void;
      vi.mocked(enqueueBooksForSync).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveDelivery = resolve;
        }),
      );
      const { result } = renderHook(() => useBookActions());

      const deletion = result.current.permanentlyDeleteBook(book);
      await vi.waitFor(() => expect(enqueueBooksForSync).toHaveBeenCalledTimes(1));
      const concurrentTarget = {
        ...book,
        title: 'Renamed during delivery',
        updatedAt: Date.now() + 1,
      };
      const concurrentUnrelated = { ...unrelated, readingStatus: 'finished' as const };
      mockLibraryStoreState.library = [concurrentTarget, concurrentUnrelated, added];
      resolveDelivery(accepted);
      await expect(deletion).resolves.toEqual(accepted);

      const committedLibrary = mockAppService.saveLibraryBooks.mock.calls[0]?.[0] as Book[];
      expect(committedLibrary).toHaveLength(3);
      expect(committedLibrary[0]).toMatchObject({
        hash: book.hash,
        title: 'Renamed during delivery',
        deletedAt: expect.any(Number),
      });
      expect(committedLibrary[1]).toBe(concurrentUnrelated);
      expect(committedLibrary[2]).toBe(added);
      expect(mockLibraryStoreState.setLibrary).toHaveBeenCalledWith(committedLibrary);
    });

    it('fails closed before single enqueue when the initiating owner is unavailable', async () => {
      const book = createMockBook({ hash: testOpenReadBookRef('single-owner-mismatch') });
      mockLibraryStoreState.libraryOwnerUserId = 'user-2';
      mockLibraryStoreState.library = [book];
      const { result } = renderHook(() => useBookActions());

      await expect(result.current.permanentlyDeleteBook(book)).rejects.toThrow();
      expect(enqueueBooksForSync).not.toHaveBeenCalled();
      expect(mockAppService.saveLibraryBooks).not.toHaveBeenCalled();
      expect(mockLibraryStoreState.setLibrary).not.toHaveBeenCalled();
    });

    it('fails closed when the library owner changes during single delivery', async () => {
      const book = createMockBook({ hash: testOpenReadBookRef('single-account-switch') });
      mockLibraryStoreState.library = [book];
      const accepted = {
        status: 'accepted' as const,
        mutationIds: ['mutation-delete'],
        acceptedMutationIds: ['mutation-delete'],
        pendingMutationIds: [],
        failedMutationIds: [],
      };
      let resolveDelivery!: (result: typeof accepted) => void;
      vi.mocked(enqueueBooksForSync).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveDelivery = resolve;
        }),
      );
      const { result } = renderHook(() => useBookActions());

      const deletion = result.current.permanentlyDeleteBook(book);
      await vi.waitFor(() => expect(enqueueBooksForSync).toHaveBeenCalledTimes(1));
      const accountBBook = createMockBook({ hash: book.hash, title: 'Account B copy' });
      mockLibraryStoreState.libraryOwnerUserId = 'user-2';
      mockLibraryStoreState.library = [accountBBook];
      resolveDelivery(accepted);

      await expect(deletion).rejects.toThrow();
      expect(enqueueBooksForSync).toHaveBeenCalledWith([expect.any(Object)], 'user-1');
      expect(mockAppService.saveLibraryBooks).not.toHaveBeenCalled();
      expect(mockLibraryStoreState.setLibrary).not.toHaveBeenCalled();
      expect(mockLibraryStoreState.library).toEqual([accountBBook]);
    });

    it('fails closed when the owner changes before the final single commit', async () => {
      const book = createMockBook({ hash: testOpenReadBookRef('single-switch-before-commit') });
      mockLibraryStoreState.library = [book];
      let releaseBoundary!: () => void;
      const boundary = runAccountLibraryMutation(
        () =>
          new Promise<void>((resolve) => {
            releaseBoundary = resolve;
          }),
      );
      await vi.waitFor(() => expect(releaseBoundary).toBeTypeOf('function'));
      const { result } = renderHook(() => useBookActions());

      const deletion = result.current.permanentlyDeleteBook(book);
      await vi.waitFor(() => expect(enqueueBooksForSync).toHaveBeenCalledTimes(1));
      mockLibraryStoreState.libraryOwnerUserId = 'user-2';
      mockLibraryStoreState.library = [
        createMockBook({ hash: book.hash, title: 'Account B copy' }),
      ];
      releaseBoundary();
      await boundary;

      await expect(deletion).rejects.toThrow();
      expect(mockAppService.saveLibraryBooks).not.toHaveBeenCalled();
      expect(mockLibraryStoreState.setLibrary).not.toHaveBeenCalled();
    });

    it('never writes a local tombstone when deferred single enqueue fails pre-durability', async () => {
      const book = createMockBook({ hash: testOpenReadBookRef('book-deferred-compensation') });
      const unrelated = createMockBook({ hash: testOpenReadBookRef('unrelated-compensation') });
      const added = createMockBook({ hash: testOpenReadBookRef('added-before-compensation') });
      mockLibraryStoreState.library = [book, unrelated];
      let rejectEnqueue!: (error: Error) => void;
      vi.mocked(enqueueBooksForSync).mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectEnqueue = reject;
        }),
      );
      const { result } = renderHook(() => useBookActions());

      const deletion = result.current.permanentlyDeleteBook(book);
      await vi.waitFor(() => expect(enqueueBooksForSync).toHaveBeenCalledTimes(1));
      const concurrentTarget = { ...book, title: 'Keep concurrent title' };
      const concurrentUnrelated = { ...unrelated, readingStatus: 'reading' as const };
      const currentLibrary = [concurrentTarget, concurrentUnrelated, added];
      mockLibraryStoreState.library = currentLibrary;
      rejectEnqueue(new Error('outbox unavailable'));

      await expect(deletion).rejects.toThrow(
        'Failed to queue book deletion. Your library was not changed.',
      );
      expect(mockAppService.saveLibraryBooks).not.toHaveBeenCalled();
      expect(mockLibraryStoreState.library).toBe(currentLibrary);
      expect(mockLibraryStoreState.setLibrary).not.toHaveBeenCalled();
    });

    it('keeps the durable outbox intent when local finalization fails', async () => {
      const book = createMockBook({ hash: testOpenReadBookRef('book-delete-rollback') });
      const previousLibrary = [book];
      mockLibraryStoreState.library = previousLibrary;
      mockAppService.saveLibraryBooks.mockRejectedValueOnce(new Error('indexeddb unavailable'));
      const { result } = renderHook(() => useBookActions());

      await expect(result.current.permanentlyDeleteBook(book)).rejects.toThrow(
        'Deletion was queued, but the local library could not be updated.',
      );

      expect(mockLibraryStoreState.setLibrary).not.toHaveBeenCalled();
      expect(enqueueBooksForSync).toHaveBeenCalledWith([expect.any(Object)], 'user-1');
    });

    it('leaves durable and visible state untouched when sync enqueue fails', async () => {
      const book = createMockBook({ hash: testOpenReadBookRef('book-enqueue-rollback') });
      const unrelated = createMockBook({ hash: testOpenReadBookRef('unrelated-book') });
      const previousLibrary = [book, unrelated];
      mockLibraryStoreState.library = previousLibrary;
      vi.mocked(enqueueBooksForSync).mockRejectedValueOnce(new Error('outbox unavailable'));
      const { result } = renderHook(() => useBookActions());

      await expect(result.current.permanentlyDeleteBook(book)).rejects.toThrow(
        'Failed to queue book deletion. Your library was not changed.',
      );

      expect(mockAppService.saveLibraryBooks).not.toHaveBeenCalled();
      expect(mockLibraryStoreState.library).toBe(previousLibrary);
      expect(mockLibraryStoreState.setLibrary).not.toHaveBeenCalled();
    });

    it('commits and hides a durable terminal failed deletion intent', async () => {
      const book = createMockBook({ hash: testOpenReadBookRef('book-delivery-fails') });
      mockLibraryStoreState.library = [book];
      const failedDelivery = {
        status: 'failed' as const,
        mutationIds: ['mutation-delete'],
        acceptedMutationIds: [],
        pendingMutationIds: [],
        failedMutationIds: ['mutation-delete'],
      };
      vi.mocked(enqueueBooksForSync).mockResolvedValueOnce(failedDelivery);
      const { result } = renderHook(() => useBookActions());

      await expect(result.current.permanentlyDeleteBook(book)).resolves.toEqual(failedDelivery);

      const committedLibrary = mockAppService.saveLibraryBooks.mock.calls[0]?.[0] as Book[];
      expect(mockAppService.saveLibraryBooks).toHaveBeenCalledTimes(1);
      expect(committedLibrary[0]?.deletedAt).toEqual(expect.any(Number));
      expect(mockLibraryStoreState.setLibrary).toHaveBeenCalledWith(committedLibrary);
    });

    it('fails closed on unknown delivery identity without visible mutation or cleanup', async () => {
      const book = createMockBook({ hash: testOpenReadBookRef('book-identity-changed') });
      mockLibraryStoreState.library = [book];
      vi.mocked(enqueueBooksForSync).mockRejectedValueOnce(
        new SyncMutationDeliveryError([], ['mutation-delete']),
      );
      const { result } = renderHook(() => useBookActions());

      await expect(result.current.permanentlyDeleteBook(book)).rejects.toBeInstanceOf(
        SyncMutationDeliveryError,
      );

      expect(mockAppService.saveLibraryBooks).not.toHaveBeenCalled();
      expect(mockLibraryStoreState.setLibrary).not.toHaveBeenCalled();
    });

    it('does not eagerly delete hash-addressed bytes or cloud assets', async () => {
      const book = createMockBook({ hash: testOpenReadBookRef('book-shared-bytes') });
      mockLibraryStoreState.library = [book];
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.permanentlyDeleteBook(book);
      });

      expect(mockAppService.deleteDir).not.toHaveBeenCalled();
      expect(mockLibraryStoreState.setLibrary).toHaveBeenCalled();
    });
  });

  describe('bulkRemove', () => {
    it('clears selection and exits select mode', async () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('book-1') }),
        createMockBook({ hash: testOpenReadBookRef('book-2') }),
      ];
      mockLibraryStoreState.library = books;
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.bulkRemove(books.map((book) => book.hash));
      });

      expect(mockLibraryViewStoreState.clearSelection).toHaveBeenCalled();
      expect(mockLibraryViewStoreState.setSelectMode).toHaveBeenCalledWith(false);
    });

    it('durably enqueues exact selected tombstones before local persistence and hiding', async () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('bulk-book-1') }),
        createMockBook({ hash: testOpenReadBookRef('bulk-book-2') }),
      ];
      const unrelated = createMockBook({ hash: testOpenReadBookRef('bulk-unrelated-success') });
      mockLibraryStoreState.library = [...books, unrelated];
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.bulkRemove(books.map((book) => book.hash));
      });

      const deletedBooks = vi.mocked(enqueueBooksForSync).mock.calls[0]![0];
      const committedLibrary = mockAppService.saveLibraryBooks.mock.calls[0]?.[0] as Book[];
      expect(committedLibrary).toHaveLength(3);
      expect(deletedBooks.every((book) => Boolean(book.deletedAt))).toBe(true);
      expect(committedLibrary.find((book) => book.hash === unrelated.hash)).toBe(unrelated);
      expect(enqueueBooksForSync).toHaveBeenCalledWith(deletedBooks, 'user-1');
      expect(mockLibraryStoreState.setLibrary).toHaveBeenCalledWith(committedLibrary);
      expect(vi.mocked(enqueueBooksForSync).mock.invocationCallOrder[0]).toBeLessThan(
        mockAppService.saveLibraryBooks.mock.invocationCallOrder[0],
      );
      expect(mockAppService.saveLibraryBooks.mock.invocationCallOrder[0]).toBeLessThan(
        mockLibraryStoreState.setLibrary.mock.invocationCallOrder[0],
      );
    });

    it('rebases deferred bulk success without deleting concurrent unrelated changes', async () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('bulk-deferred-1') }),
        createMockBook({ hash: testOpenReadBookRef('bulk-deferred-2') }),
      ];
      const unrelated = createMockBook({ hash: testOpenReadBookRef('bulk-deferred-unrelated') });
      const added = createMockBook({ hash: testOpenReadBookRef('bulk-added-during-delivery') });
      mockLibraryStoreState.library = [...books, unrelated];
      const accepted = {
        status: 'accepted' as const,
        mutationIds: ['mutation-1', 'mutation-2'],
        acceptedMutationIds: ['mutation-1', 'mutation-2'],
        pendingMutationIds: [],
        failedMutationIds: [],
      };
      let resolveDelivery!: (result: typeof accepted) => void;
      vi.mocked(enqueueBooksForSync).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveDelivery = resolve;
        }),
      );
      const { result } = renderHook(() => useBookActions());

      const deletion = result.current.bulkRemove(books.map((book) => book.hash));
      await vi.waitFor(() => expect(enqueueBooksForSync).toHaveBeenCalledTimes(1));
      const updatedSelected = { ...books[0]!, title: 'Selected renamed concurrently' };
      const concurrentUnrelated = { ...unrelated, readingStatus: 'finished' as const };
      mockLibraryStoreState.library = [updatedSelected, books[1]!, concurrentUnrelated, added];
      resolveDelivery(accepted);
      await expect(deletion).resolves.toEqual(accepted);

      const committedLibrary = mockAppService.saveLibraryBooks.mock.calls[0]?.[0] as Book[];
      expect(committedLibrary).toHaveLength(4);
      expect(committedLibrary[0]).toMatchObject({
        title: 'Selected renamed concurrently',
        deletedAt: expect.any(Number),
      });
      expect(committedLibrary[1]?.deletedAt).toEqual(expect.any(Number));
      expect(committedLibrary[2]).toBe(concurrentUnrelated);
      expect(committedLibrary[3]).toBe(added);
      expect(mockLibraryStoreState.setLibrary).toHaveBeenCalledWith(committedLibrary);
    });

    it('fails closed before bulk enqueue when the initiating owner is unavailable', async () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('bulk-owner-mismatch-1') }),
        createMockBook({ hash: testOpenReadBookRef('bulk-owner-mismatch-2') }),
      ];
      mockLibraryStoreState.libraryOwnerUserId = 'user-2';
      mockLibraryStoreState.library = books;
      const { result } = renderHook(() => useBookActions());

      await expect(result.current.bulkRemove(books.map((book) => book.hash))).rejects.toThrow();
      expect(enqueueBooksForSync).not.toHaveBeenCalled();
      expect(mockAppService.saveLibraryBooks).not.toHaveBeenCalled();
      expect(mockLibraryStoreState.setLibrary).not.toHaveBeenCalled();
    });

    it('fails closed when the library owner changes during bulk delivery', async () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('bulk-account-switch-1') }),
        createMockBook({ hash: testOpenReadBookRef('bulk-account-switch-2') }),
      ];
      mockLibraryStoreState.library = books;
      const accepted = {
        status: 'accepted' as const,
        mutationIds: ['mutation-1', 'mutation-2'],
        acceptedMutationIds: ['mutation-1', 'mutation-2'],
        pendingMutationIds: [],
        failedMutationIds: [],
      };
      let resolveDelivery!: (result: typeof accepted) => void;
      vi.mocked(enqueueBooksForSync).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveDelivery = resolve;
        }),
      );
      const { result } = renderHook(() => useBookActions());

      const deletion = result.current.bulkRemove(books.map((book) => book.hash));
      await vi.waitFor(() => expect(enqueueBooksForSync).toHaveBeenCalledTimes(1));
      const accountBBook = createMockBook({ hash: books[0]!.hash, title: 'Account B bulk copy' });
      mockLibraryStoreState.libraryOwnerUserId = 'user-2';
      mockLibraryStoreState.library = [accountBBook];
      resolveDelivery(accepted);

      await expect(deletion).rejects.toThrow();
      expect(enqueueBooksForSync).toHaveBeenCalledWith(expect.any(Array), 'user-1');
      expect(mockAppService.saveLibraryBooks).not.toHaveBeenCalled();
      expect(mockLibraryStoreState.setLibrary).not.toHaveBeenCalled();
      expect(mockLibraryStoreState.library).toEqual([accountBBook]);
      expect(mockLibraryViewStoreState.clearSelection).not.toHaveBeenCalled();
    });

    it('fails closed when the owner changes before the final bulk commit', async () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('bulk-switch-before-commit-1') }),
        createMockBook({ hash: testOpenReadBookRef('bulk-switch-before-commit-2') }),
      ];
      mockLibraryStoreState.library = books;
      let releaseBoundary!: () => void;
      const boundary = runAccountLibraryMutation(
        () =>
          new Promise<void>((resolve) => {
            releaseBoundary = resolve;
          }),
      );
      await vi.waitFor(() => expect(releaseBoundary).toBeTypeOf('function'));
      const { result } = renderHook(() => useBookActions());

      const deletion = result.current.bulkRemove(books.map((book) => book.hash));
      await vi.waitFor(() => expect(enqueueBooksForSync).toHaveBeenCalledTimes(1));
      mockLibraryStoreState.libraryOwnerUserId = 'user-2';
      mockLibraryStoreState.library = [
        createMockBook({ hash: books[0]!.hash, title: 'Account B bulk copy' }),
      ];
      releaseBoundary();
      await boundary;

      await expect(deletion).rejects.toThrow();
      expect(mockAppService.saveLibraryBooks).not.toHaveBeenCalled();
      expect(mockLibraryStoreState.setLibrary).not.toHaveBeenCalled();
      expect(mockLibraryViewStoreState.clearSelection).not.toHaveBeenCalled();
    });

    it('never writes local tombstones when deferred bulk enqueue fails pre-durability', async () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('bulk-compensation-1') }),
        createMockBook({ hash: testOpenReadBookRef('bulk-compensation-2') }),
      ];
      const unrelated = createMockBook({
        hash: testOpenReadBookRef('bulk-compensation-unrelated'),
      });
      const added = createMockBook({ hash: testOpenReadBookRef('bulk-compensation-added') });
      mockLibraryStoreState.library = [...books, unrelated];
      let rejectEnqueue!: (error: Error) => void;
      vi.mocked(enqueueBooksForSync).mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectEnqueue = reject;
        }),
      );
      const { result } = renderHook(() => useBookActions());

      const deletion = result.current.bulkRemove(books.map((book) => book.hash));
      await vi.waitFor(() => expect(enqueueBooksForSync).toHaveBeenCalledTimes(1));
      const concurrentSelected = { ...books[0]!, title: 'Keep selected concurrent update' };
      const concurrentUnrelated = { ...unrelated, readingStatus: 'reading' as const };
      const currentLibrary = [concurrentSelected, books[1]!, concurrentUnrelated, added];
      mockLibraryStoreState.library = currentLibrary;
      rejectEnqueue(new Error('outbox unavailable'));

      await expect(deletion).rejects.toThrow(
        'Failed to queue book deletions. Your library was not changed.',
      );
      expect(mockAppService.saveLibraryBooks).not.toHaveBeenCalled();
      expect(mockLibraryStoreState.library).toBe(currentLibrary);
      expect(mockLibraryStoreState.setLibrary).not.toHaveBeenCalled();
      expect(mockLibraryViewStoreState.clearSelection).not.toHaveBeenCalled();
    });

    it('commits only selected tombstones when bulk delivery is durably failed', async () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('bulk-failed-1') }),
        createMockBook({ hash: testOpenReadBookRef('bulk-failed-2') }),
      ];
      const unrelated = createMockBook({ hash: testOpenReadBookRef('bulk-failed-unrelated') });
      mockLibraryStoreState.library = [...books, unrelated];
      const failedDelivery = {
        status: 'failed' as const,
        mutationIds: ['mutation-1', 'mutation-2'],
        acceptedMutationIds: [],
        pendingMutationIds: [],
        failedMutationIds: ['mutation-1', 'mutation-2'],
      };
      vi.mocked(enqueueBooksForSync).mockResolvedValueOnce(failedDelivery);
      const { result } = renderHook(() => useBookActions());

      await expect(result.current.bulkRemove(books.map((book) => book.hash))).resolves.toEqual(
        failedDelivery,
      );

      const committedLibrary = mockAppService.saveLibraryBooks.mock.calls[0]?.[0] as Book[];
      expect(committedLibrary.filter((book) => book.deletedAt)).toHaveLength(2);
      expect(committedLibrary.find((book) => book.hash === unrelated.hash)).toBe(unrelated);
      expect(mockLibraryStoreState.setLibrary).toHaveBeenCalledWith(committedLibrary);
      expect(mockLibraryViewStoreState.clearSelection).toHaveBeenCalled();
      expect(mockLibraryViewStoreState.setSelectMode).toHaveBeenCalledWith(false);
    });

    it('keeps durable bulk outbox intent when local finalization fails', async () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('bulk-rollback-1') }),
        createMockBook({ hash: testOpenReadBookRef('bulk-rollback-2') }),
      ];
      const previousLibrary = books;
      mockLibraryStoreState.library = previousLibrary;
      mockAppService.saveLibraryBooks.mockRejectedValueOnce(new Error('quota exceeded locally'));
      const { result } = renderHook(() => useBookActions());

      await expect(result.current.bulkRemove(books.map((book) => book.hash))).rejects.toThrow(
        'Deletions were queued, but the local library could not be updated.',
      );

      expect(mockLibraryStoreState.setLibrary).not.toHaveBeenCalled();
      expect(enqueueBooksForSync).toHaveBeenCalledWith(expect.any(Array), 'user-1');
      expect(mockLibraryViewStoreState.clearSelection).not.toHaveBeenCalled();
      expect(mockLibraryViewStoreState.setSelectMode).not.toHaveBeenCalled();
    });

    it('leaves every book untouched and keeps selection when bulk enqueue fails', async () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('bulk-enqueue-rollback-1') }),
        createMockBook({ hash: testOpenReadBookRef('bulk-enqueue-rollback-2') }),
      ];
      const unrelated = createMockBook({ hash: testOpenReadBookRef('bulk-unrelated') });
      const previousLibrary = [...books, unrelated];
      mockLibraryStoreState.library = previousLibrary;
      vi.mocked(enqueueBooksForSync).mockRejectedValueOnce(new Error('outbox unavailable'));
      const { result } = renderHook(() => useBookActions());

      await expect(result.current.bulkRemove(books.map((book) => book.hash))).rejects.toThrow(
        'Failed to queue book deletions. Your library was not changed.',
      );

      expect(mockAppService.saveLibraryBooks).not.toHaveBeenCalled();
      expect(mockLibraryStoreState.library).toBe(previousLibrary);
      expect(mockLibraryStoreState.setLibrary).not.toHaveBeenCalled();
      expect(mockLibraryViewStoreState.clearSelection).not.toHaveBeenCalled();
      expect(mockLibraryViewStoreState.setSelectMode).not.toHaveBeenCalled();
    });

    it('skips books that are not found in library', async () => {
      const books = [createMockBook({ hash: testOpenReadBookRef('book-1') })];
      mockLibraryStoreState.library = books;
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.bulkRemove([books[0]!.hash, testOpenReadBookRef('missing-book')]);
      });

      // Only one book should be processed
      expect(mockLibraryViewStoreState.clearSelection).toHaveBeenCalled();
    });

    it('does nothing for empty books', async () => {
      mockLibraryStoreState.library = [];
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.bulkRemove([testOpenReadBookRef('missing-book')]);
      });

      expect(mockLibraryViewStoreState.clearSelection).not.toHaveBeenCalled();
    });
  });

  describe('bulkAddToCollection', () => {
    it('adds multiple books to collection and exits select mode', async () => {
      const { result } = renderHook(() => useBookActions());

      act(() => {
        result.current.bulkAddToCollection(
          [testOpenReadBookRef('book-1'), testOpenReadBookRef('book-2')],
          'collection-123',
        );
      });

      expect(mockPlatformSidebarStoreState.addBookToCollection).toHaveBeenCalledTimes(2);
      expect(mockPlatformSidebarStoreState.addBookToCollection).toHaveBeenCalledWith(
        'collection-123',
        testOpenReadBookRef('book-1'),
      );
      expect(mockPlatformSidebarStoreState.addBookToCollection).toHaveBeenCalledWith(
        'collection-123',
        testOpenReadBookRef('book-2'),
      );
      expect(mockLibraryViewStoreState.clearSelection).toHaveBeenCalled();
      expect(mockLibraryViewStoreState.setSelectMode).toHaveBeenCalledWith(false);
    });

    it('handles empty hashes array', () => {
      const { result } = renderHook(() => useBookActions());

      act(() => {
        result.current.bulkAddToCollection([], 'collection-123');
      });

      expect(mockPlatformSidebarStoreState.addBookToCollection).not.toHaveBeenCalled();
      expect(mockLibraryViewStoreState.clearSelection).toHaveBeenCalled();
      expect(mockLibraryViewStoreState.setSelectMode).toHaveBeenCalledWith(false);
    });

    it('adds single book to collection', () => {
      const { result } = renderHook(() => useBookActions());

      act(() => {
        result.current.bulkAddToCollection([testOpenReadBookRef('book-1')], 'collection-456');
      });

      expect(mockPlatformSidebarStoreState.addBookToCollection).toHaveBeenCalledTimes(1);
      expect(mockPlatformSidebarStoreState.addBookToCollection).toHaveBeenCalledWith(
        'collection-456',
        testOpenReadBookRef('book-1'),
      );
    });
  });

  describe('hook return value', () => {
    it('returns all expected actions', () => {
      const { result } = renderHook(() => useBookActions());

      expect(result.current).toHaveProperty('setReadingStatus');
      expect(result.current).toHaveProperty('renameBook');
      expect(result.current).toHaveProperty('permanentlyDeleteBook');
      expect(result.current).toHaveProperty('bulkSetReadingStatus');
      expect(result.current).toHaveProperty('bulkRemove');
      expect(result.current).toHaveProperty('bulkAddToCollection');

      expect(typeof result.current.setReadingStatus).toBe('function');
      expect(typeof result.current.renameBook).toBe('function');
      expect(typeof result.current.permanentlyDeleteBook).toBe('function');
      expect(typeof result.current.bulkSetReadingStatus).toBe('function');
      expect(typeof result.current.bulkRemove).toBe('function');
      expect(typeof result.current.bulkAddToCollection).toBe('function');
    });
  });
});
