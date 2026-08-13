import { Book } from '@/types/book';
import { AppService } from '@/types/system';
import { isTransferOwnedBy, useTransferStore, TransferItem } from '@/store/transferStore';
import { TranslationFunc } from '@/hooks/useTranslation';
import { ProgressPayload } from '@/utils/transfer';
import { eventDispatcher } from '@/utils/event';
import { createLogger } from '@/utils/logger';
import { canUploadToUserCloud } from '@/utils/book';
import { resolveBookAvailability } from '@/services/libraryBookAvailability';
import { LOCAL_PERSISTENCE_KEYS } from '@/services/persistence/localPersistenceRegistry';
import {
  classifyTransferError,
  TRANSFER_LIBRARY_BOOK_MISSING_CODE,
  type TransferErrorReason,
  type TransferErrorClassification,
} from '@/services/transferErrors';

export { classifyTransferError };
export type { TransferErrorReason, TransferErrorClassification };

const logger = createLogger('transfer');

const TRANSFER_QUEUE_KEY = LOCAL_PERSISTENCE_KEYS.transferQueue;
const RETRY_DELAY_BASE_MS = 2000;
const BACKGROUND_RETRY_DELAY_MAX_MS = 60_000;

interface PersistedQueueData {
  transfers: Record<string, TransferItem>;
  isQueuePaused: boolean;
}

class TransferManager {
  private static instance: TransferManager;
  private queueWakeTimer: ReturnType<typeof setTimeout> | null = null;
  private appService: AppService | null = null;
  private isProcessing = false;
  private abortControllers: Map<string, AbortController> = new Map();
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private currentOwnerUserId: string | null = null;
  private recoveredTerminalBackgroundUploadIds = new Set<string>();
  private getLibrary: (() => Book[]) | null = null;
  private updateBook: ((book: Book) => Promise<void>) | null = null;
  private _: TranslationFunc | null = null;

  private constructor() {}

  static getInstance(): TransferManager {
    if (!TransferManager.instance) {
      TransferManager.instance = new TransferManager();
    }
    return TransferManager.instance;
  }

  async initialize(
    appService: AppService,
    getLibrary: () => Book[],
    updateBook: (book: Book) => Promise<void>,
    translationFn: TranslationFunc,
    ownerUserId: string,
    libraryReconciliationSettled: boolean,
  ): Promise<void> {
    this.appService = appService;
    this.getLibrary = getLibrary;
    this.updateBook = updateBook;
    this._ = translationFn;
    this.setActiveOwnerUserId(ownerUserId);

    if (!this.isInitialized) {
      this.initializationPromise ??= this.loadPersistedQueue().then(() => {
        this.isInitialized = true;
      });
      await this.initializationPromise;
    }

    if (this.currentOwnerUserId !== ownerUserId) return;
    this.reconcilePendingTransfers(getLibrary(), ownerUserId, libraryReconciliationSettled);
    void this.processQueue();
  }

  setActiveOwnerUserId(ownerUserId: string | null): void {
    if (this.currentOwnerUserId === ownerUserId) return;

    this.currentOwnerUserId = ownerUserId;
    if (this.queueWakeTimer) {
      clearTimeout(this.queueWakeTimer);
      this.queueWakeTimer = null;
    }

    const store = useTransferStore.getState();
    Object.values(store.transfers)
      .filter(
        (transfer) => transfer.status === 'in_progress' && transfer.ownerUserId !== ownerUserId,
      )
      .forEach((transfer) => {
        this.abortControllers.get(transfer.id)?.abort();
        this.abortControllers.delete(transfer.id);
        store.retryTransfer(transfer.id);
      });
    store.setActiveCount(
      store.getActiveTransfers().filter((transfer) => transfer.ownerUserId === ownerUserId).length,
    );
    if (this.isInitialized) this.persistQueue();
  }

  isReady(): boolean {
    return this.isInitialized && this.appService !== null && this.currentOwnerUserId !== null;
  }

  private isTransferOwnedByCurrentUser(transfer: TransferItem): boolean {
    return isTransferOwnedBy(transfer, this.currentOwnerUserId);
  }

