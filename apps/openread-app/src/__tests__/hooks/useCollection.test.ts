import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCollection } from '@/hooks/useCollection';
import type { Book } from '@/types/book';

const mocks = vi.hoisted(() => {
  const mockBook = {
    hash: 'book-1',
    title: 'Stale Book',
    author: 'Test Author',
    format: 'epub',
    createdAt: 1,
    updatedAt: 1,
    coverImageUrl: null,
  } as Book;

  const sidebarState = {
    collections: [
      {
        id: 'collection-1',
        name: 'Favorites',
        bookHashes: ['book-1'],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    renameCollection: vi.fn(),
    removeCollection: vi.fn(),
    addBookToCollection: vi.fn(),
    removeBookFromCollection: vi.fn(),
  };

  const libraryState = {
    library: [mockBook] as Book[],
    libraryLoaded: true,
    isReconciling: false,
  };

  return { mockBook, sidebarState, libraryState };
});

vi.mock('@/store/platformSidebarStore', () => ({
  usePlatformSidebarStore: (selector: (state: typeof mocks.sidebarState) => unknown) =>
    selector(mocks.sidebarState),
}));

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: (selector: (state: typeof mocks.libraryState) => unknown) =>
    selector(mocks.libraryState),
}));

describe('useCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.libraryState.library = [mocks.mockBook];
    mocks.libraryState.libraryLoaded = true;
    mocks.libraryState.isReconciling = false;
  });

  it('returns collection books after the library is ready', () => {
    const { result } = renderHook(() => useCollection('collection-1'));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.books.map((book) => book.hash)).toEqual(['book-1']);
  });

  it('uses loading state and withholds stale collection books during reconcile', () => {
    mocks.libraryState.isReconciling = true;

    const { result } = renderHook(() => useCollection('collection-1'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.books).toEqual([]);
  });
});
