import { testOpenReadBookRef } from '../utils/bookIdentityFixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryStore } from '@/store/libraryStore';
import type { Book } from '@/types/book';
import type { BookMetadata } from '@/libs/document';
import type { EnvConfigType } from '@/services/environment';

const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
const envConfig = {
  getAppService: vi.fn().mockResolvedValue({ saveLibraryBooks }),
} as unknown as EnvConfigType;

function metadata(overrides: Partial<BookMetadata>): BookMetadata {
  return {
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    language: 'en',
    ...overrides,
  };
}

function book(overrides: Partial<Book>): Book {
  return {
    hash: testOpenReadBookRef('book-1'),
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    format: 'epub',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as Book;
}

describe('libraryStore.updateBooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLibraryStore.setState({
      library: [],
      libraryLoaded: false,
      groups: {},
      currentBookshelf: [],
      selectedBooks: new Set(),
    });
  });

  it('merges incoming catalog cover metadata when the local book is newer', async () => {
    useLibraryStore.getState().setLibrary([
      book({
        hash: testOpenReadBookRef('catalog:7231ff9a-24b9-4074-9369-bc7f88ffb179'),
        updatedAt: 200,
        metadata: metadata({ publisher: 'Local Publisher' }),
      }),
    ]);

    await useLibraryStore.getState().updateBooks(envConfig, [
      book({
        hash: testOpenReadBookRef('catalog:7231ff9a-24b9-4074-9369-bc7f88ffb179'),
        updatedAt: 100,
        metadata: metadata({
          coverImageUrl: '/api/catalog-covers/catalog/covers/standard-ebooks/pride/abc/thumb.jpg',
        }),
      }),
    ]);

    const [updated] = useLibraryStore.getState().library;
    expect(updated?.updatedAt).toBe(200);
    expect(updated?.metadata).toMatchObject({
      publisher: 'Local Publisher',
      coverImageUrl: '/api/catalog-covers/catalog/covers/standard-ebooks/pride/abc/thumb.jpg',
    });
    expect(saveLibraryBooks).toHaveBeenCalledWith(useLibraryStore.getState().library);
  });

  it('self-heals canonical server fields into a newer active local row', async () => {
    const hash = testOpenReadBookRef('catalog:7231ff9a-24b9-4074-9369-bc7f88ffb179');
    useLibraryStore.getState().setLibrary([
      book({
        hash,
        updatedAt: 300,
        progress: [75, 100],
        metadata: metadata({ publisher: 'Local Publisher' }),
        catalogBookId: null,
        storagePath: null,
      }),
    ]);

    await useLibraryStore.getState().updateBooks(envConfig, [
      book({
        hash,
        updatedAt: 200,
        progress: [25, 100],
        catalogBookId: '7231ff9a-24b9-4074-9369-bc7f88ffb179',
        storagePath: 'catalog/books/standard-ebooks/pride.epub',
      }),
    ]);

    const [updated] = useLibraryStore.getState().library;
    expect(updated).toMatchObject({
      updatedAt: 300,
      progress: [75, 100],
      catalogBookId: '7231ff9a-24b9-4074-9369-bc7f88ffb179',
      storagePath: 'catalog/books/standard-ebooks/pride.epub',
      metadata: { publisher: 'Local Publisher' },
    });
  });

  it('keeps a local delete tombstone over an equal-time active remote book', async () => {
    const hash = testOpenReadBookRef('catalog:7231ff9a-24b9-4074-9369-bc7f88ffb179');
    useLibraryStore.getState().setLibrary([
      book({
        hash,
        updatedAt: 300,
        deletedAt: 300,
        catalogBookId: null,
        storagePath: null,
      }),
    ]);

    await useLibraryStore.getState().updateBooks(envConfig, [
      book({
        hash,
        updatedAt: 300,
        deletedAt: null,
        catalogBookId: '7231ff9a-24b9-4074-9369-bc7f88ffb179',
        storagePath: 'catalog/books/standard-ebooks/pride.epub',
      }),
    ]);

    const [updated] = useLibraryStore.getState().library;
    expect(updated?.deletedAt).toBe(300);
    expect(updated?.catalogBookId).toBeNull();
    expect(updated?.storagePath).toBeNull();
    expect(useLibraryStore.getState().getVisibleLibrary()).toEqual([]);
  });

  it('does not graft catalog fields onto private imports', async () => {
    const hash = testOpenReadBookRef('private-import');
    useLibraryStore
      .getState()
      .setLibrary([
        book({ hash, updatedAt: 300, progress: [75, 100], catalogBookId: null, storagePath: null }),
      ]);

    await useLibraryStore.getState().updateBooks(envConfig, [
      book({
        hash,
        updatedAt: 200,
        catalogBookId: '7231ff9a-24b9-4074-9369-bc7f88ffb179',
        storagePath: 'catalog/books/standard-ebooks/pride.epub',
      }),
    ]);

    const [updated] = useLibraryStore.getState().library;
    expect(updated).toMatchObject({ updatedAt: 300, progress: [75, 100] });
    expect(updated?.catalogBookId).toBeNull();
    expect(updated?.storagePath).toBeNull();
  });
});