  queueUpload(book: Book, priority: number = 10, isBackground: boolean = false): string | null {
    if (!canUploadToUserCloud(book) || !this.isReady() || !this.currentOwnerUserId) return null;

    const store = useTransferStore.getState();
    const ownerUserId = this.currentOwnerUserId;

    // Check if already queued or in progress for this owner.
    const existing = Object.values(store.transfers).find(
      (transfer) =>
        transfer.ownerUserId === ownerUserId &&
        transfer.bookHash === book.hash &&
        transfer.type === 'upload' &&
        (transfer.status === 'pending' || transfer.status === 'in_progress'),
    );
    if (existing) {
      if (existing.isBackground && !isBackground) {
        store.promoteTransferToForeground(existing.id, priority);
        this.persistQueue();
        this.processQueue();
      }
      return existing.id;
    }

    if (isBackground) {
      const terminalBackgroundUpload = store
        .getFailedTransfers()
        .find(
          (transfer) =>
            transfer.status === 'failed' &&
            transfer.ownerUserId === ownerUserId &&
            transfer.bookHash === book.hash &&
            transfer.type === 'upload' &&
            transfer.isBackground,
        );
      if (terminalBackgroundUpload) return terminalBackgroundUpload.id;
    }

    const transferId = store.addTransfer(
      book.hash,
      book.title,
      'upload',
      priority,
      isBackground,
      ownerUserId,
    );
    this.persistQueue();
    this.processQueue();
    return transferId;
  }

  queueDownload(book: Book, priority: number = 10): string | null {
    if (!this.isReady() || !this.currentOwnerUserId) return null;

    const store = useTransferStore.getState();
    const ownerUserId = this.currentOwnerUserId;
    const existing = Object.values(store.transfers).find(
      (transfer) =>
        transfer.ownerUserId === ownerUserId &&
        transfer.bookHash === book.hash &&
        transfer.type === 'download' &&
        (transfer.status === 'pending' || transfer.status === 'in_progress'),
    );
    if (existing) {
      return existing.id;
    }

    const transferId = store.addTransfer(
      book.hash,
      book.title,
      'download',
      priority,
      false,
      ownerUserId,
    );
    this.persistQueue();
    this.processQueue();
    return transferId;
  }

  queueBatchUploads(books: Book[], priority: number = 10, isBackground: boolean = false): string[] {
    return books
      .filter(canUploadToUserCloud)
      .map((book) => this.queueUpload(book, priority, isBackground))
      .filter((id): id is string => id !== null);
  }

  recoverTerminalBackgroundUploads(books: Book[]): string[] {
    if (!this.currentOwnerUserId) return [];
    const ownerUserId = this.currentOwnerUserId;
    const eligibleBookHashes = new Set<string>(
      books.filter(canUploadToUserCloud).map((book) => book.hash),
    );
    if (eligibleBookHashes.size === 0) return [];

    const store = useTransferStore.getState();
    const recoveredIds = store
      .getFailedTransfers()
      .filter(
        (transfer) =>
          transfer.status === 'failed' &&
          transfer.ownerUserId === ownerUserId &&
          transfer.type === 'upload' &&
          transfer.isBackground &&
          eligibleBookHashes.has(transfer.bookHash) &&
          !this.recoveredTerminalBackgroundUploadIds.has(transfer.id),
      )
      .map((transfer) => transfer.id);

    if (recoveredIds.length === 0) return [];

    recoveredIds.forEach((transferId) => {
      this.recoveredTerminalBackgroundUploadIds.add(transferId);
      store.retryTransfer(transferId);
    });
    this.persistQueue();
    this.processQueue();
    return recoveredIds;
  }

  cancelTransfer(transferId: string): void {
    const store = useTransferStore.getState();
    const transfer = store.transfers[transferId];
    if (!transfer || !this.isTransferOwnedByCurrentUser(transfer)) return;

    const controller = this.abortControllers.get(transferId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(transferId);
    }

    store.setTransferStatus(transferId, 'cancelled');
    this.persistQueue();
  }

  retryTransfer(transferId: string): void {
    const store = useTransferStore.getState();
    const transfer = store.transfers[transferId];
    if (!transfer || !this.isTransferOwnedByCurrentUser(transfer)) return;

    store.retryTransfer(transferId);
    this.persistQueue();
    this.processQueue();
  }

