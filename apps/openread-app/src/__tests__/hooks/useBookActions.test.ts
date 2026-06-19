import { testOpenReadBookRef } from '../utils/bookIdentityFixtures';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBookActions } from '@/hooks/useBookActions';
import { enqueueBookForSync, enqueueBooksForSync } from '@/services/sync/helpers';
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
    deleteBook: vi.fn().mockResolvedValue(undefined),
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
    mockLibraryStoreState.updateBook = vi.fn().mockResolvedValue(undefined);
    mockLibraryStoreState.setLibrary = vi.fn();
    mockPlatformSidebarStoreState.addBookToCollection = vi.fn();
    mockPlatformSidebarStoreState.collections = [];
    mockPlatformSidebarStoreState.removeBookFromCollection = vi.fn();
    mockLibraryViewStoreState.clearSelection = vi.fn();
    mockLibraryViewStoreState.setSelectMode = vi.fn();
    mockAppService.deleteBook = vi.fn().mockResolvedValue(undefined);
    mockAppService.deleteDir = vi.fn().mockResolvedValue(undefined);
    mockAppService.saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
    vi.mocked(enqueueBookForSync).mockResolvedValue(undefined);
    vi.mocked(enqueueBooksForSync).mockResolvedValue(undefined);
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
    it('saves the tombstoned library before hiding and enqueueing sync', async () => {
      const book = createMockBook({ hash: testOpenReadBookRef('book-delete-1') });
      mockLibraryStoreState.library = [book];
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.permanentlyDeleteBook(book);
      });

      expect(mockAppService.saveLibraryBooks).toHaveBeenCalledTimes(1);
      const savedLibrary = mockAppService.saveLibraryBooks.mock.calls[0]?.[0] as Book[];
      expect(savedLibrary[0]).toMatchObject({ hash: book.hash, downloadedAt: null });
      expect(savedLibrary[0]?.deletedAt).toEqual(expect.any(Number));
      expect(mockLibraryStoreState.setLibrary).toHaveBeenCalledWith(savedLibrary);
      expect(enqueueBookForSync).toHaveBeenCalledWith(savedLibrary[0]);
      expect(mockAppService.saveLibraryBooks.mock.invocationCallOrder[0]).toBeLessThan(
        mockLibraryStoreState.setLibrary.mock.invocationCallOrder[0],
      );
      expect(mockAppService.saveLibraryBooks.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(enqueueBookForSync).mock.invocationCallOrder[0],
      );
    });

    it('rolls back and does not enqueue sync when durable save fails', async () => {
      const book = createMockBook({ hash: testOpenReadBookRef('book-delete-rollback') });
      const previousLibrary = [book];
      mockLibraryStoreState.library = previousLibrary;
      mockAppService.saveLibraryBooks.mockRejectedValueOnce(new Error('indexeddb unavailable'));
      const { result } = renderHook(() => useBookActions());

      await expect(result.current.permanentlyDeleteBook(book)).rejects.toThrow(
        'Failed to delete book locally. Your library was not changed.',
      );

      expect(mockLibraryStoreState.setLibrary).toHaveBeenCalledTimes(1);
      expect(mockLibraryStoreState.setLibrary).toHaveBeenCalledWith(previousLibrary);
      expect(enqueueBookForSync).not.toHaveBeenCalled();
      expect(mockAppService.deleteBook).not.toHaveBeenCalled();
    });

    it('does not fail the foreground delete when background cleanup fails', async () => {
      const book = createMockBook({ hash: testOpenReadBookRef('book-cleanup-fails') });
      mockLibraryStoreState.library = [book];
      mockAppService.deleteBook.mockRejectedValueOnce(new Error('local file already gone'));
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.permanentlyDeleteBook(book);
      });

      expect(mockDispatch).not.toHaveBeenCalledWith(
        'toast',
        expect.objectContaining({ message: 'Failed to delete book' }),
      );
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

    it('saves tombstones before hiding and enqueueing bulk sync', async () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('bulk-book-1') }),
        createMockBook({ hash: testOpenReadBookRef('bulk-book-2') }),
      ];
      mockLibraryStoreState.library = books;
      const { result } = renderHook(() => useBookActions());

      await act(async () => {
        await result.current.bulkRemove(books.map((book) => book.hash));
      });

      const savedLibrary = mockAppService.saveLibraryBooks.mock.calls[0]?.[0] as Book[];
      expect(savedLibrary).toHaveLength(2);
      expect(savedLibrary.every((book) => Boolean(book.deletedAt))).toBe(true);
      expect(mockLibraryStoreState.setLibrary).toHaveBeenCalledWith(savedLibrary);
      expect(enqueueBooksForSync).toHaveBeenCalledWith(savedLibrary);
      expect(mockAppService.saveLibraryBooks.mock.invocationCallOrder[0]).toBeLessThan(
        mockLibraryStoreState.setLibrary.mock.invocationCallOrder[0],
      );
      expect(mockAppService.saveLibraryBooks.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(enqueueBooksForSync).mock.invocationCallOrder[0],
      );
    });

    it('rolls back and keeps selection when bulk durable save fails', async () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('bulk-rollback-1') }),
        createMockBook({ hash: testOpenReadBookRef('bulk-rollback-2') }),
      ];
      const previousLibrary = books;
      mockLibraryStoreState.library = previousLibrary;
      mockAppService.saveLibraryBooks.mockRejectedValueOnce(new Error('quota exceeded locally'));
      const { result } = renderHook(() => useBookActions());

      await expect(result.current.bulkRemove(books.map((book) => book.hash))).rejects.toThrow(
        'Failed to delete books locally. Your library was not changed.',
      );

      expect(mockLibraryStoreState.setLibrary).toHaveBeenCalledTimes(1);
      expect(mockLibraryStoreState.setLibrary).toHaveBeenCalledWith(previousLibrary);
      expect(enqueueBooksForSync).not.toHaveBeenCalled();
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
