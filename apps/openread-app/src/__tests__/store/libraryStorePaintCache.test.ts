import { testOpenReadBookRef } from '../utils/bookIdentityFixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';

function cachedBook(overrides: Partial<Book> = {}): Book {
  return {
    hash: testOpenReadBookRef('cached-book'),
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
    expect(useLibraryStore.getState().library.map((book) => book.hash)).toEqual([
      testOpenReadBookRef('cached-book'),
    ]);
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
    useLibraryStore.getState().setLibrary([cachedBook({ hash: testOpenReadBookRef('new-cache') })]);

    expect(JSON.parse(localStorage.getItem('openread_library_paint_cache_v1') ?? '{}')).toEqual(
      expect.objectContaining({
        version: 1,
        ownerUserId: 'user-1',
        books: [expect.objectContaining({ hash: testOpenReadBookRef('new-cache') })],
      }),
    );
  });

  it('does not persist transient generated cover URLs in the durable paint cache', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 'user-1' }));
    localStorage.setItem('openread_library_owner_user_id', 'user-1');

    const { useLibraryStore } = await import('@/store/libraryStore');
    useLibraryStore.getState().setLibraryOwnerUserId('user-1');
    useLibraryStore.getState().setLibrary([
      cachedBook({
        coverImageUrl: 'blob:http://localhost:3000/6f008d49-4b24-4449-8487-1515efb4a8f3',
        metadata: {
          title: 'Cached Book',
          author: 'Author',
          language: 'en',
          coverImageUrl: '/api/catalog-covers/catalog/covers/book/thumb.jpg',
          coverImageBlobUrl: 'blob:http://localhost:3000/39e2f129-2274-4840-8bbc-9bd76cd1b957',
        },
      }),
    ]);

    const cached = JSON.parse(localStorage.getItem('openread_library_paint_cache_v1') ?? '{}');
    expect(cached.books[0]).not.toHaveProperty('coverImageUrl');
    expect(cached.books[0].metadata).toEqual(
      expect.objectContaining({
        coverImageUrl: '/api/catalog-covers/catalog/covers/book/thumb.jpg',
      }),
    );
    expect(cached.books[0].metadata).not.toHaveProperty('coverImageBlobUrl');
  });

  it('sanitizes stale transient cover URLs before hydrating reload paint', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 'user-1' }));
    localStorage.setItem('openread_library_owner_user_id', 'user-1');
    localStorage.setItem(
      'openread_library_paint_cache_v1',
      JSON.stringify({
        version: 1,
        ownerUserId: 'user-1',
        books: [
          cachedBook({
            coverImageUrl: 'blob:http://localhost:3000/0d133be9-548c-478d-bd07-a265a0e46d9c',
            metadata: {
              title: 'Cached Book',
              author: 'Author',
              language: 'en',
              coverImageUrl: 'a5a1f554-3047-4881-b2f7-bac4ce0f35ae',
              coverImageBlobUrl: 'blob:http://localhost:3000/0f356e1f-f37f-43f0-89cd-96fd140fc8ad',
            },
          }),
        ],
        timestamp: Date.now(),
      }),
    );

    const { useLibraryStore } = await import('@/store/libraryStore');
    const [book] = useLibraryStore.getState().library;

    expect(book.coverImageUrl).toBeUndefined();
    expect(book.metadata?.coverImageUrl).toBeUndefined();
    expect(book.metadata?.coverImageBlobUrl).toBeUndefined();
  });
});
