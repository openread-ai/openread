import { describe, expect, it } from 'vitest';

import { resolveBookAvailability } from '@/services/libraryBookAvailability';
import type { Book } from '@/types/book';

const createBook = (overrides: Partial<Book> = {}): Book => ({
  hash: 'book-1' as Book['hash'],
  title: 'Book',
  author: 'Author',
  format: 'epub',
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
  ...overrides,
});

const resolve = (overrides: Partial<Parameters<typeof resolveBookAvailability>[0]> = {}) =>
  resolveBookAvailability({
    bookHash: 'book-1',
    library: [createBook()],
    libraryLoaded: true,
    libraryReconciliationSettled: true,
    ...overrides,
  });

describe('resolveBookAvailability', () => {
  it('returns the visible matching book as present', () => {
    const book = createBook();

    expect(resolve({ library: [book] })).toEqual({ state: 'present', book });
  });

  it('preserves a falsy zero deletion timestamp as visible', () => {
    const book = createBook({ deletedAt: 0 });

    expect(resolve({ library: [book] })).toEqual({ state: 'present', book });
  });

  it('returns a tombstoned matching book as absent after settlement', () => {
    expect(resolve({ library: [createBook({ deletedAt: 1 })] })).toEqual({
      state: 'absent',
      book: null,
    });
  });

  it('returns a missing book as absent after settlement', () => {
    expect(resolve({ library: [] })).toEqual({ state: 'absent', book: null });
  });

  it('returns unknown while a missing book is still reconciling', () => {
    expect(resolve({ library: [], libraryReconciliationSettled: false })).toEqual({
      state: 'unknown',
      book: null,
    });
  });

  it('returns absent for a catalog id mismatch after settlement', () => {
    expect(
      resolve({
        catalogBookId: 'catalog-2',
        library: [createBook({ catalogBookId: 'catalog-1' })],
      }),
    ).toEqual({ state: 'absent', book: null });
  });

  it('never treats a missing hash as present', () => {
    expect(resolve({ bookHash: undefined, libraryReconciliationSettled: false })).toEqual({
      state: 'unknown',
      book: null,
    });
    expect(resolve({ bookHash: undefined })).toEqual({ state: 'absent', book: null });
  });

  it('returns unknown while the account-scoped Library is not loaded', () => {
    expect(resolve({ libraryLoaded: false })).toEqual({ state: 'unknown', book: null });
  });

  it('keeps mixed Reader refs waiting until absence is settled', () => {
    const statesFor = (libraryReconciliationSettled: boolean) =>
      ['book-1', 'book-2'].map((bookHash) => resolve({ bookHash, libraryReconciliationSettled }));

    const unsettled = statesFor(false);
    expect(unsettled.map(({ state }) => state)).toEqual(['present', 'unknown']);
    expect(unsettled.every(({ state }) => state !== 'unknown')).toBe(false);

    const settled = statesFor(true);
    expect(settled.map(({ state }) => state)).toEqual(['present', 'absent']);
    expect(settled.every(({ state }) => state !== 'unknown')).toBe(true);
  });
});
