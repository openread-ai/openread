import { describe, it, expect } from 'vitest';
import {
  getTrashBooks,
  getBooksToAutoPurge,
  restoreBook,
  isInTrash,
  resolveSoftDeleteConflict,
  TRASH_RETENTION_DAYS,
} from '@/utils/softDelete';
import type { Book } from '@/types/book';

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'test-id',
    hash: 'test-hash',
    title: 'Test Book',
    format: 'epub',
    progress: 0,
    readingStatus: 'unread',
    annotations: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    ...overrides,
  } as Book;
}

describe('getTrashBooks', () => {
  it('returns only soft-deleted books', () => {
    const books = [
      makeBook({ id: '1' }),
      makeBook({ id: '2', deletedAt: Date.now() }),
      makeBook({ id: '3' }),
    ];
    const trash = getTrashBooks(books);
    expect(trash).toHaveLength(1);
    expect(trash[0]!.id).toBe('2');
  });
});

describe('getBooksToAutoPurge', () => {
  it('returns books older than retention period', () => {
    const oldDate = Date.now() - (TRASH_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000;
    const recentDate = Date.now() - 1000;
    const books = [
      makeBook({ id: '1', deletedAt: oldDate }),
      makeBook({ id: '2', deletedAt: recentDate }),
      makeBook({ id: '3' }),
    ];
    const toPurge = getBooksToAutoPurge(books);
    expect(toPurge).toHaveLength(1);
    expect(toPurge[0]!.id).toBe('1');
  });
});

describe('restoreBook', () => {
  it('clears deletedAt', () => {
    const book = makeBook({ deletedAt: Date.now() });
    const restored = restoreBook(book);
    expect(restored.deletedAt).toBeNull();
  });
});

describe('isInTrash', () => {
  it('returns true for soft-deleted books', () => {
    expect(isInTrash(makeBook({ deletedAt: Date.now() }))).toBe(true);
    expect(isInTrash(makeBook())).toBe(false);
  });
});

describe('resolveSoftDeleteConflict', () => {
  it('restores when remote is modified after local delete', () => {
    const local = makeBook({ deletedAt: 1000, updatedAt: 1000 });
    const remote = makeBook({ deletedAt: null, updatedAt: 2000 });
    const result = resolveSoftDeleteConflict(local, remote);
    expect(result.action).toBe('restore');
    expect(result.result.deletedAt).toBeNull();
  });

  it('keeps deletion when both deleted', () => {
    const local = makeBook({ deletedAt: 2000 });
    const remote = makeBook({ deletedAt: 1000 });
    const result = resolveSoftDeleteConflict(local, remote);
    expect(result.action).toBe('keep_local');
  });
});
