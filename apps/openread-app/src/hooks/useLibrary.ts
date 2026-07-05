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
  const [libraryLoaded, setLibraryLoaded] = useState(false);

  useEffect(() => {
    const userId = user?.id ?? null;
    let cancelled = false;

    const initLibrary = async () => {
      try {
        if (!userId) {
          await transitionAccountLibraryOwner(null, envConfig);
          if (!cancelled) setLibraryLoaded(true);
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

        // Auth lifecycle may restore a local session before this hook mounts.
        // Starting here is idempotent and keeps worker ownership with account-library lifecycle.
        syncWorker.start(userId);
        await syncWorker.pullNow('books');

        const currentState = useLibraryStore.getState();
        const visibleCount = currentState.getVisibleLibrary().length;
        if (syncWorker.status.error && visibleCount === 0) {
          setSyncError(syncWorker.status.error);
          setLibraryLoaded(false);
          return;
        }

        setSyncError(null);
        persistLibraryPaintProjection(userId, currentState.library);
        setLibraryLoaded(true);

        if (currentBeforeDisk.length > 0 && currentState.library.length === 0) {
          logger.warn('Account library became empty after initialization', { userId });
        }
      } catch (error) {
        logger.error('Failed to initialize library', error);
        const message = error instanceof Error ? error.message : 'Failed to initialize library';
        setSyncError(message);
        setLibraryLoaded(useLibraryStore.getState().getVisibleLibrary().length > 0);
      } finally {
        if (!cancelled) {
          setIsReconciling(false);
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
    user?.id,
  ]);

  const visibleBookCount = useLibraryStore((state) => state.getVisibleLibrary().length);
  const hasAccountScopedProjection = Boolean(
    user?.id && storeLibraryLoaded && libraryOwnerUserId === user.id && visibleBookCount > 0,
  );
  const authenticatedEmptyPending = Boolean(user?.id && visibleBookCount === 0 && isReconciling);
  const authenticatedEmptyFailed = Boolean(user?.id && visibleBookCount === 0 && syncError);

  return {
    libraryLoaded:
      hasAccountScopedProjection ||
      (!authenticatedEmptyPending &&
        !authenticatedEmptyFailed &&
        (libraryLoaded || storeLibraryLoaded)),
  };
};
