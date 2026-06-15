import { beforeEach, describe, expect, it } from 'vitest';

import { classifyTransferError, transferManager } from '@/services/transferManager';
import { useTransferStore } from '@/store/transferStore';
import type { Book } from '@/types/book';

const baseBook = (overrides: Partial<Book> = {}): Book => ({
  hash: '0123456789abcdef0123456789abcdef',
  title: 'Manual Book',
  author: 'Author',
  format: 'epub',
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe('TransferManager upload eligibility', () => {
  beforeEach(() => {
    useTransferStore.getState().clearAll();
    localStorage.clear();
  });

  it('queues manual books for upload', () => {
    const id = transferManager.queueUpload(baseBook());

    expect(id).toBeTruthy();
    expect(useTransferStore.getState().getPendingTransfers()).toHaveLength(1);
  });

  it('does not queue catalog-backed books for upload', () => {
    const id = transferManager.queueUpload(
      baseBook({
        hash: 'catalog:65119855-9d37-4caf-a7a4-4a5f9c9572d5',
        catalogBookId: '65119855-9d37-4caf-a7a4-4a5f9c9572d5',
        storagePath: 'catalog/books/65119855/book.epub',
      }),
    );

    expect(id).toBeNull();
    expect(useTransferStore.getState().getPendingTransfers()).toHaveLength(0);
  });

  it('filters catalog-backed books from batch uploads while keeping manual books', () => {
    const ids = transferManager.queueBatchUploads([
      baseBook(),
      baseBook({
        hash: 'catalog:65119855-9d37-4caf-a7a4-4a5f9c9572d5',
        catalogBookId: '65119855-9d37-4caf-a7a4-4a5f9c9572d5',
      }),
    ]);

    expect(ids).toHaveLength(1);
    expect(useTransferStore.getState().getPendingTransfers()).toHaveLength(1);
  });

  it('marks startup batch uploads as background when requested', () => {
    const ids = transferManager.queueBatchUploads([baseBook()], 1, true);

    expect(ids).toHaveLength(1);
    expect(useTransferStore.getState().transfers[ids[0]!]!.isBackground).toBe(true);
  });

  it('classifies non-retryable upload contract failures', () => {
    expect(classifyTransferError('STORAGE_LIMIT_REACHED')).toEqual({
      reason: 'storage-limit-reached',
      retryable: false,
    });
    expect(classifyTransferError('LIBRARY_LIMIT_REACHED')).toEqual({
      reason: 'library-limit-reached',
      retryable: false,
    });
    expect(classifyTransferError('Book file not uploaded')).toEqual({
      reason: 'local-file-missing',
      retryable: false,
    });
    expect(classifyTransferError('Network timeout')).toEqual({
      reason: 'unknown',
      retryable: true,
    });
  });
});
