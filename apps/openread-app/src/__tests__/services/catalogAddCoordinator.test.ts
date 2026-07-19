import { beforeEach, describe, expect, it } from 'vitest';
import { createCatalogBookRef } from '@openread/types';
import { catalogAddFailureMessage, visibleCanonicalBook } from '@/services/catalogAddCoordinator';
import { useLibraryStore } from '@/store/libraryStore';
import type { Book } from '@/types/book';

const catalogBookId = '7231ff9a-24b9-4074-9369-bc7f88ffb179';
const bookHash = createCatalogBookRef(catalogBookId);

function catalogBook(overrides: Partial<Book> = {}): Book {
  return {
    hash: bookHash,
    catalogBookId,
    storagePath: 'catalog/books/standard-ebooks/pride.epub',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    format: 'epub',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as Book;
}

describe('catalogAddCoordinator Reader readiness boundary', () => {
  beforeEach(() => {
    useLibraryStore.setState({ library: [], libraryLoaded: false });
  });

  it('requires the exact active hash, catalog identity, and non-empty storage path', () => {
    useLibraryStore.setState({ library: [catalogBook()] });
    expect(visibleCanonicalBook(catalogBookId, bookHash)).toBe(true);

    for (const incomplete of [
      catalogBook({
        hash: createCatalogBookRef('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      }),
      catalogBook({ catalogBookId: 'different-id' }),
      catalogBook({ storagePath: null }),
      catalogBook({ storagePath: '   ' }),
      catalogBook({ deletedAt: 2 }),
    ]) {
      useLibraryStore.setState({ library: [incomplete] });
      expect(visibleCanonicalBook(catalogBookId, bookHash)).toBe(false);
    }
  });
});

describe('catalogAddCoordinator failure boundary', () => {
  it.each([
    'SOURCE_SIGNATURE_INVALID',
    'SOURCE_SIZE_MISMATCH',
    'MATERIALIZATION_RETRY_EXHAUSTED',
    'LIBRARY_LIMIT_REACHED',
  ])('preserves the existing canonical Add meaning %s', (failureCode) => {
    expect(catalogAddFailureMessage(failureCode)).toBe(failureCode);
  });

  it.each([
    'MATERIALIZATION_OPERATIONAL_FAILURE',
    'MATERIALIZATION_HEARTBEAT_LOST',
    'SOURCE_FETCH_TIMEOUT',
    'UNKNOWN_CODE',
    undefined,
    null,
  ])('fails closed for non-public or unknown service values: %s', (failureCode) => {
    expect(catalogAddFailureMessage(failureCode)).toBe('Catalog Add failed');
  });
});
