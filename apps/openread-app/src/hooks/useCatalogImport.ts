'use client';

import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useEnv } from '@/context/EnvContext';
import { platform } from '@/services/platform/client';
import { createLogger } from '@/utils/logger';
import { eventDispatcher } from '@/utils/event';
import { syncWorker } from '@/services/sync/syncWorker';
import { enqueueBooksForSync, handleFireAndForgetSyncEnqueue } from '@/services/sync/helpers';
import { importDeviceFetchedCatalogBook } from '@/services/catalogDeviceFetch';
import { useLibraryStore } from '@/store/libraryStore';
import { useLibraryLimit } from '@/hooks/useLibraryLimit';
import { canExecuteCatalogUserDeviceFetchMode } from '@/services/catalogAddMode';
import type { ImportState } from '@/types/catalog';
import type { CatalogCachedImportIntentResponse } from '@openread/types';

export type { ImportStatus, ImportState } from '@/types/catalog';

const logger = createLogger('catalog-import');

export type CatalogImportBlockedReason =
  | 'auth_required'
  | 'library_limit_loading'
  | 'library_full'
  | 'already_importing';

export interface CatalogImportReadiness {
  ready: boolean;
  blockedReason: CatalogImportBlockedReason | null;
  isAuthenticated: boolean;
  canAddBook: boolean;
  libraryLimit: number | null;
  currentCount: number;
  isLibraryLimitLoading: boolean;
  currentStatus: ImportState['status'];
}

export interface UseCatalogImportReturn {
  importStates: Record<string, ImportState>;
  importBook: (catalogBookId: string, iaIdentifier?: string) => Promise<void>;
  getImportState: (catalogBookId: string) => ImportState;
  getImportReadiness: (catalogBookId: string) => CatalogImportReadiness;
  resetImportState: (catalogBookId: string) => void;
}

function cachedIntentReadyState(intent: CatalogCachedImportIntentResponse): Partial<ImportState> {
  return {
    status: 'ready',
    mode: 'cached',
    phase: 'opening',
    statusMessage: 'Ready to open',
    progress: 100,
    bookId: intent.bookId,
    bookHash: intent.bookHash,
    downloadUrl: intent.downloadUrl,
  };
}

function hasVisibleLibraryBook(bookHash: string): boolean {
  return useLibraryStore
    .getState()
    .library.some((book) => book.hash === bookHash && !book.deletedAt);
}

interface ResolveCatalogImportReadinessInput {
  token: string | null;
  user: unknown;
  current: ImportState;
  canAddBook: boolean;
  libraryLimit: number | null;
  currentCount: number;
  isLibraryLimitLoading: boolean;
}

export function resolveCatalogImportReadiness({
  token,
  user,
  current,
  canAddBook,
  libraryLimit,
  currentCount,
  isLibraryLimitLoading,
}: ResolveCatalogImportReadinessInput): CatalogImportReadiness {
  const currentStatus = current.status;
  const base = {
    isAuthenticated: Boolean(token && user),
    canAddBook,
    libraryLimit,
    currentCount,
    isLibraryLimitLoading,
    currentStatus,
  };

  if (!base.isAuthenticated) {
    return { ...base, ready: false, blockedReason: 'auth_required' };
  }

  if (currentStatus === 'importing') {
    return { ...base, ready: false, blockedReason: 'already_importing' };
  }

  if (isLibraryLimitLoading) {
    return { ...base, ready: false, blockedReason: 'library_limit_loading' };
  }

  if (!canAddBook) {
    return { ...base, ready: false, blockedReason: 'library_full' };
  }

  return { ...base, ready: true, blockedReason: null };
}

async function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

