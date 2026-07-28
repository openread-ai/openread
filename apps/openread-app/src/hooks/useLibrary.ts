import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useEnv } from '@/context/EnvContext';
import {
  persistLibraryPaintProjection,
  transitionAccountLibraryOwner,
} from '@/services/accountLibraryLifecycle';
import { syncWorker } from '@/services/sync/syncWorker';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { settingsService } from '@/services/settings/settingsService';
import { createLogger } from '@/utils/logger';
import type { Book } from '@/types/book';

const logger = createLogger('useLibrary');

function mergeRegeneratedCoverImageUrls(currentLibrary: Book[], diskBooks: Book[]): Book[] | null {
  const diskBooksByHash = new Map(diskBooks.map((book) => [book.hash, book]));
  let changed = false;

  const merged = currentLibrary.map((book) => {
    if (book.coverImageUrl) return book;

    const diskBook = diskBooksByHash.get(book.hash);
    if (!diskBook?.coverImageUrl) return book;

    changed = true;
    return { ...book, coverImageUrl: diskBook.coverImageUrl };
  });

  return changed ? merged : null;
}

export const useLibrary = () => {
  const { envConfig } = useEnv();
  const { user } = useAuth();
  const {
    setLibrary,
    setLibraryOwnerUserId,
    setIsReconciling,
    setSyncError,
    libraryLoaded: storeLibraryLoaded,
    libraryOwnerUserId,
    isReconciling,
    syncError,
  } = useLibraryStore();
  const { setSettings } = useSettingsStore();
  const userId = user?.id ?? null;
  const [completedLibraryUserId, setCompletedLibraryUserId] = useState<string | null | undefined>(
    () => (userId && storeLibraryLoaded && libraryOwnerUserId === userId ? userId : undefined),
  );
  const [reconciledLibraryUserId, setReconciledLibraryUserId] = useState<string | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;

    const initLibrary = async () => {
      try {
        if (!userId) {
          await transitionAccountLibraryOwner(null, envConfig);
          if (!cancelled) setCompletedLibraryUserId(null);
          return;
        }

        setIsReconciling(true);
        setSyncError(null);

        const appService = await envConfig.getAppService();
        const settings = await settingsService.load(envConfig);
        if (cancelled) return;
        setSettings(settings);

        const { ownerMismatch } = await transitionAccountLibraryOwner(userId, envConfig);
        if (cancelled) return;

        const currentBeforeDisk = useLibraryStore.getState().library;
        const diskBooks = ownerMismatch ? [] : await appService.loadLibraryBooks();
        if (cancelled) return;

        const currentLibrary = useLibraryStore.getState().library;
        if (!ownerMismatch && currentLibrary.length === 0 && diskBooks.length > 0) {
          setLibraryOwnerUserId(userId);
          setLibrary(diskBooks);
        } else if (!ownerMismatch) {
          const mergedLibrary = mergeRegeneratedCoverImageUrls(currentLibrary, diskBooks);
          if (mergedLibrary) {
            setLibrary(mergedLibrary);
          }
        }

        // The shared authenticated Platform boundary owns this hook for platform routes;
        // the standalone Reader owns it outside that layout. Starting is idempotent per account.
        syncWorker.start(userId);
        await syncWorker.pullNow('books');
        if (cancelled) return;

        const currentState = useLibraryStore.getState();
        const visibleCount = currentState.getVisibleLibrary().length;
        if (syncWorker.status.error && visibleCount === 0) {
          setSyncError(syncWorker.status.error);
          setCompletedLibraryUserId(undefined);
          return;
        }

        setSyncError(null);
        persistLibraryPaintProjection(userId, currentState.library);
        setCompletedLibraryUserId(userId);

        if (currentBeforeDisk.length > 0 && currentState.library.length === 0) {
          logger.warn('Account library became empty after initialization', { userId });
        }
      } catch (error) {
        if (cancelled) return;
        logger.error('Failed to initialize library', error);
        const message = error instanceof Error ? error.message : 'Failed to initialize library';
        setSyncError(message);
        setCompletedLibraryUserId(
          useLibraryStore.getState().getVisibleLibrary().length > 0 ? userId : undefined,
        );
      } finally {
        if (!cancelled) {
          setIsReconciling(false);
          setReconciledLibraryUserId(userId);
        }
      }
    };

    initLibrary();
    return () => {
      cancelled = true;
    };
  }, [
    envConfig,
    setIsReconciling,
    setLibrary,
    setLibraryOwnerUserId,
    setSettings,
    setSyncError,
    userId,
  ]);

  const visibleBookCount = useLibraryStore((state) => state.getVisibleLibrary().length);
  const hasAccountScopedProjection = Boolean(
    user?.id && storeLibraryLoaded && libraryOwnerUserId === user.id && visibleBookCount > 0,
  );
  const authenticatedEmptyPending = Boolean(user?.id && visibleBookCount === 0 && isReconciling);
  const authenticatedEmptyFailed = Boolean(user?.id && visibleBookCount === 0 && syncError);

  const hasCompletedCurrentLibrary = completedLibraryUserId === userId;

  return {
    libraryLoaded:
      hasAccountScopedProjection ||
      (!authenticatedEmptyPending && !authenticatedEmptyFailed && hasCompletedCurrentLibrary),
    libraryReconciliationSettled: reconciledLibraryUserId === userId,
  };
};
