import { testOpenReadBookRef } from '../utils/bookIdentityFixtures';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLibraryBooks, getBookProgressPercentage } from '@/hooks/useLibraryBooks';
import type { Book } from '@/types/book';

// Create a mock store state
const mockStoreState = {
  library: [] as Book[],
  libraryLoaded: true,
  libraryOwnerUserId: 'user-1' as string | null,
  isReconciling: false,
  syncError: null as string | null,
};
const authMock = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: authMock.user }),
}));

// Mock the libraryStore
vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: (selector: (state: typeof mockStoreState) => unknown) =>
    selector(mockStoreState),
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

describe('useLibraryBooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState.library = [];
    mockStoreState.libraryLoaded = true;
    mockStoreState.libraryOwnerUserId = 'user-1';
    mockStoreState.isReconciling = false;
    mockStoreState.syncError = null;
    authMock.user = { id: 'user-1' };
  });

  describe('Basic functionality', () => {
    it('should return empty array when no books', () => {
      mockStoreState.library = [];
      const { result } = renderHook(() => useLibraryBooks());
      expect(result.current.books).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });

    it('should return account-scoped projected books when library source is still loading', () => {
      mockStoreState.library = [createMockBook({ hash: testOpenReadBookRef('projected-book') })];
      mockStoreState.libraryLoaded = false;
      const { result } = renderHook(() => useLibraryBooks());
      expect(result.current.isLoading).toBe(false);
      expect(result.current.books.map((book) => book.hash)).toEqual([
        testOpenReadBookRef('projected-book'),
      ]);
    });

    it('should return isLoading true and withhold books when the loaded library belongs to another account', () => {
      mockStoreState.library = [createMockBook({ hash: testOpenReadBookRef('stale-book') })];
      mockStoreState.libraryLoaded = true;
      mockStoreState.libraryOwnerUserId = 'user-previous';
      mockStoreState.isReconciling = true;
      const { result } = renderHook(() => useLibraryBooks());
      expect(result.current.isLoading).toBe(true);
      expect(result.current.books).toEqual([]);
    });

    it('should return account-scoped cached books while background reconcile is in progress', () => {
      mockStoreState.library = [createMockBook({ hash: testOpenReadBookRef('cached-book') })];
      mockStoreState.libraryLoaded = true;
      mockStoreState.libraryOwnerUserId = 'user-1';
      mockStoreState.isReconciling = true;
      const { result } = renderHook(() => useLibraryBooks());
      expect(result.current.isLoading).toBe(false);
      expect(result.current.books.map((book) => book.hash)).toEqual([
        testOpenReadBookRef('cached-book'),
      ]);
    });

    it('should keep a fresh authenticated empty library loading while first reconcile is pending', () => {
      mockStoreState.library = [];
      mockStoreState.libraryLoaded = true;
      mockStoreState.libraryOwnerUserId = 'user-1';
      mockStoreState.isReconciling = true;
      const { result } = renderHook(() => useLibraryBooks());
      expect(result.current.isLoading).toBe(true);
      expect(result.current.books).toEqual([]);
    });

    it('should keep a failed first authenticated pull out of the false-empty state', () => {
      mockStoreState.library = [];
      mockStoreState.libraryLoaded = true;
      mockStoreState.libraryOwnerUserId = 'user-1';
      mockStoreState.syncError = 'network timeout';
      const { result } = renderHook(() => useLibraryBooks());
      expect(result.current.isLoading).toBe(true);
      expect(result.current.books).toEqual([]);
    });

    it('should return all visible books by default', () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('book-1') }),
        createMockBook({ hash: testOpenReadBookRef('book-2') }),
      ];
      mockStoreState.library = books;
      const { result } = renderHook(() => useLibraryBooks());
      expect(result.current.books).toHaveLength(2);
    });

    it('should return all books in library', () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('book-1') }),
        createMockBook({ hash: testOpenReadBookRef('book-2') }),
        createMockBook({ hash: testOpenReadBookRef('book-3') }),
      ];
      mockStoreState.library = books;
      const { result } = renderHook(() => useLibraryBooks());
      expect(result.current.books).toHaveLength(3);
    });

    it('should hide locally tombstoned deleted books from user-facing library queries', () => {
      mockStoreState.library = [
        createMockBook({ hash: testOpenReadBookRef('active-book'), createdAt: 2000 }),
        createMockBook({
          hash: testOpenReadBookRef('deleted-book'),
          deletedAt: 1000,
          createdAt: 3000,
        }),
      ];

      const { result } = renderHook(() => useLibraryBooks());

      expect(result.current.books.map((book) => book.hash)).toEqual([
        testOpenReadBookRef('active-book'),
      ]);
    });
  });

  describe('Reading filter', () => {
    it('should filter books with progress > 0 and < 100', () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('reading'), progress: [50, 100] }),
        createMockBook({ hash: testOpenReadBookRef('not-started'), progress: [0, 100] }),
        createMockBook({ hash: testOpenReadBookRef('finished'), progress: [100, 100] }),
        createMockBook({ hash: testOpenReadBookRef('no-progress') }),
      ];
      mockStoreState.library = books;
      const { result } = renderHook(() => useLibraryBooks({ filter: 'reading' }));
      expect(result.current.books).toHaveLength(1);
      expect(result.current.books[0]?.hash).toBe(testOpenReadBookRef('reading'));
    });

    it('should include books with readingStatus reading', () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('reading-status'), readingStatus: 'reading' }),
        createMockBook({ hash: testOpenReadBookRef('unread-status'), readingStatus: 'unread' }),
      ];
      mockStoreState.library = books;
      const { result } = renderHook(() => useLibraryBooks({ filter: 'reading' }));
      expect(result.current.books).toHaveLength(1);
      expect(result.current.books[0]?.hash).toBe(testOpenReadBookRef('reading-status'));
    });
  });

  describe('Recent filter', () => {
    it('should sort by createdAt descending', () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('old'), createdAt: 1000 }),
        createMockBook({ hash: testOpenReadBookRef('new'), createdAt: 3000 }),
        createMockBook({ hash: testOpenReadBookRef('mid'), createdAt: 2000 }),
      ];
      mockStoreState.library = books;
      const { result } = renderHook(() => useLibraryBooks({ filter: 'recent' }));
      expect(result.current.books[0]?.hash).toBe(testOpenReadBookRef('new'));
      expect(result.current.books[1]?.hash).toBe(testOpenReadBookRef('mid'));
      expect(result.current.books[2]?.hash).toBe(testOpenReadBookRef('old'));
    });

    it('should exclude requested hashes after sorting and before limiting', () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('old'), createdAt: 1000 }),
        createMockBook({ hash: testOpenReadBookRef('new'), createdAt: 3000 }),
        createMockBook({ hash: testOpenReadBookRef('mid'), createdAt: 2000 }),
      ];
      mockStoreState.library = books;

      const { result } = renderHook(() =>
        useLibraryBooks({
          filter: 'recent',
          limit: 2,
          excludeHashes: new Set([testOpenReadBookRef('new')]),
        }),
      );

      expect(result.current.books.map((book) => book.hash)).toEqual([
        testOpenReadBookRef('mid'),
        testOpenReadBookRef('old'),
      ]);
    });
  });

  describe('Want to read filter', () => {
    it('should filter books with readingStatus unread', () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('unread'), readingStatus: 'unread' }),
        createMockBook({ hash: testOpenReadBookRef('reading'), readingStatus: 'reading' }),
        createMockBook({ hash: testOpenReadBookRef('finished'), readingStatus: 'finished' }),
      ];
      mockStoreState.library = books;
      const { result } = renderHook(() => useLibraryBooks({ filter: 'want-to-read' }));
      expect(result.current.books).toHaveLength(1);
      expect(result.current.books[0]?.hash).toBe(testOpenReadBookRef('unread'));
    });

    it('should include books with no progress and no status', () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('no-progress') }),
        createMockBook({ hash: testOpenReadBookRef('with-progress'), progress: [10, 100] }),
      ];
      mockStoreState.library = books;
      const { result } = renderHook(() => useLibraryBooks({ filter: 'want-to-read' }));
      expect(result.current.books).toHaveLength(1);
      expect(result.current.books[0]?.hash).toBe(testOpenReadBookRef('no-progress'));
    });
  });

  describe('Finished filter', () => {
    it('should filter books with progress 100%', () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('finished'), progress: [100, 100] }),
        createMockBook({ hash: testOpenReadBookRef('not-finished'), progress: [50, 100] }),
      ];
      mockStoreState.library = books;
      const { result } = renderHook(() => useLibraryBooks({ filter: 'finished' }));
      expect(result.current.books).toHaveLength(1);
      expect(result.current.books[0]?.hash).toBe(testOpenReadBookRef('finished'));
    });

    it('should include books with readingStatus finished', () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('finished-status'), readingStatus: 'finished' }),
        createMockBook({ hash: testOpenReadBookRef('reading-status'), readingStatus: 'reading' }),
      ];
      mockStoreState.library = books;
      const { result } = renderHook(() => useLibraryBooks({ filter: 'finished' }));
      expect(result.current.books).toHaveLength(1);
      expect(result.current.books[0]?.hash).toBe(testOpenReadBookRef('finished-status'));
    });
  });

  describe('Format filters', () => {
    it('should filter EPUB and Kindle format books', () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('epub'), format: 'epub' }),
        createMockBook({ hash: testOpenReadBookRef('pdf'), format: 'pdf' }),
        createMockBook({ hash: testOpenReadBookRef('mobi'), format: 'mobi' }),
        createMockBook({ hash: testOpenReadBookRef('azw'), format: 'azw' }),
        createMockBook({ hash: testOpenReadBookRef('azw3'), format: 'azw3' }),
      ];
      mockStoreState.library = books;
      const { result } = renderHook(() => useLibraryBooks({ filter: 'books' }));
      expect(result.current.books).toHaveLength(4);
      expect(result.current.books.map((b) => b.hash)).toContain(testOpenReadBookRef('epub'));
      expect(result.current.books.map((b) => b.hash)).toContain(testOpenReadBookRef('mobi'));
      expect(result.current.books.map((b) => b.hash)).toContain(testOpenReadBookRef('azw'));
      expect(result.current.books.map((b) => b.hash)).toContain(testOpenReadBookRef('azw3'));
    });

    it('should filter PDF books', () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('epub'), format: 'epub' }),
        createMockBook({ hash: testOpenReadBookRef('pdf'), format: 'pdf' }),
      ];
      mockStoreState.library = books;
      const { result } = renderHook(() => useLibraryBooks({ filter: 'pdfs' }));
      expect(result.current.books).toHaveLength(1);
      expect(result.current.books[0]?.hash).toBe(testOpenReadBookRef('pdf'));
    });
  });

  describe('Limit', () => {
    it('should limit results when limit is specified', () => {
      const books = Array.from({ length: 10 }, (_, i) =>
        createMockBook({ hash: testOpenReadBookRef(`book-${i}`), createdAt: i * 1000 }),
      );
      mockStoreState.library = books;
      const { result } = renderHook(() => useLibraryBooks({ limit: 5 }));
      expect(result.current.books).toHaveLength(5);
    });

    it('should return all books when limit is greater than count', () => {
      const books = [
        createMockBook({ hash: testOpenReadBookRef('book-1') }),
        createMockBook({ hash: testOpenReadBookRef('book-2') }),
      ];
      mockStoreState.library = books;
      const { result } = renderHook(() => useLibraryBooks({ limit: 10 }));
      expect(result.current.books).toHaveLength(2);
    });
  });
});

describe('getBookProgressPercentage', () => {
  it('should calculate correct percentage', () => {
    const book = createMockBook({ progress: [50, 100] });
    expect(getBookProgressPercentage(book)).toBe(50);
  });

  it('should return 0 when no progress', () => {
    const book = createMockBook({ progress: undefined });
    expect(getBookProgressPercentage(book)).toBe(0);
  });

  it('should return 0 when total is 0', () => {
    const book = createMockBook({ progress: [0, 0] });
    expect(getBookProgressPercentage(book)).toBe(0);
  });

  it('should calculate fractional progress', () => {
    const book = createMockBook({ progress: [33, 100] });
    expect(getBookProgressPercentage(book)).toBe(33);
  });
});