async function syncCachedCatalogBookIntoLibrary(
  bookHash: string,
  catalogBookId: string,
  signal: AbortSignal,
): Promise<void> {
  const retryDelays = [0, 1_000, 2_000, 4_000] as const;
  let lastError: unknown;

  for (const delay of retryDelays) {
    if (delay > 0) await wait(delay, signal);
    if (signal.aborted) return;

    try {
      await syncWorker.pullNow('books');
      if (hasVisibleLibraryBook(bookHash)) return;
    } catch (syncError) {
      lastError = syncError;
      logger.warn('Cached catalog import library sync failed', { catalogBookId, syncError });
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(
    'Book was added, but Library sync has not made it visible yet. Please try again.',
  );
}

export function useCatalogImport(): UseCatalogImportReturn {
  const { token, user } = useAuth();
  const { appService } = useEnv();
  const {
    canAddBook,
    libraryLimit,
    currentCount,
    isLoading: isLibraryLimitLoading,
  } = useLibraryLimit();
  const [importStates, setImportStates] = useState<Record<string, ImportState>>({});
  const abortRefs = useRef<Record<string, AbortController>>({});

  const updateState = useCallback((bookId: string, update: Partial<ImportState>) => {
    setImportStates((prev) => ({
      ...prev,
      [bookId]: { ...prev[bookId]!, ...update } as ImportState,
    }));
  }, []);

  const importBook = useCallback(
    async (catalogBookId: string, iaIdentifier?: string) => {
      const current = importStates[catalogBookId] ?? { status: 'idle' };
      const readiness = resolveCatalogImportReadiness({
        token,
        user,
        current,
        canAddBook,
        libraryLimit,
        currentCount,
        isLibraryLimitLoading,
      });

      if (!readiness.ready) {
        if (readiness.blockedReason === 'auth_required') {
          eventDispatcher.dispatch('toast', {
            message: 'Sign in to add books to your library',
            type: 'warning',
          });
        } else if (readiness.blockedReason === 'library_limit_loading') {
          eventDispatcher.dispatch('toast', {
            message: 'Checking your library limit. Please try again.',
            type: 'warning',
          });
        } else if (readiness.blockedReason === 'library_full') {
          eventDispatcher.dispatch('toast', {
            message: `Library full (${libraryLimit} books). Upgrade for unlimited.`,
            type: 'warning',
          });
        }
        return;
      }

      if (abortRefs.current[catalogBookId]) {
        abortRefs.current[catalogBookId]!.abort();
      }
      const controller = new AbortController();
      abortRefs.current[catalogBookId] = controller;

      updateState(catalogBookId, {
        status: 'importing',
        progress: 5,
        phase: 'requesting_intent',
        statusMessage: 'Preparing Add...',
        error: undefined,
      });

      try {
        if (iaIdentifier) {
          throw new Error('OpenRead catalog Add is available from canonical catalog rows only.');
        }

        const intent = await platform.catalog.getImportIntent(catalogBookId, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (intent.mode === 'cached') {
          updateState(catalogBookId, {
            status: 'importing',
            mode: 'cached',
            phase: 'importing',
            statusMessage: 'Updating library...',
            progress: 85,
          });
          if (!intent.bookHash) {
            throw new Error('Catalog Add did not return a canonical Library book reference.');
          }
          await syncCachedCatalogBookIntoLibrary(intent.bookHash, catalogBookId, controller.signal);
          if (controller.signal.aborted) return;

          updateState(catalogBookId, cachedIntentReadyState(intent));
          eventDispatcher.dispatch('toast', {
            message: 'Book added to your library',
            type: 'success',
          });
          return;
        }

        updateState(catalogBookId, {
          mode: 'user_device_fetch',
          phase: 'downloading',
          progress: 20,
          statusMessage: 'Downloading from source...',
        });

        if (!canExecuteCatalogUserDeviceFetchMode()) {
          throw new Error('This title can only be added from a supported desktop app.');
        }

        if (!appService) throw new Error('App service is not ready. Please try again.');

        const { library, setLibrary } = useLibraryStore.getState();
        const importedBook = await importDeviceFetchedCatalogBook({
          requestedCatalogBookId: catalogBookId,
          intent,
          appService,
          library,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const latestLibrary = [...useLibraryStore.getState().library];
        setLibrary(latestLibrary);
        await appService.saveLibraryBooks(latestLibrary);
        handleFireAndForgetSyncEnqueue(enqueueBooksForSync([importedBook]), {
          source: 'catalog-import.userDeviceFetch',
          mutationType: 'book',
          operation: 'upsert',
          hasBookHash: Boolean(importedBook.hash),
          count: 1,
        });
        updateState(catalogBookId, {
          status: 'ready',
          mode: 'user_device_fetch',
          phase: 'opening',
          progress: 100,
          statusMessage: 'Ready to open',
          bookHash: importedBook.hash,
        });
        eventDispatcher.dispatch('toast', {
          message: 'Book added to your library',
          type: 'success',
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;

        const errorMessage = err instanceof Error ? err.message : 'Import failed';
        logger.error('Import failed', { catalogBookId, iaIdentifier, error: err });
        updateState(catalogBookId, { status: 'error', progress: 0, error: errorMessage });
        eventDispatcher.dispatch('toast', {
          message: errorMessage,
          type: 'error',
        });
      } finally {
        if (abortRefs.current[catalogBookId] === controller) {
          delete abortRefs.current[catalogBookId];
        }
      }
    },
    [
      token,
      user,
      importStates,
      updateState,
      canAddBook,
      libraryLimit,
      currentCount,
      isLibraryLimitLoading,
      appService,
    ],
  );

  const getImportState = useCallback(
    (catalogBookId: string): ImportState => {
      return importStates[catalogBookId] || { status: 'idle' };
    },
    [importStates],
  );

  const getImportReadiness = useCallback(
    (catalogBookId: string): CatalogImportReadiness =>
      resolveCatalogImportReadiness({
        token,
        user,
        current: importStates[catalogBookId] ?? { status: 'idle' },
        canAddBook,
        libraryLimit,
        currentCount,
        isLibraryLimitLoading,
      }),
    [token, user, importStates, canAddBook, libraryLimit, currentCount, isLibraryLimitLoading],
  );

  const resetImportState = useCallback((catalogBookId: string) => {
    if (abortRefs.current[catalogBookId]) {
      abortRefs.current[catalogBookId]!.abort();
      delete abortRefs.current[catalogBookId];
    }
    setImportStates((prev) => {
      const next = { ...prev };
      delete next[catalogBookId];
      return next;
    });
  }, []);

  return { importStates, importBook, getImportState, getImportReadiness, resetImportState };
}
