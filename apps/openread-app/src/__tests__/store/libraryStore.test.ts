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
    hash: 'book-1',
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
        hash: 'catalog:7231ff9a-24b9-4074-9369-bc7f88ffb179',
        updatedAt: 200,
        metadata: metadata({ publisher: 'Local Publisher' }),
      }),
    ]);

    await useLibraryStore.getState().updateBooks(envConfig, [
      book({
        hash: 'catalog:7231ff9a-24b9-4074-9369-bc7f88ffb179',
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
});