  retryAllFailed(): void {
    const store = useTransferStore.getState();
    const failed = store
      .getFailedTransfers()
      .filter((transfer) => this.isTransferOwnedByCurrentUser(transfer));
    failed.forEach((transfer) => {
      store.retryTransfer(transfer.id);
    });
    this.persistQueue();
    this.processQueue();
  }

  pauseQueue(): void {
    useTransferStore.getState().pauseQueue();
    this.persistQueue();
  }

  resumeQueue(): void {
    useTransferStore.getState().resumeQueue();
    this.processQueue();
    this.persistQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;

    try {
      await this._processQueueInternal();
    } finally {
      this.isProcessing = false;
    }
  }

  private async _processQueueInternal(): Promise<void> {
    const store = useTransferStore.getState();

    if (store.isQueuePaused || !this.isReady()) return;

    const pending = store
      .getPendingTransfers()
      .filter((transfer) => this.isTransferOwnedByCurrentUser(transfer));
    const activeCount = store
      .getActiveTransfers()
      .filter((transfer) => this.isTransferOwnedByCurrentUser(transfer)).length;
    const maxConcurrent = store.maxConcurrent;

    const availableSlots = maxConcurrent - activeCount;
    if (availableSlots <= 0) return;
    if (pending.length === 0) {
      this.scheduleNextDelayedPending(store);
      return;
    }

    // Sort by priority (lower = higher priority) then by createdAt
    const sortedPending = [...pending].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.createdAt - b.createdAt;
    });

    const toProcess = sortedPending.slice(0, availableSlots);

    await Promise.all(toProcess.map((transfer) => this.executeTransfer(transfer)));

    // Check if more items to process
    const newStore = useTransferStore.getState();
    if (newStore.isQueuePaused) return;
    if (
      newStore.getPendingTransfers().some((transfer) => this.isTransferOwnedByCurrentUser(transfer))
    ) {
      this.scheduleProcessQueue(100);
    } else {
      this.scheduleNextDelayedPending(newStore);
    }
  }

  private scheduleNextDelayedPending(store = useTransferStore.getState()): void {
    const now = Date.now();
    const nextAvailableAt = Object.values(store.transfers)
      .filter(
        (transfer) =>
          this.isTransferOwnedByCurrentUser(transfer) &&
          transfer.status === 'pending' &&
          (transfer.availableAt ?? 0) > now,
      )
      .reduce<number | null>((earliest, transfer) => {
        const availableAt = transfer.availableAt!;
        return earliest === null ? availableAt : Math.min(earliest, availableAt);
      }, null);

    if (nextAvailableAt !== null) {
      this.scheduleProcessQueue(nextAvailableAt - now);
    }
  }

  private scheduleProcessQueue(delayMs: number): void {
    if (this.queueWakeTimer) clearTimeout(this.queueWakeTimer);
    this.queueWakeTimer = setTimeout(
      () => {
        this.queueWakeTimer = null;
        this.processQueue();
      },
      Math.max(0, delayMs),
    );
  }

  private async executeTransfer(transfer: TransferItem): Promise<void> {
    if (!this.isTransferOwnedByCurrentUser(transfer)) return;
    if (!this.appService || !this.getLibrary || !this.updateBook) {
      logger.error('TransferManager not properly initialized');
      return;
    }

    const _ = this._!;
    const store = useTransferStore.getState();
    const abortController = new AbortController();
    this.abortControllers.set(transfer.id, abortController);

    store.setTransferStatus(transfer.id, 'in_progress');
    store.setActiveCount(store.getActiveTransfers().length + 1);

    const progressHandler = (progress: ProgressPayload) => {
      if (abortController.signal.aborted) return;

      const percentage = progress.total > 0 ? (progress.progress / progress.total) * 100 : 0;

      useTransferStore
        .getState()
        .updateTransferProgress(
          transfer.id,
          percentage,
          progress.progress,
          progress.total,
          progress.transferSpeed,
        );
    };

    let retryScheduled = false;

    try {
      const library = this.getLibrary();
      const book = library.find((b) => b.hash === transfer.bookHash);

      if (!book) {
        throw new Error(TRANSFER_LIBRARY_BOOK_MISSING_CODE);
      }

      if (transfer.type === 'upload') {
        if (!canUploadToUserCloud(book)) {
          store.setTransferStatus(transfer.id, 'completed');
          return;
        }
        await this.appService.uploadBook(book, progressHandler);
        if (!this.isTransferOwnedByCurrentUser(transfer)) return;
        await this.updateBook(book);
      } else if (transfer.type === 'download') {
        await this.appService.downloadBook(book, false, false, progressHandler);
        if (!this.isTransferOwnedByCurrentUser(transfer)) return;
        book.downloadedAt = Date.now();
        book.coverImageUrl =
          (await this.appService.generateCoverImageUrl(book)) ?? book.coverImageUrl;
        await this.updateBook(book);
      }

      if (!this.isTransferOwnedByCurrentUser(transfer)) return;
      useTransferStore.getState().setTransferStatus(transfer.id, 'completed');
      eventDispatcher.dispatch('transfer-completed', { book, type: transfer.type });

      const latestTransfer = useTransferStore.getState().transfers[transfer.id] ?? transfer;
      const successMessages = {
        upload: _('Book uploaded: {{title}}', { title: transfer.bookTitle }),
        download: _('Book downloaded: {{title}}', { title: transfer.bookTitle }),
      };

      if (!latestTransfer.isBackground) {
        eventDispatcher.dispatch('toast', {
          type: 'info',
          timeout: 2000,
          message: successMessages[transfer.type],
        });
      }
    } catch (error) {
      if (abortController.signal.aborted || !this.isTransferOwnedByCurrentUser(transfer)) {
        // Cancellation and account switches retain the transfer for its owner.
        return;
      }

      const errorMessage = error instanceof Error ? error.message : _('Unknown error');
      const currentStore = useTransferStore.getState();
      const currentTransfer = currentStore.transfers[transfer.id];

      const errorClassification = classifyTransferError(errorMessage);
      const effectiveTransfer = currentTransfer ?? transfer;

      const isBackgroundUpload =
        effectiveTransfer.type === 'upload' && effectiveTransfer.isBackground;

      if (isBackgroundUpload && currentTransfer) {
        const logPayload = {
          transferId: transfer.id,
          bookHash: transfer.bookHash,
          reason: errorClassification.reason,
          retryCount: currentTransfer.retryCount + 1,
          error: errorMessage,
        };

        if (errorClassification.retryable) {
          const delay = Math.min(
            BACKGROUND_RETRY_DELAY_MAX_MS,
            RETRY_DELAY_BASE_MS * Math.pow(2, Math.min(currentTransfer.retryCount, 5)),
          );
          currentStore.incrementRetryCount(transfer.id);
          currentStore.deferTransfer(
            transfer.id,
            `Background backup retry scheduled: ${errorClassification.reason}`,
            Date.now() + delay,
          );
          retryScheduled = true;

          if (errorClassification.incident) {
            logger.error(
              'Background cloud backup invariant/incident; retrying silently',
              logPayload,
            );
          } else {
            logger.warn('Background cloud backup delayed; retrying silently', logPayload);
          }

          setTimeout(() => {
            this.processQueue();
          }, delay);
        } else {
          currentStore.setTransferStatus(transfer.id, 'failed', errorMessage);
          if (errorClassification.incident) {
            logger.error('Background cloud backup terminal incident; not retrying', logPayload);
          } else {
            logger.warn('Background cloud backup terminal failure; not retrying', logPayload);
          }
        }
      } else if (
        errorClassification.retryable &&
        currentTransfer &&
        currentTransfer.retryCount < currentTransfer.maxRetries
      ) {
        // Schedule retry with exponential backoff
        const delay = RETRY_DELAY_BASE_MS * Math.pow(2, currentTransfer.retryCount);
        currentStore.incrementRetryCount(transfer.id);
        currentStore.deferTransfer(
          transfer.id,
          `Retry ${currentTransfer.retryCount + 1}/${currentTransfer.maxRetries}`,
          Date.now() + delay,
        );
        retryScheduled = true;

        setTimeout(() => {
          this.processQueue();
        }, delay);
      } else {
        if (!effectiveTransfer.isBackground) {
          const genericFailureMessage =
            transfer.type === 'upload'
              ? _('Failed to upload book: {{title}}', { title: transfer.bookTitle })
              : transfer.type === 'download'
                ? _('Failed to download book: {{title}}', { title: transfer.bookTitle })
                : _('Failed to delete cloud backup of the book: {{title}}', {
                    title: transfer.bookTitle,
                  });
          const errorMessages: Record<TransferErrorReason, string> = {
            'not-authenticated': _('Please log in to continue'),
            'storage-limit-reached': _('Storage limit reached. Upgrade your plan or remove files.'),
            'storage-not-available': _('Cloud storage is not available on your current plan.'),
            'library-limit-reached': _('Library limit reached.'),
            'library-book-missing': _('Book not found in library'),
            'local-file-missing': _(
              'Book file is not available on this device. Re-download or re-import it before cloud upload.',
            ),
            'network-error': _('Network error. Check your connection and try again.'),
            'platform-incident': _(
              'Cloud storage is temporarily unavailable. Please try again shortly.',
            ),
            'unclassified-retryable': genericFailureMessage,
          };

          const retryAction =
            effectiveTransfer.type === 'upload' || effectiveTransfer.type === 'download'
              ? {
                  label: _('Retry'),
                  run: () => this.retryTransfer(transfer.id),
                }
              : null;

          eventDispatcher.dispatch('toast', {
            type: 'error',
            message: errorMessages[errorClassification.reason],
            action: retryAction,
          });
        }

        useTransferStore.getState().setTransferStatus(transfer.id, 'failed', errorMessage);
      }
    } finally {
      this.abortControllers.delete(transfer.id);

      const currentStore = useTransferStore.getState();
      currentStore.setActiveCount(
        currentStore
          .getActiveTransfers()
          .filter((activeTransfer) => this.isTransferOwnedByCurrentUser(activeTransfer)).length,
      );
      this.persistQueue();

      // Continue processing unless this transfer deliberately delayed its own retry.
      if (!retryScheduled) this.scheduleProcessQueue(100);
    }
  }

  private reconcilePendingTransfers(
    library: Book[],
    ownerUserId: string,
    libraryReconciliationSettled: boolean,
  ): void {
    const store = useTransferStore.getState();
    const orphanedTransferIds = Object.values(store.transfers)
      .filter(
        (transfer) =>
          transfer.ownerUserId === ownerUserId &&
          transfer.status === 'pending' &&
          resolveBookAvailability({
            bookHash: transfer.bookHash,
            library,
            libraryLoaded: true,
            libraryReconciliationSettled,
          }).state === 'absent',
      )
      .map((transfer) => transfer.id);

    if (orphanedTransferIds.length === 0) return;

    orphanedTransferIds.forEach((transferId) => store.removeTransfer(transferId));
    this.persistQueue();
  }

  private async loadPersistedQueue(): Promise<void> {
    try {
      if (typeof localStorage === 'undefined') return;

      const stored = localStorage.getItem(TRANSFER_QUEUE_KEY);
      if (!stored) return;

      const data: PersistedQueueData = JSON.parse(stored);
      const store = useTransferStore.getState();

      // Restore all transfers using the store's restore method
      // This preserves the original IDs and handles in_progress -> pending conversion
      store.restoreTransfers(data.transfers, data.isQueuePaused);
    } catch (error) {
      logger.error('Failed to load transfer queue:', error);
    }
  }

  private persistQueue(): void {
    try {
      if (typeof localStorage === 'undefined') return;

      const store = useTransferStore.getState();

      // Persist all transfers including completed (for history)
      const data: PersistedQueueData = {
        transfers: store.transfers,
        isQueuePaused: store.isQueuePaused,
      };

      localStorage.setItem(TRANSFER_QUEUE_KEY, JSON.stringify(data));
    } catch (error) {
      logger.error('Failed to persist transfer queue:', error);
    }
  }
}

export const transferManager = TransferManager.getInstance();
