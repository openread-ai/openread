'use client';

import { useCallback, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLibraryLifecycle } from '@/context/LibraryLifecycleContext';
import { useLibraryLimit } from '@/hooks/useLibraryLimit';
import {
  activateCatalogAddUser,
  resetCatalogAdd,
  resumeCatalogAdds,
  startCatalogAdd,
} from '@/services/catalogAddCoordinator';
import { resolveBookAvailability } from '@/services/libraryBookAvailability';
import { useCatalogAddStore } from '@/store/catalogAddStore';
import { useLibraryStore } from '@/store/libraryStore';
import { eventDispatcher } from '@/utils/event';
import type { ImportState } from '@/types/catalog';

export type { ImportStatus, ImportState } from '@/types/catalog';

export function canOpenImportedBook(
  state: ImportState,
): state is ImportState & { bookHash: string } {
  return state.status === 'ready' && Boolean(state.bookHash);
}

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

export function resolveCatalogImportReadiness(input: {
  token: string | null;
  user: unknown;
  current: ImportState;
  canAddBook: boolean;
  libraryLimit: number | null;
  currentCount: number;
  isLibraryLimitLoading: boolean;
}): CatalogImportReadiness {
  const base = {
    isAuthenticated: Boolean(input.token && input.user),
    canAddBook: input.canAddBook,
    libraryLimit: input.libraryLimit,
    currentCount: input.currentCount,
    isLibraryLimitLoading: input.isLibraryLimitLoading,
    currentStatus: input.current.status,
  };
  if (!base.isAuthenticated) return { ...base, ready: false, blockedReason: 'auth_required' };
  if (base.currentStatus === 'importing')
    return { ...base, ready: false, blockedReason: 'already_importing' };
  if (base.isLibraryLimitLoading)
    return { ...base, ready: false, blockedReason: 'library_limit_loading' };
  if (!base.canAddBook) return { ...base, ready: false, blockedReason: 'library_full' };
  return { ...base, ready: true, blockedReason: null };
}

export function useCatalogImport(): UseCatalogImportReturn {
  const { token, user } = useAuth();
  const {
    canAddBook,
    libraryLimit,
    currentCount,
    isLoading: isLibraryLimitLoading,
  } = useLibraryLimit();
  const importStates = useCatalogAddStore((state) => state.importStates);
  const library = useLibraryStore((state) => state.library);
  const { libraryLoaded, libraryReconciliationSettled } = useLibraryLifecycle();

  useEffect(() => {
    if (user) resumeCatalogAdds(user.id);
    else activateCatalogAddUser(null);
  }, [user]);

  const importBook = useCallback(
    async (catalogBookId: string, iaIdentifier?: string) => {
      const current = useCatalogAddStore.getState().importStates[catalogBookId] ?? {
        status: 'idle',
      };
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
        const message =
          readiness.blockedReason === 'auth_required'
            ? 'Sign in to add books to your library'
            : readiness.blockedReason === 'library_limit_loading'
              ? 'Checking your library limit. Please try again.'
              : readiness.blockedReason === 'library_full'
                ? `Library full (${libraryLimit} books). Upgrade for unlimited.`
                : null;
        if (message) eventDispatcher.dispatch('toast', { message, type: 'warning' });
        return;
      }
      if (!user) return;
      if (iaIdentifier) {
        eventDispatcher.dispatch('toast', {
          message: 'Internet Archive Add is not part of the OAPEN Catalog Add path.',
          type: 'error',
        });
        return;
      }
      await startCatalogAdd(user.id, catalogBookId).catch(() => undefined);
    },
    [canAddBook, currentCount, isLibraryLimitLoading, libraryLimit, token, user],
  );

  const getImportState = useCallback(
    (catalogBookId: string): ImportState => {
      const current = importStates[catalogBookId] ?? { status: 'idle' };
      if (current.status !== 'ready') return current;

      const availability = resolveBookAvailability({
        bookHash: current.bookHash,
        catalogBookId,
        library,
        libraryLoaded,
        libraryReconciliationSettled,
      });
      return availability.state === 'absent' ? { status: 'idle' } : current;
    },
    [importStates, library, libraryLoaded, libraryReconciliationSettled],
  );
  const getImportReadiness = useCallback(
    (catalogBookId: string) =>
      resolveCatalogImportReadiness({
        token,
        user,
        current: getImportState(catalogBookId),
        canAddBook,
        libraryLimit,
        currentCount,
        isLibraryLimitLoading,
      }),
    [canAddBook, currentCount, getImportState, isLibraryLimitLoading, libraryLimit, token, user],
  );
  const resetImportState = useCallback(
    (catalogBookId: string) => {
      if (user) resetCatalogAdd(user.id, catalogBookId);
      else useCatalogAddStore.getState().reset(catalogBookId);
    },
    [user],
  );

  return { importStates, importBook, getImportState, getImportReadiness, resetImportState };
}
