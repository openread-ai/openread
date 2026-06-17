'use client';

import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { platform } from '@/services/platform/client';
import { createLogger } from '@/utils/logger';
import { eventDispatcher } from '@/utils/event';
import { syncWorker } from '@/services/sync/syncWorker';
import { useLibraryLimit } from '@/hooks/useLibraryLimit';
import type { ImportState } from '@/types/catalog';

export type { ImportStatus, ImportState } from '@/types/catalog';

const logger = createLogger('catalog-import');

export interface UseCatalogImportReturn {
  importStates: Record<string, ImportState>;
  importBook: (catalogBookId: string, iaIdentifier?: string) => Promise<void>;
  getImportState: (catalogBookId: string) => ImportState;
  resetImportState: (catalogBookId: string) => void;
}

// ── Constants ───────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 30;

// ── Hook ────────────────────────────────────────────────

export function useCatalogImport(): UseCatalogImportReturn {
  const { token, user } = useAuth();
  const { canAddBook, libraryLimit } = useLibraryLimit();
  const [importStates, setImportStates] = useState<Record<string, ImportState>>({});
  const pollAbortRefs = useRef<Record<string, AbortController>>({});

  const updateState = useCallback((bookId: string, update: Partial<ImportState>) => {
    setImportStates((prev) => ({
      ...prev,
      [bookId]: { ...prev[bookId]!, ...update } as ImportState,
    }));
  }, []);

  const pollStatus = useCallback(
    async (
      stateBookId: string,
      statusCatalogBookId: string,
      controller: AbortController,
    ): Promise<boolean> => {
      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        if (controller.signal.aborted) return false;

        // Update progress (capped at 90% during polling — final 100% on ready)
        const progress = Math.min(10 + Math.round((attempt / MAX_POLL_ATTEMPTS) * 80), 90);
        updateState(stateBookId, { progress });

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if (controller.signal.aborted) return false;

        try {
          const data = await platform.catalog.getImportStatus(statusCatalogBookId, {
            signal: controller.signal,
          });
          if (data.caching_status === 'cached') {
            return true;
          }
          if (data.caching_status === 'failed') {
            return false;
          }
        } catch (err) {
          if (controller.signal.aborted) return false;
          logger.warn('Poll status error', { catalogBookId: statusCatalogBookId, error: err });
        }
      }
      return false; // Timeout
    },
    [updateState],
  );

  const importBook = useCallback(
    async (catalogBookId: string, iaIdentifier?: string) => {
      if (!token || !user) {
        eventDispatcher.dispatch('toast', {
          message: 'Sign in to add books to your library',
          type: 'warning',
        });
        return;
      }

      if (!canAddBook) {
        eventDispatcher.dispatch('toast', {
          message: `Library full (${libraryLimit} books). Upgrade for unlimited.`,
          type: 'warning',
        });
        return;
      }

      // Prevent duplicate imports
      const current = importStates[catalogBookId];
      if (current?.status === 'importing') return;

      // Cancel any existing poll for this book
      if (pollAbortRefs.current[catalogBookId]) {
        pollAbortRefs.current[catalogBookId]!.abort();
      }
      const controller = new AbortController();
      pollAbortRefs.current[catalogBookId] = controller;

      updateState(catalogBookId, { status: 'importing', progress: 5, error: undefined });

      try {
        const data = iaIdentifier
          ? await platform.catalog.importInternetArchiveBook(iaIdentifier, {
              signal: controller.signal,
            })
          : await platform.catalog.importBook(catalogBookId, { signal: controller.signal });

        if (data.status === 'ready') {
          updateState(catalogBookId, {
            status: 'ready',
            progress: 100,
            bookId: data.book_id,
            bookHash: data.book_hash,
            downloadUrl: data.download_url,
          });
          syncWorker.pullNow('books').catch(() => {});
          eventDispatcher.dispatch('toast', {
            message: 'Book added to your library',
            type: 'success',
          });
          return;
        }

        if (data.status === 'preparing') {
          updateState(catalogBookId, { progress: 10 });
          const statusCatalogBookId = data.catalog_book_id ?? catalogBookId;
          const cached = await pollStatus(catalogBookId, statusCatalogBookId, controller);

          if (controller.signal.aborted) return;

          if (cached) {
            const retryData = await platform.catalog.importBook(statusCatalogBookId, {
              signal: controller.signal,
            });
            updateState(catalogBookId, {
              status: 'ready',
              progress: 100,
              bookId: retryData.book_id,
              bookHash: retryData.book_hash,
              downloadUrl: retryData.download_url,
            });
            syncWorker.pullNow('books').catch(() => {});
            eventDispatcher.dispatch('toast', {
              message: 'Book added to your library',
              type: 'success',
            });
            return;
          }

          throw new Error('Import timed out. Please try again later.');
        }
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
        if (pollAbortRefs.current[catalogBookId] === controller) {
          delete pollAbortRefs.current[catalogBookId];
        }
      }
    },
    [token, user, importStates, updateState, pollStatus, canAddBook, libraryLimit],
  );

  const getImportState = useCallback(
    (catalogBookId: string): ImportState => {
      return importStates[catalogBookId] || { status: 'idle' };
    },
    [importStates],
  );

  const resetImportState = useCallback((catalogBookId: string) => {
    if (pollAbortRefs.current[catalogBookId]) {
      pollAbortRefs.current[catalogBookId]!.abort();
      delete pollAbortRefs.current[catalogBookId];
    }
    setImportStates((prev) => {
      const next = { ...prev };
      delete next[catalogBookId];
      return next;
    });
  }, []);

  return { importStates, importBook, getImportState, resetImportState };
}
