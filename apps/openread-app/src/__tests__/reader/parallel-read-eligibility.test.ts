import { testOpenReadBookRef } from '../utils/bookIdentityFixtures';
import { describe, expect, it } from 'vitest';
import {
  PARALLEL_READ_MENU_LIMIT,
  canOfferBookForParallelRead,
  getParallelReadMenuBooks,
} from '@/app/reader/utils/parallelReadEligibility';
import type { Book } from '@/types/book';

function book(overrides: Partial<Book>): Book {
  return {
    hash: testOpenReadBookRef('book-hash'),
    title: 'Test Book',
    author: 'Test Author',
    format: 'epub',
    ...overrides,
  } as Book;
}

describe('canOfferBookForParallelRead', () => {
  it('does not offer bare catalog placeholders without a reader-openable source', () => {
    expect(
      canOfferBookForParallelRead(
        book({
          hash: testOpenReadBookRef('catalog-placeholder'),
          catalogBookId: 'catalog-book-id',
          downloadedAt: null,
          storagePath: null,
          uploadedAt: null,
        }),
      ),
    ).toBe(false);
  });

  it('offers uploaded cloud books even when they are not downloaded locally', () => {
    expect(
      canOfferBookForParallelRead(
        book({
          hash: testOpenReadBookRef('uploaded-cloud-book'),
          downloadedAt: null,
          storagePath: null,
          uploadedAt: Date.now(),
        }),
      ),
    ).toBe(true);
  });

  it('offers storage-backed books and locally downloaded books', () => {
    expect(canOfferBookForParallelRead(book({ storagePath: 'users/u/books/book.epub' }))).toBe(
      true,
    );
    expect(canOfferBookForParallelRead(book({ downloadedAt: Date.now() }))).toBe(true);
  });

  it('does not offer fixed-layout books for Parallel Read even when they have a source', () => {
    expect(canOfferBookForParallelRead(book({ format: 'pdf', storagePath: 'book.pdf' }))).toBe(
      false,
    );
  });

  it('bounds the rendered Parallel Read menu list for large libraries', () => {
    const books = Array.from({ length: 100 }, (_, index) =>
      book({
        hash: testOpenReadBookRef(`book-${index.toString().padStart(3, '0')}`),
        title: `Book ${index.toString().padStart(3, '0')}`,
        storagePath: `users/u/books/book-${index}.epub`,
      }),
    );

    expect(getParallelReadMenuBooks(books)).toHaveLength(PARALLEL_READ_MENU_LIMIT);
  });

  it('sorts the bounded menu deterministically by title', () => {
    const books = [
      book({ hash: testOpenReadBookRef('z'), title: 'Zeta', storagePath: 'z.epub' }),
      book({ hash: testOpenReadBookRef('b'), title: 'Buy Back Your Time', storagePath: 'b.epub' }),
      book({ hash: testOpenReadBookRef('a'), title: 'Alpha', storagePath: 'a.epub' }),
    ];

    expect(getParallelReadMenuBooks(books).map((item) => item.title)).toEqual([
      'Alpha',
      'Buy Back Your Time',
      'Zeta',
    ]);
  });
});
