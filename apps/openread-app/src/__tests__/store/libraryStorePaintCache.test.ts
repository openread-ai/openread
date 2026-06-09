import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';

function cachedBook(overrides: Partial<Book> = {}): Book {
  return {
    hash: 'cached-book',
    title: 'Cached Book',
    author: 'Author',
    format: 'epub',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as Book;
}

describe('libraryStore durable paint cache', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('hydrates account-scoped books synchronously for reload paint', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 'user-1' }));
    localStorage.setItem('openread_library_owner_user_id', 'user-1');
    localStorage.setItem(
      'openread_library_paint_cache_v1',
      JSON.stringify({
        version: 1,
        ownerUserId: 'user-1',
        books: [cachedBook()],
        timestamp: Date.now(),
      }),
    );

    const { useLibraryStore } = await import('@/store/libraryStore');

    expect(useLibraryStore.getState().libraryLoaded).toBe(true);
    expect(useLibraryStore.getState().libraryOwnerUserId).toBe('user-1');
    expect(useLibraryStore.getState().library.map((book) => book.hash)).toEqual(['cached-book']);
  });

  it('does not hydrate cached books for a different signed-in account', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 'user-2' }));
    localStorage.setItem('openread_library_owner_user_id', 'user-1');
    localStorage.setItem(
      'openread_library_paint_cache_v1',
      JSON.stringify({
        version: 1,
        ownerUserId: 'user-1',
        books: [cachedBook()],
        timestamp: Date.now(),
      }),
    );

    const { useLibraryStore } = await import('@/store/libraryStore');

    expect(useLibraryStore.getState().libraryLoaded).toBe(false);
    expect(useLibraryStore.getState().libraryOwnerUserId).toBeNull();
    expect(useLibraryStore.getState().library).toEqual([]);
  });

  it('persists the latest account-scoped library for the next reload', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 'user-1' }));
    localStorage.setItem('openread_library_owner_user_id', 'user-1');

    const { useLibraryStore } = await import('@/store/libraryStore');
    useLibraryStore.getState().setLibraryOwnerUserId('user-1');
    useLibraryStore.getState().setLibrary([cachedBook({ hash: 'new-cache' })]);

    expect(JSON.parse(localStorage.getItem('openread_library_paint_cache_v1') ?? '{}')).toEqual(
      expect.objectContaining({
        version: 1,
        ownerUserId: 'user-1',
        books: [expect.objectContaining({ hash: 'new-cache' })],
      }),
    );
  });
});
