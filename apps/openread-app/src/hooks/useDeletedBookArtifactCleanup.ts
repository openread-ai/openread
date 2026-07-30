'use client';

import { useEffect, useMemo, useRef } from 'react';

import { useAuth } from '@/context/AuthContext';
import { useEnv } from '@/context/EnvContext';
import { clientAuth } from '@/services/auth/clientAuth';
import { cleanupDeletedBookArtifacts } from '@/services/deletedBookArtifactCleanup';
import { useLibraryStore } from '@/store/libraryStore';
import { useReaderStore } from '@/store/readerStore';
import { useTransferStore } from '@/store/transferStore';

interface CleanupRequest {
  ownerUserId: string;
  libraryReconciliationSettled: boolean;
}

export function useDeletedBookArtifactCleanup(
  libraryLoaded: boolean,
  libraryReconciliationSettled: boolean,
): void {
  const { user } = useAuth();
  const { appService } = useEnv();
  const library = useLibraryStore((state) => state.library);
  const libraryOwnerUserId = useLibraryStore((state) => state.libraryOwnerUserId);
  const isReconciling = useLibraryStore((state) => state.isReconciling);
  const transfers = useTransferStore((state) => state.transfers);
  const openReaderBookKeys = useReaderStore((state) => state.bookKeys);
  const runningRef = useRef(false);
  const pendingRef = useRef<CleanupRequest | null>(null);
  const cleanupEligibilityRef = useRef(false);

  useEffect(() => {
    cleanupEligibilityRef.current = Boolean(
      user?.id &&
      user.id === libraryOwnerUserId &&
      libraryLoaded &&
      libraryReconciliationSettled &&
      !isReconciling,
    );
  }, [isReconciling, libraryLoaded, libraryOwnerUserId, libraryReconciliationSettled, user?.id]);

  const libraryEligibility = useMemo(
    () =>
      library
        .map((book) => `${book.hash}:${book.deletedAt ?? ''}`)
        .sort()
        .join('|'),
    [library],
  );
  const transferEligibility = useMemo(
    () =>
      Object.values(transfers)
        .map(
          (transfer) =>
            `${transfer.id}:${transfer.ownerUserId ?? ''}:${transfer.bookHash}:${transfer.status}`,
        )
        .sort()
        .join('|'),
    [transfers],
  );
  const openReaderEligibility = useMemo(
    () => [...openReaderBookKeys].sort().join('|'),
    [openReaderBookKeys],
  );

  useEffect(() => {
    const ownerUserId = user?.id;
    if (
      !appService ||
      !ownerUserId ||
      ownerUserId !== libraryOwnerUserId ||
      !libraryLoaded ||
      !libraryReconciliationSettled ||
      isReconciling
    ) {
      pendingRef.current = null;
      return;
    }

    pendingRef.current = {
      ownerUserId,
      libraryReconciliationSettled,
    };
    if (runningRef.current) return;
    runningRef.current = true;

    void (async () => {
      try {
        while (pendingRef.current) {
          const request = pendingRef.current;
          pendingRef.current = null;
          await cleanupDeletedBookArtifacts({
            appService,
            library: useLibraryStore.getState().library,
            ownerUserId: request.ownerUserId,
            isOwnerCurrent: () => {
              const currentUserId = clientAuth.getSnapshot()?.user.id ?? null;
              const state = useLibraryStore.getState();
              return (
                cleanupEligibilityRef.current &&
                currentUserId === request.ownerUserId &&
                state.libraryOwnerUserId === request.ownerUserId &&
                !state.isReconciling
              );
            },
            getCurrentState: () => {
              const libraryState = useLibraryStore.getState();
              return {
                library: libraryState.library,
                libraryLoaded: libraryState.libraryLoaded,
                libraryReconciliationSettled:
                  request.libraryReconciliationSettled && !libraryState.isReconciling,
                transfers: Object.values(useTransferStore.getState().transfers),
                openReaderBookKeys: useReaderStore.getState().bookKeys,
              };
            },
          });
        }
      } finally {
        runningRef.current = false;
      }
    })();
  }, [
    appService,
    isReconciling,
    libraryEligibility,
    libraryLoaded,
    libraryOwnerUserId,
    libraryReconciliationSettled,
    openReaderEligibility,
    transferEligibility,
    user?.id,
  ]);
}
