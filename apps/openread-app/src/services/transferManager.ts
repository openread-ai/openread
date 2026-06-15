import { Book } from '@/types/book';
import { AppService } from '@/types/system';
import { useTransferStore, TransferItem } from '@/store/transferStore';
import { TranslationFunc } from '@/hooks/useTranslation';
import { ProgressPayload } from '@/utils/transfer';
import { eventDispatcher } from '@/utils/event';
import { createLogger } from '@/utils/logger';
import { isUserCloudUploadEligible } from '@/utils/book';

const logger = createLogger('transfer');

const TRANSFER_QUEUE_KEY = 'openread_transfer_queue';
const RETRY_DELAY_BASE_MS = 2000;

export type TransferErrorReason =
  | 'not-authenticated'
  | 'storage-limit-reached'
  | 'storage-not-available'
  | 'library-limit-reached'
  | 'local-file-missing'
  | 'unknown';

export function classifyTransferError(errorMessage: string): {
  reason: TransferErrorReason;
  retryable: boolean;
} {
  if (errorMessage.includes('Not authenticated')) {
    return { reason: 'not-authenticated', retryable: false };
  }
  if (
    errorMessage.includes('STORAGE_LIMIT_REACHED') ||
    errorMessage.includes('Insufficient storage quota') ||
    errorMessage.includes('Storage limit reached')
  ) {
    return { reason: 'storage-limit-reached', retryable: false };
  }
  if (errorMessage.includes('STORAGE_NOT_AVAILABLE')) {
    return { reason: 'storage-not-available', retryable: false };
  }
  if (errorMessage.includes('LIBRARY_LIMIT_REACHED') || errorMessage.includes('Library limit')) {
    return { reason: 'library-limit-reached', retryable: false };
  }
  if (errorMessage.includes('Book file not uploaded')) {
    return { reason: 'local-file-missing', retryable: false };
  }

  return { reason: 'unknown', retryable: true };
}

interface PersistedQueueData {
  transfers: Record<string, TransferItem>;
  isQueuePaused: boolean;
}

