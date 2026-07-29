import { testOpenReadBookRef } from '../utils/bookIdentityFixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { classifyTransferError, transferManager } from '@/services/transferManager';
import { TRANSFER_LIBRARY_BOOK_MISSING_CODE } from '@/services/transferErrors';
import { useTransferStore, type TransferItem } from '@/store/transferStore';
import { eventDispatcher } from '@/utils/event';
import { LOCAL_PERSISTENCE_KEYS } from '@/services/persistence/localPersistenceRegistry';
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
    downloadBook?: (book: Book) => Promise<void>;
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
    recoveredTerminalBackgroundUploadIds: Set<string>;
  };
  const library = overrides.library ?? [baseBook()];
  manager.appService = {
    uploadBook: overrides.uploadBook ?? vi.fn(async () => {}),
    downloadBook: overrides.downloadBook ?? vi.fn(async () => {}),
  };
  manager.getLibrary = () => library;
  manager.updateBook = overrides.updateBook ?? vi.fn(async () => {});
  manager._ = (key, vars) => (vars?.['title'] ? key.replace('{{title}}', vars['title']) : key);
  manager.isInitialized = true;
  manager.recoveredTerminalBackgroundUploadIds = new Set();
}

async function executeTransferForTest(transfer: TransferItem) {
  await (
    transferManager as unknown as {
      executeTransfer: (transfer: TransferItem) => Promise<void>;
    }
  ).executeTransfer(transfer);
}

type ToastDispatchDetail = {
  type?: string;
  message?: string;
  action?: { label: string; run: () => void } | null;
};

function getLastToastDetail(dispatchSpy: { mock: { calls: unknown[][] } }): ToastDispatchDetail {
  const toastCall = [...dispatchSpy.mock.calls]
    .reverse()
    .find(([eventName]) => eventName === 'toast');
  expect(toastCall).toBeTruthy();
  return toastCall![1] as ToastDispatchDetail;
}

