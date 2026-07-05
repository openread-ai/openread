import { usePlatformSidebarStore } from '@/store/platformSidebarStore';
import { useLibraryStore } from '@/store/libraryStore';
import envConfig, { type EnvConfigType } from '@/services/environment';
import {
  clearLibraryPaintCache,
  readLibraryOwnerUserId,
  readLibraryPaintCache,
  rememberLibraryOwnerUserId,
  writeLibraryPaintCache,
} from '@/services/libraryPaintCache';
import { resetCanonicalSyncCursors } from '@/services/sync/cursors';
import type { Book } from '@/types/book';

interface AccountLibraryTransitionResult {
  ownerMismatch: boolean;
  hadPaintProjection: boolean;
}

function visibleBooks(books: Book[]): Book[] {
  return books.filter((book) => !book.deletedAt);
}

export function hydrateLibraryPaintProjection(userId: string | null): boolean {
  if (!userId || useLibraryStore.getState().library.length > 0) return false;

  const projection = readLibraryPaintCache(userId);
  if (!projection?.books.length) return false;

  useLibraryStore.getState().setLibraryOwnerUserId(userId);
  useLibraryStore.getState().setLibrary(projection.books);
  usePlatformSidebarStore.getState().setCollectionsOwnerUserId(userId);
  return true;
}

export function persistLibraryPaintProjection(userId: string | null, books: Book[]): void {
  if (!userId) return;

  const durableBooks = visibleBooks(books);
  if (durableBooks.length === 0) {
    clearLibraryPaintCache();
    return;
  }

  writeLibraryPaintCache(userId, durableBooks);
}

export async function transitionAccountLibraryOwner(
  userId: string | null,
  appEnvConfig: EnvConfigType = envConfig,
): Promise<AccountLibraryTransitionResult> {
  const store = useLibraryStore.getState();
  const previousOwnerUserId = readLibraryOwnerUserId();
  const currentOwnerUserId = store.libraryOwnerUserId;
  const ownerMismatch = Boolean(
    userId &&
    ((previousOwnerUserId && previousOwnerUserId !== userId) ||
      (currentOwnerUserId && currentOwnerUserId !== userId)),
  );

  if (!userId) {
    const { syncWorker } = await import('@/services/sync/syncWorker');
    syncWorker.stop();
    store.setLibrary([]);
    store.setLibraryOwnerUserId(null);
    usePlatformSidebarStore.getState().resetAccountScopedCollections();
    usePlatformSidebarStore.getState().setCollectionsOwnerUserId(null);
    clearLibraryPaintCache();
    rememberLibraryOwnerUserId(null);
    return { ownerMismatch: false, hadPaintProjection: false };
  }

  if (ownerMismatch) {
    const { syncWorker } = await import('@/services/sync/syncWorker');
    syncWorker.stop();
    store.setLibrary([]);
    usePlatformSidebarStore.getState().resetAccountScopedCollections();
    resetCanonicalSyncCursors(previousOwnerUserId);
    resetCanonicalSyncCursors(userId);
    clearLibraryPaintCache();

    const appService = await appEnvConfig.getAppService();
    await appService.saveLibraryBooks([]);

    rememberLibraryOwnerUserId(userId);
    store.setLibraryOwnerUserId(userId);
    usePlatformSidebarStore.getState().setCollectionsOwnerUserId(userId);

    return { ownerMismatch: true, hadPaintProjection: false };
  }

  rememberLibraryOwnerUserId(userId);
  store.setLibraryOwnerUserId(userId);
  usePlatformSidebarStore.getState().setCollectionsOwnerUserId(userId);
  return { ownerMismatch: false, hadPaintProjection: hydrateLibraryPaintProjection(userId) };
}