class TransferManager {
  private static instance: TransferManager;
  private appService: AppService | null = null;
  private isProcessing = false;
  private abortControllers: Map<string, AbortController> = new Map();
  private isInitialized = false;
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
  ): Promise<void> {
    if (this.isInitialized) return;

    this.appService = appService;
    this.getLibrary = getLibrary;
    this.updateBook = updateBook;
    this._ = translationFn;
    await this.loadPersistedQueue();
    this.isInitialized = true;

    // Start processing queue
    this.processQueue();
  }

  isReady(): boolean {
    return this.isInitialized && this.appService !== null;
  }

  queueUpload(book: Book, priority: number = 10, isBackground: boolean = false): string | null {
    if (!isUserCloudUploadEligible(book)) return null;

    const store = useTransferStore.getState();

    // Check if already queued or in progress
    const existing = store.getTransferByBookHash(book.hash, 'upload');
    if (existing) {
      return existing.id;
    }

    const transferId = store.addTransfer(book.hash, book.title, 'upload', priority, isBackground);
    this.persistQueue();
    this.processQueue();
    return transferId;
  }

  queueDownload(book: Book, priority: number = 10): string | null {
    const store = useTransferStore.getState();

    const existing = store.getTransferByBookHash(book.hash, 'download');
    if (existing) {
      return existing.id;
    }

    const transferId = store.addTransfer(book.hash, book.title, 'download', priority);
    this.persistQueue();
    this.processQueue();
    return transferId;
  }

  queueDelete(book: Book, priority: number = 10, isBackground: boolean = false): string | null {
    const store = useTransferStore.getState();

    const existing = store.getTransferByBookHash(book.hash, 'delete');
    if (existing) {
      return existing.id;
    }

    const transferId = store.addTransfer(book.hash, book.title, 'delete', priority, isBackground);
    this.persistQueue();
    this.processQueue();
    return transferId;
  }

  queueBatchUploads(books: Book[], priority: number = 10, isBackground: boolean = false): string[] {
    return books
      .filter(isUserCloudUploadEligible)
      .map((book) => this.queueUpload(book, priority, isBackground))
      .filter((id): id is string => id !== null);
  }

  cancelTransfer(transferId: string): void {
    const controller = this.abortControllers.get(transferId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(transferId);
    }

    useTransferStore.getState().setTransferStatus(transferId, 'cancelled');
    this.persistQueue();
  }

  retryTransfer(transferId: string): void {
    const store = useTransferStore.getState();
    store.retryTransfer(transferId);
    this.persistQueue();
    this.processQueue();
  }

  retryAllFailed(): void {
    const store = useTransferStore.getState();
    const failed = store.getFailedTransfers();
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

    const pending = store.getPendingTransfers();
    const activeCount = store.getActiveTransfers().length;
    const maxConcurrent = store.maxConcurrent;

    const availableSlots = maxConcurrent - activeCount;
    if (availableSlots <= 0 || pending.length === 0) return;

    // Sort by priority (lower = higher priority) then by createdAt
    const sortedPending = [...pending].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.createdAt - b.createdAt;
    });

    const toProcess = sortedPending.slice(0, availableSlots);

    await Promise.all(toProcess.map((transfer) => this.executeTransfer(transfer)));

    // Check if more items to process
    const newStore = useTransferStore.getState();
    if (newStore.getPendingTransfers().length > 0 && !newStore.isQueuePaused) {
      setTimeout(() => this.processQueue(), 100);
    }
  }

  private async executeTransfer(transfer: TransferItem): Promise<void> {
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

    try {
      const library = this.getLibrary();
      const book = library.find((b) => b.hash === transfer.bookHash);

      if (!book) {
        throw new Error(_('Book not found in library'));
      }

      if (transfer.type === 'upload') {
        if (!isUserCloudUploadEligible(book)) {
          store.setTransferStatus(transfer.id, 'completed');
          return;
        }
        await this.appService.uploadBook(book, progressHandler);
        await this.updateBook(book);
      } else if (transfer.type === 'download') {
        await this.appService.downloadBook(book, false, false, progressHandler);
        book.downloadedAt = Date.now();
        book.coverImageUrl =
          (await this.appService.generateCoverImageUrl(book)) ?? book.coverImageUrl;
        await this.updateBook(book);
      } else if (transfer.type === 'delete') {
        await this.appService.deleteBook(book, 'cloud');
        await this.updateBook(book);
      }

      useTransferStore.getState().setTransferStatus(transfer.id, 'completed');
      eventDispatcher.dispatch('transfer-completed', { book, type: transfer.type });

      const successMessages = {
        upload: _('Book uploaded: {{title}}', { title: transfer.bookTitle }),
        download: _('Book downloaded: {{title}}', { title: transfer.bookTitle }),
        delete: _('Deleted cloud backup of the book: {{title}}', { title: transfer.bookTitle }),
      };

      if (!transfer.isBackground) {
        eventDispatcher.dispatch('toast', {
          type: 'info',
          timeout: 2000,
          message: successMessages[transfer.type],
        });
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        // Already cancelled, don't update status
        return;
      }

      const errorMessage = error instanceof Error ? error.message : _('Unknown error');
      const currentStore = useTransferStore.getState();
      const currentTransfer = currentStore.transfers[transfer.id];

      const errorClassification = classifyTransferError(errorMessage);

      if (
        errorClassification.retryable &&
        currentTransfer &&
        currentTransfer.retryCount < currentTransfer.maxRetries
      ) {
        // Schedule retry with exponential backoff
        const delay = RETRY_DELAY_BASE_MS * Math.pow(2, currentTransfer.retryCount);
        currentStore.incrementRetryCount(transfer.id);
        currentStore.setTransferStatus(
          transfer.id,
          'pending',
          `Retry ${currentTransfer.retryCount + 1}/${currentTransfer.maxRetries}`,
        );

        setTimeout(() => {
          this.processQueue();
        }, delay);
      } else {
        if (!transfer.isBackground) {
          const errorMessages = {
            'not-authenticated': _('Please log in to continue'),
            'storage-limit-reached': _('Storage limit reached. Upgrade your plan or remove files.'),
            'storage-not-available': _('Cloud storage is not available on your current plan.'),
            'library-limit-reached': _('Library limit reached. Upgrade for unlimited library.'),
            'local-file-missing': _(
              'Book file is not available on this device. Re-download or re-import it before cloud upload.',
            ),
            unknown:
              transfer.type === 'upload'
                ? _('Failed to upload book: {{title}}', { title: transfer.bookTitle })
                : transfer.type === 'download'
                  ? _('Failed to download book: {{title}}', { title: transfer.bookTitle })
                  : _('Failed to delete cloud backup of the book: {{title}}', {
                      title: transfer.bookTitle,
                    }),
          };

          eventDispatcher.dispatch('toast', {
            type: 'error',
            message: errorMessages[errorClassification.reason],
          });
        }

        useTransferStore.getState().setTransferStatus(transfer.id, 'failed', errorMessage);
      }
    } finally {
      this.abortControllers.delete(transfer.id);

      const currentStore = useTransferStore.getState();
      currentStore.setActiveCount(Math.max(0, currentStore.getActiveTransfers().length));
      this.persistQueue();

      // Continue processing
      setTimeout(() => this.processQueue(), 100);
    }
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
