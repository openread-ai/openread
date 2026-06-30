import { testOpenReadBookRef } from '../utils/bookIdentityFixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { classifyTransferError, transferManager } from '@/services/transferManager';
import { useTransferStore, type TransferItem } from '@/store/transferStore';
import { eventDispatcher } from '@/utils/event';
import type { Book } from '@/types/book';

const baseBook = (overrides: Partial<Book> = {}): Book => ({
  hash: testOpenReadBookRef('0123456789abcdef0123456789abcdef'),
  title: 'Manual Book',
  author: 'Author',
  format: 'epub',
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

function resetTransferManagerForTest(
  overrides: {
    uploadBook?: (book: Book) => Promise<void>;
    updateBook?: (book: Book) => Promise<void>;
    library?: Book[];
  } = {},
) {
  const manager = transferManager as unknown as {
    appService: unknown;
    getLibrary: (() => Book[]) | null;
    updateBook: ((book: Book) => Promise<void>) | null;
    _: (key: string, vars?: Record<string, string>) => string;
    isInitialized: boolean;
  };
  const library = overrides.library ?? [baseBook()];
  manager.appService = {
    uploadBook: overrides.uploadBook ?? vi.fn(async () => {}),
    downloadBook: vi.fn(async () => {}),
    deleteBook: vi.fn(async () => {}),
  };
  manager.getLibrary = () => library;
  manager.updateBook = overrides.updateBook ?? vi.fn(async () => {});
  manager._ = (key, vars) => (vars?.['title'] ? key.replace('{{title}}', vars['title']) : key);
  manager.isInitialized = true;
}

async function executeTransferForTest(transfer: TransferItem) {
  await (
    transferManager as unknown as {
      executeTransfer: (transfer: TransferItem) => Promise<void>;
    }
  ).executeTransfer(transfer);
}

describe('TransferManager upload eligibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    useTransferStore.getState().clearAll();
    localStorage.clear();
    resetTransferManagerForTest();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('queues manual books for upload', () => {
    const id = transferManager.queueUpload(baseBook());

    expect(id).toBeTruthy();
    expect(useTransferStore.getState().transfers[id!]!).toMatchObject({
      bookTitle: 'Manual Book',
      type: 'upload',
    });
  });

  it('does not queue catalog-backed books for upload', () => {
    const id = transferManager.queueUpload(
      baseBook({
        hash: testOpenReadBookRef('catalog:65119855-9d37-4caf-a7a4-4a5f9c9572d5'),
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
        hash: testOpenReadBookRef('catalog:65119855-9d37-4caf-a7a4-4a5f9c9572d5'),
        catalogBookId: '65119855-9d37-4caf-a7a4-4a5f9c9572d5',
      }),
    ]);

    expect(ids).toHaveLength(1);
    expect(useTransferStore.getState().transfers[ids[0]!]!).toMatchObject({
      bookTitle: 'Manual Book',
      type: 'upload',
    });
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
      incident: false,
    });
    expect(classifyTransferError('LIBRARY_LIMIT_REACHED')).toEqual({
      reason: 'library-limit-reached',
      retryable: false,
      incident: false,
    });
    expect(classifyTransferError('Book file not uploaded')).toEqual({
      reason: 'local-file-missing',
      retryable: false,
      incident: true,
    });
    expect(classifyTransferError('TypeError: Failed to fetch')).toEqual({
      reason: 'network-error',
      retryable: true,
      incident: false,
    });
    expect(
      classifyTransferError('STORAGE_SCHEMA_UNAVAILABLE: Request failed with HTTP 503'),
    ).toEqual({
      reason: 'platform-incident',
      retryable: true,
      incident: true,
    });
    expect(classifyTransferError('unexpected upload failure')).toEqual({
      reason: 'unclassified-retryable',
      retryable: true,
      incident: true,
    });
  });

  it('keeps background network upload failures pending for silent retry without toast', async () => {
    const book = baseBook();
    const uploadBook = vi.fn(async () => {
      throw new Error('TypeError: Failed to fetch');
    });
    resetTransferManagerForTest({ uploadBook, library: [book] });
    const dispatchSpy = vi.spyOn(eventDispatcher, 'dispatch');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const id = useTransferStore.getState().addTransfer(book.hash, book.title, 'upload', 1, true);
    await executeTransferForTest(useTransferStore.getState().transfers[id]!);

    const transfer = useTransferStore.getState().transfers[id]!;
    expect(transfer.status).toBe('pending');
    expect(transfer.retryCount).toBe(1);
    expect(transfer.error).toContain('network-error');
    expect(transfer.availableAt).toBeGreaterThan(Date.now());
    expect(dispatchSpy).not.toHaveBeenCalledWith('toast', expect.anything());
    expect(warnSpy).toHaveBeenCalledWith(
      '[transfer] Background cloud backup delayed; retrying silently',
      expect.objectContaining({ reason: 'network-error' }),
    );
  });

  it('logs backend/schema upload failures as background incidents and keeps retrying silently', async () => {
    const book = baseBook();
    const uploadBook = vi.fn(async () => {
      throw new Error('STORAGE_SCHEMA_UNAVAILABLE: Request failed with HTTP 503');
    });
    resetTransferManagerForTest({ uploadBook, library: [book] });
    const dispatchSpy = vi.spyOn(eventDispatcher, 'dispatch');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const id = useTransferStore.getState().addTransfer(book.hash, book.title, 'upload', 1, true);
    await executeTransferForTest(useTransferStore.getState().transfers[id]!);

    const transfer = useTransferStore.getState().transfers[id]!;
    expect(transfer.status).toBe('pending');
    expect(transfer.retryCount).toBe(1);
    expect(transfer.error).toContain('platform-incident');
    expect(dispatchSpy).not.toHaveBeenCalledWith('toast', expect.anything());
    expect(errorSpy).toHaveBeenCalledWith(
      '[transfer] Background cloud backup invariant/incident; retrying silently',
      expect.objectContaining({ reason: 'platform-incident' }),
    );
  });

  it('restores failed background uploads as pending for startup recovery', () => {
    const failedBackgroundUpload: TransferItem = {
      id: 'background-upload',
      bookHash: baseBook().hash,
      bookTitle: 'Manual Book',
      type: 'upload',
      status: 'failed',
      progress: 43,
      totalBytes: 100,
      transferredBytes: 43,
      transferSpeed: 1,
      error: 'previous platform incident',
      retryCount: 3,
      maxRetries: 3,
      createdAt: 1,
      completedAt: 2,
      priority: 1,
      isBackground: true,
    };

    useTransferStore
      .getState()
      .restoreTransfers({ [failedBackgroundUpload.id]: failedBackgroundUpload }, false);

    expect(useTransferStore.getState().transfers[failedBackgroundUpload.id]).toMatchObject({
      status: 'pending',
      error: undefined,
      completedAt: undefined,
      availableAt: undefined,
      progress: 0,
      transferredBytes: 0,
      transferSpeed: 0,
    });
  });

  it('does not retry a background upload before the scheduled backoff', async () => {
    const book = baseBook();
    const uploadBook = vi.fn(async () => {
      throw new Error('TypeError: Failed to fetch');
    });
    resetTransferManagerForTest({ uploadBook, library: [book] });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    useTransferStore.getState().addTransfer(book.hash, book.title, 'upload', 1, true);
    await (
      transferManager as unknown as {
        _processQueueInternal: () => Promise<void>;
      }
    )._processQueueInternal();

    expect(uploadBook).toHaveBeenCalledTimes(1);
    expect(useTransferStore.getState().getPendingTransfers()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(uploadBook).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(uploadBook).toHaveBeenCalledTimes(2);
  });

  it('promotes a delayed background upload when the user manually requests upload', () => {
    const book = baseBook();
    const id = useTransferStore.getState().addTransfer(book.hash, book.title, 'upload', 10, true);
    useTransferStore
      .getState()
      .deferTransfer(id, 'Background backup retry scheduled: network-error', Date.now() + 60_000);
    useTransferStore.getState().incrementRetryCount(id);

    const returnedId = transferManager.queueUpload(book, 1, false);

    expect(returnedId).toBe(id);
    expect(useTransferStore.getState().transfers[id]).toMatchObject({
      isBackground: false,
      priority: 1,
      retryCount: 0,
      error: undefined,
      availableAt: undefined,
    });
  });

  it('uses promoted foreground semantics for a stale in-flight background upload', async () => {
    const book = baseBook();
    resetTransferManagerForTest({ library: [book] });
    const dispatchSpy = vi.spyOn(eventDispatcher, 'dispatch');
    const id = useTransferStore.getState().addTransfer(book.hash, book.title, 'upload', 10, true);
    const staleBackgroundTransfer = useTransferStore.getState().transfers[id]!;
    useTransferStore.getState().promoteTransferToForeground(id, 1);

    await executeTransferForTest(staleBackgroundTransfer);

    expect(dispatchSpy).toHaveBeenCalledWith(
      'toast',
      expect.objectContaining({ type: 'info', message: 'Book uploaded: Manual Book' }),
    );
  });

  it('sets uploadedAt only through successful upload/updateBook path', async () => {
    const book = baseBook({ uploadedAt: null });
    const updateBook = vi.fn(async () => {});
    resetTransferManagerForTest({
      library: [book],
      updateBook,
      uploadBook: vi.fn(async (targetBook: Book) => {
        targetBook.uploadedAt = 123;
      }),
    });
    const dispatchSpy = vi.spyOn(eventDispatcher, 'dispatch');

    const id = useTransferStore.getState().addTransfer(book.hash, book.title, 'upload', 1, true);
    await executeTransferForTest(useTransferStore.getState().transfers[id]!);

    expect(book.uploadedAt).toBe(123);
    expect(updateBook).toHaveBeenCalledWith(expect.objectContaining({ uploadedAt: 123 }));
    expect(useTransferStore.getState().transfers[id]!.status).toBe('completed');
    expect(dispatchSpy).not.toHaveBeenCalledWith('toast', expect.anything());
  });
});
