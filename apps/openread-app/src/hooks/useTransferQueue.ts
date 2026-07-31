import { useEffect, useCallback, useMemo } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from './useTranslation';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { isTransferOwnedBy, useTransferStore, TransferType } from '@/store/transferStore';
import { transferManager } from '@/services/transferManager';
import { Book } from '@/types/book';
import { hasUserBookUploadSource } from '@/utils/book';

export function useTransferQueue(
  libraryLoaded = true,
  delayInit = 0,
  libraryReconciliationSettled = false,
) {
  const { envConfig, appService } = useEnv();
  const { user } = useAuth();
  const _ = useTranslation();

  const library = useLibraryStore((state) => state.library);
  const libraryOwnerUserId = useLibraryStore((state) => state.libraryOwnerUserId);
  const activeOwnerUserId = user?.id === libraryOwnerUserId ? user.id : null;
  const queueReady = Boolean(activeOwnerUserId && libraryLoaded);
  const autoUpload = useSettingsStore((state) => state.settings.autoUpload);
  const transfers = useTransferStore((state) => state.transfers);
  const isQueuePaused = useTransferStore((state) => state.isQueuePaused);
  const visibleTransfers = useMemo(
    () =>
      activeOwnerUserId
        ? Object.values(transfers).filter((transfer) =>
            isTransferOwnedBy(transfer, activeOwnerUserId),
          )
        : [],
    [activeOwnerUserId, transfers],
  );

  useEffect(() => {
    const initManager = async () => {
      if (appService && envConfig) {
        const getLibrary = () => useLibraryStore.getState().library;
        const updateBookFn = async (book: Book) => {
          await useLibraryStore.getState().updateBook(envConfig, book);
        };
        const translationFn = _;
        await transferManager.initialize(
          appService,
          getLibrary,
          updateBookFn,
          translationFn,
          activeOwnerUserId!,
          libraryReconciliationSettled,
        );

        // Auto-upload is a durability promise, not a best-effort import-time side effect.
        // If a book was imported before the transfer manager became ready, enqueue it
        // once the manager initializes so fresh sessions can recover the book and cover from R2.
        const settings = useSettingsStore.getState().settings;
        if (settings.autoUpload !== false) {
          const sourceResults = await Promise.all(
            getLibrary().map(async (book) => ({
              book,
              canUpload: await hasUserBookUploadSource(book, appService),
            })),
          );
          const pendingUploadBooks = sourceResults
            .filter(({ canUpload }) => canUpload)
            .map(({ book }) => book);
          if (pendingUploadBooks.length > 0) {
            transferManager.recoverTerminalBackgroundUploads(pendingUploadBooks);
            transferManager.queueBatchUploads(pendingUploadBooks, 1, true);
          }
        }
      }
    };

    transferManager.setActiveOwnerUserId(activeOwnerUserId);
    if (!activeOwnerUserId || !queueReady) return;

    const timer = setTimeout(() => {
      void initManager();
    }, delayInit);
    return () => clearTimeout(timer);
  }, [
    activeOwnerUserId,
    appService,
    envConfig,
    delayInit,
    libraryReconciliationSettled,
    queueReady,
    _,
  ]);

  useEffect(() => {
    if (
      !activeOwnerUserId ||
      !queueReady ||
      autoUpload === false ||
      !transferManager.isReady() ||
      !appService
    )
      return;

    let cancelled = false;

    const queueRecoverableUploads = async () => {
      const sourceResults = await Promise.all(
        library.map(async (book) => ({
          book,
          canUpload: await hasUserBookUploadSource(book, appService),
        })),
      );
      if (cancelled) return;

      const pendingUploadBooks = sourceResults
        .filter(({ canUpload }) => canUpload)
        .map(({ book }) => book);
      if (pendingUploadBooks.length > 0) {
        transferManager.recoverTerminalBackgroundUploads(pendingUploadBooks);
        transferManager.queueBatchUploads(pendingUploadBooks, 1, true);
      }
    };

    queueRecoverableUploads();

    return () => {
      cancelled = true;
    };
  }, [activeOwnerUserId, appService, autoUpload, library, queueReady]);

  const queueUpload = useCallback((book: Book, priority?: number) => {
    return transferManager.queueUpload(book, priority);
  }, []);

  const queueDownload = useCallback((book: Book, priority?: number) => {
    return transferManager.queueDownload(book, priority);
  }, []);

  const queueBatchUploads = useCallback((books: Book[], priority?: number) => {
    return transferManager.queueBatchUploads(books, priority);
  }, []);

  const cancelTransfer = useCallback((transferId: string) => {
    transferManager.cancelTransfer(transferId);
  }, []);

  const retryTransfer = useCallback((transferId: string) => {
    transferManager.retryTransfer(transferId);
  }, []);

  const retryAllFailed = useCallback(() => {
    transferManager.retryAllFailed();
  }, []);

  const pauseQueue = useCallback(() => {
    transferManager.pauseQueue();
  }, []);

  const resumeQueue = useCallback(() => {
    transferManager.resumeQueue();
  }, []);

  const clearCompleted = useCallback(() => {
    if (!activeOwnerUserId) return;
    const store = useTransferStore.getState();
    Object.values(store.transfers)
      .filter(
        (transfer) =>
          isTransferOwnedBy(transfer, activeOwnerUserId) && transfer.status === 'completed',
      )
      .forEach((transfer) => store.removeTransfer(transfer.id));
  }, [activeOwnerUserId]);

  const clearFailed = useCallback(() => {
    if (!activeOwnerUserId) return;
    const store = useTransferStore.getState();
    Object.values(store.transfers)
      .filter(
        (transfer) =>
          isTransferOwnedBy(transfer, activeOwnerUserId) &&
          (transfer.status === 'failed' || transfer.status === 'cancelled'),
      )
      .forEach((transfer) => store.removeTransfer(transfer.id));
  }, [activeOwnerUserId]);

  const getTransferProgress = useCallback(
    (bookHash: string, type: TransferType) => {
      if (!activeOwnerUserId) return undefined;
      return Object.values(useTransferStore.getState().transfers).find(
        (transfer) =>
          isTransferOwnedBy(transfer, activeOwnerUserId) &&
          transfer.bookHash === bookHash &&
          transfer.type === type &&
          (transfer.status === 'pending' || transfer.status === 'in_progress'),
      );
    },
    [activeOwnerUserId],
  );

  const stats = useMemo(
    () => ({
      pending: visibleTransfers.filter((transfer) => transfer.status === 'pending').length,
      active: visibleTransfers.filter((transfer) => transfer.status === 'in_progress').length,
      completed: visibleTransfers.filter((transfer) => transfer.status === 'completed').length,
      failed: visibleTransfers.filter(
        (transfer) => transfer.status === 'failed' || transfer.status === 'cancelled',
      ).length,
      total: visibleTransfers.length,
    }),
    [visibleTransfers],
  );

  const pendingTransfers = useMemo(
    () => visibleTransfers.filter((transfer) => transfer.status === 'pending'),
    [visibleTransfers],
  );

  const activeTransfers = useMemo(
    () => visibleTransfers.filter((transfer) => transfer.status === 'in_progress'),
    [visibleTransfers],
  );

  const failedTransfers = useMemo(
    () =>
      visibleTransfers.filter(
        (transfer) => transfer.status === 'failed' || transfer.status === 'cancelled',
      ),
    [visibleTransfers],
  );

  const completedTransfers = useMemo(
    () => visibleTransfers.filter((transfer) => transfer.status === 'completed'),
    [visibleTransfers],
  );

  const hasActiveTransfers = useMemo(() => {
    return pendingTransfers.length > 0 || activeTransfers.length > 0;
  }, [pendingTransfers, activeTransfers]);

  return {
    transfers: visibleTransfers,
    isQueuePaused,
    stats,
    pendingTransfers,
    activeTransfers,
    failedTransfers,
    completedTransfers,
    hasActiveTransfers,

    queueUpload,
    queueDownload,
    queueBatchUploads,
    cancelTransfer,
    retryTransfer,
    retryAllFailed,
    pauseQueue,
    resumeQueue,
    clearCompleted,
    clearFailed,
    getTransferProgress,
  };
}