describe('TransferManager upload eligibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    useTransferStore.getState().clearAll();
    useTransferStore.getState().resumeQueue();
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
    expect(classifyTransferError(TRANSFER_LIBRARY_BOOK_MISSING_CODE)).toEqual({
      reason: 'library-book-missing',
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

  it('adds a Retry action to terminal foreground upload failure toasts', async () => {
    const book = baseBook();
    const uploadBook = vi.fn(async () => {
      throw new Error('STORAGE_LIMIT_REACHED');
    });
    resetTransferManagerForTest({ uploadBook, library: [book] });
    const dispatchSpy = vi.spyOn(eventDispatcher, 'dispatch');

    const id = useTransferStore.getState().addTransfer(book.hash, book.title, 'upload', 1, false);
    await executeTransferForTest(useTransferStore.getState().transfers[id]!);

    const toastDetail = getLastToastDetail(dispatchSpy);
    expect(toastDetail).toMatchObject({
      type: 'error',
      message: 'Storage limit reached. Upgrade your plan or remove files.',
      action: expect.objectContaining({ label: 'Retry' }),
    });

    const retrySpy = vi.spyOn(transferManager, 'retryTransfer').mockImplementation(() => {});
    toastDetail.action!.run();

    expect(retrySpy).toHaveBeenCalledWith(id);
  });

  it('adds a Retry action to terminal foreground download failure toasts', async () => {
    const book = baseBook();
    const downloadBook = vi.fn(async () => {
      throw new Error('STORAGE_LIMIT_REACHED');
    });
    resetTransferManagerForTest({ downloadBook, library: [book] });
    const dispatchSpy = vi.spyOn(eventDispatcher, 'dispatch');

    const id = useTransferStore.getState().addTransfer(book.hash, book.title, 'download', 1, false);
    await executeTransferForTest(useTransferStore.getState().transfers[id]!);

    const toastDetail = getLastToastDetail(dispatchSpy);
    expect(toastDetail).toMatchObject({
      type: 'error',
      message: 'Storage limit reached. Upgrade your plan or remove files.',
      action: expect.objectContaining({ label: 'Retry' }),
    });

    const retrySpy = vi.spyOn(transferManager, 'retryTransfer').mockImplementation(() => {});
    toastDetail.action!.run();

    expect(retrySpy).toHaveBeenCalledWith(id);
  });

  it('marks a missing-library background transfer terminal without retry or reschedule', async () => {
    const uploadBook = vi.fn(async () => {});
    resetTransferManagerForTest({ uploadBook, library: [] });
    const dispatchSpy = vi.spyOn(eventDispatcher, 'dispatch');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const missingBook = baseBook();

    const id = useTransferStore
      .getState()
      .addTransfer(missingBook.hash, missingBook.title, 'upload', 1, true);
    await executeTransferForTest(useTransferStore.getState().transfers[id]!);
    await vi.runOnlyPendingTimersAsync();

    const transfer = useTransferStore.getState().transfers[id]!;
    expect(transfer.status).toBe('failed');
    expect(transfer.retryCount).toBe(0);
    expect(transfer.error).toBe(TRANSFER_LIBRARY_BOOK_MISSING_CODE);
    expect(transfer.availableAt).toBeUndefined();
    expect(useTransferStore.getState().getPendingTransfers()).toHaveLength(0);
    expect(uploadBook).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalledWith('toast', expect.anything());
    expect(warnSpy).toHaveBeenCalledWith(
      '[transfer] Background cloud backup terminal failure; not retrying',
      expect.objectContaining({ reason: 'library-book-missing', retryCount: 1 }),
    );
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

  it('marks non-retryable background upload failures terminal without toast or retry', async () => {
    const book = baseBook();
    const uploadBook = vi.fn(async () => {
      throw new Error('STORAGE_LIMIT_REACHED');
    });
    resetTransferManagerForTest({ uploadBook, library: [book] });
    const dispatchSpy = vi.spyOn(eventDispatcher, 'dispatch');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const id = useTransferStore.getState().addTransfer(book.hash, book.title, 'upload', 1, true);
    await executeTransferForTest(useTransferStore.getState().transfers[id]!);
    await vi.runOnlyPendingTimersAsync();

    const transfer = useTransferStore.getState().transfers[id]!;
    expect(transfer.status).toBe('failed');
    expect(transfer.retryCount).toBe(0);
    expect(transfer.error).toBe('STORAGE_LIMIT_REACHED');
    expect(transfer.availableAt).toBeUndefined();
    expect(useTransferStore.getState().getFailedTransfers()).toEqual([transfer]);
    expect(uploadBook).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).not.toHaveBeenCalledWith('toast', expect.anything());
    expect(warnSpy).toHaveBeenCalledWith(
      '[transfer] Background cloud backup terminal failure; not retrying',
      expect.objectContaining({ reason: 'storage-limit-reached' }),
    );
  });

  it('exposes terminal background upload failures to retryAllFailed', async () => {
    const book = baseBook();
    const uploadBook = vi.fn(async () => {
      throw new Error('STORAGE_LIMIT_REACHED');
    });
    resetTransferManagerForTest({ uploadBook, library: [book] });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const id = useTransferStore.getState().addTransfer(book.hash, book.title, 'upload', 1, true);
    await executeTransferForTest(useTransferStore.getState().transfers[id]!);
    useTransferStore.getState().pauseQueue();

    transferManager.retryAllFailed();

    expect(useTransferStore.getState().transfers[id]).toMatchObject({
      status: 'pending',
      error: undefined,
      availableAt: undefined,
      completedAt: undefined,
    });
  });

  it('restores retryable failed background uploads as pending for startup recovery', () => {
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
      error: 'STORAGE_SCHEMA_UNAVAILABLE: Request failed with HTTP 503',
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

  it('drops persisted pending orphans on initialization while preserving valid transfers', async () => {
    const validBook = baseBook();
    const orphanedBook = baseBook({
      hash: testOpenReadBookRef('fedcba9876543210fedcba9876543210'),
      title: 'Deleted Book',
    });
    const store = useTransferStore.getState();
    const validId = store.addTransfer(validBook.hash, validBook.title, 'upload', 1, true);
    const orphanedId = store.addTransfer(orphanedBook.hash, orphanedBook.title, 'upload', 1, true);
    const persistedTransfers = { ...useTransferStore.getState().transfers };
    localStorage.setItem(
      LOCAL_PERSISTENCE_KEYS.transferQueue,
      JSON.stringify({ transfers: persistedTransfers, isQueuePaused: true }),
    );
    store.clearAll();

    const appService = {
      uploadBook: vi.fn(async () => {}),
      downloadBook: vi.fn(async () => {}),
    } as unknown as Parameters<typeof transferManager.initialize>[0];
    const manager = transferManager as unknown as { isInitialized: boolean };
    manager.isInitialized = false;

    await transferManager.initialize(
      appService,
      () => [validBook],
      vi.fn(async () => {}),
      (key) => key,
    );

    const transfers = useTransferStore.getState().transfers;
    expect(transfers[orphanedId]).toBeUndefined();
    expect(transfers[validId]).toEqual(persistedTransfers[validId]);
    expect(appService.uploadBook).not.toHaveBeenCalled();
    expect(appService.downloadBook).not.toHaveBeenCalled();

    const persistedQueue = JSON.parse(
      localStorage.getItem(LOCAL_PERSISTENCE_KEYS.transferQueue)!,
    ) as { transfers: Record<string, TransferItem> };
    expect(persistedQueue.transfers[orphanedId]).toBeUndefined();
    expect(persistedQueue.transfers[validId]).toEqual(persistedTransfers[validId]);
  });

  it('restores transfers with the persisted queue pause state', () => {
    const transfer: TransferItem = {
      id: 'pending-upload',
      bookHash: baseBook().hash,
      bookTitle: 'Manual Book',
      type: 'upload',
      status: 'pending',
      progress: 0,
      totalBytes: 0,
      transferredBytes: 0,
      transferSpeed: 0,
      retryCount: 0,
      maxRetries: 3,
      createdAt: 1,
      priority: 1,
      isBackground: true,
    };

    useTransferStore.getState().restoreTransfers({ [transfer.id]: transfer }, true);

    expect(useTransferStore.getState().transfers[transfer.id]).toEqual(transfer);
    expect(useTransferStore.getState().isQueuePaused).toBe(true);
  });

  it('preserves non-retryable failed background uploads across restore', () => {
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
      error: 'STORAGE_LIMIT_REACHED',
      retryCount: 0,
      maxRetries: 3,
      createdAt: 1,
      completedAt: 2,
      priority: 1,
      isBackground: true,
    };

    useTransferStore
      .getState()
      .restoreTransfers({ [failedBackgroundUpload.id]: failedBackgroundUpload }, false);

    const restoredTransfer = useTransferStore.getState().transfers[failedBackgroundUpload.id]!;
    expect(restoredTransfer).toMatchObject({
      status: 'failed',
      error: 'STORAGE_LIMIT_REACHED',
      completedAt: 2,
      progress: 43,
      transferredBytes: 43,
      transferSpeed: 1,
    });
    expect(restoredTransfer).not.toHaveProperty('availableAt');
  });

  it('does not queue duplicate background uploads for terminal background failures', () => {
    const book = baseBook();
    const id = useTransferStore.getState().addTransfer(book.hash, book.title, 'upload', 1, true);
    useTransferStore.getState().setTransferStatus(id, 'failed', 'STORAGE_LIMIT_REACHED');

    const returnedId = transferManager.queueUpload(book, 1, true);

    expect(returnedId).toBe(id);
    expect(Object.values(useTransferStore.getState().transfers)).toHaveLength(1);
  });

  it('recovers terminal background uploads by resetting the existing transfer', () => {
    const book = baseBook();
    const id = useTransferStore.getState().addTransfer(book.hash, book.title, 'upload', 1, true);
    useTransferStore.getState().setTransferStatus(id, 'failed', 'STORAGE_LIMIT_REACHED');
    useTransferStore.getState().pauseQueue();

    const recoveredIds = transferManager.recoverTerminalBackgroundUploads([book]);

    expect(recoveredIds).toEqual([id]);
    expect(Object.values(useTransferStore.getState().transfers)).toHaveLength(1);
    expect(useTransferStore.getState().transfers[id]).toMatchObject({
      status: 'pending',
      error: undefined,
      completedAt: undefined,
      availableAt: undefined,
      isBackground: true,
    });
  });

  it('does not repeatedly recover the same terminal background upload in one runtime', async () => {
    const book = baseBook();
    const uploadBook = vi.fn(async () => {
      throw new Error('STORAGE_LIMIT_REACHED');
    });
    resetTransferManagerForTest({ uploadBook, library: [book] });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const id = useTransferStore.getState().addTransfer(book.hash, book.title, 'upload', 1, true);
    useTransferStore.getState().setTransferStatus(id, 'failed', 'STORAGE_LIMIT_REACHED');
    useTransferStore.getState().pauseQueue();

    expect(transferManager.recoverTerminalBackgroundUploads([book])).toEqual([id]);
    await executeTransferForTest(useTransferStore.getState().transfers[id]!);

    expect(useTransferStore.getState().transfers[id]).toMatchObject({
      status: 'failed',
      error: 'STORAGE_LIMIT_REACHED',
    });
    expect(transferManager.recoverTerminalBackgroundUploads([book])).toEqual([]);
    expect(useTransferStore.getState().transfers[id]).toMatchObject({
      status: 'failed',
      error: 'STORAGE_LIMIT_REACHED',
    });
    expect(uploadBook).toHaveBeenCalledTimes(1);
  });

  it('skips terminal background recovery for ineligible books', () => {
    const book = baseBook({
      hash: testOpenReadBookRef('catalog:65119855-9d37-4caf-a7a4-4a5f9c9572d5'),
      catalogBookId: '65119855-9d37-4caf-a7a4-4a5f9c9572d5',
    });
    const id = useTransferStore.getState().addTransfer(book.hash, book.title, 'upload', 1, true);
    useTransferStore.getState().setTransferStatus(id, 'failed', 'STORAGE_LIMIT_REACHED');

    expect(transferManager.recoverTerminalBackgroundUploads([book])).toEqual([]);
    expect(useTransferStore.getState().transfers[id]).toMatchObject({
      status: 'failed',
      error: 'STORAGE_LIMIT_REACHED',
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
