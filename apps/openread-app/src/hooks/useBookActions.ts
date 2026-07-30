'use client';

import { useCallback } from 'react';
import { useLibraryStore } from '@/store/libraryStore';
import { usePlatformSidebarStore } from '@/store/platformSidebarStore';
import { useLibraryViewStore } from '@/store/libraryViewStore';
import { eventDispatcher } from '@/utils/event';
import envConfig from '@/services/environment';
import {
  enqueueBookForSync,
  enqueueBooksForSync,
  handleFireAndForgetSyncEnqueue,
  requireSyncMutationUserId,
  SyncMutationContextUnavailableError,
} from '@/services/sync/helpers';
import { runAccountLibraryMutation } from '@/services/accountLibraryLifecycle';
import { SyncMutationDeliveryError } from '@/services/sync/engine';
import type { Book, ReadingStatus } from '@/types/book';
import { createLogger } from '@/utils/logger';

const logger = createLogger('bookActions');

/**
 * Background cleanup for a permanently deleted book.
 * Runs after the book is already removed from the UI — all steps are best-effort.
 */
const toDeletedBook = (book: Book, deletedAt: number): Book => ({
  ...book,
  deletedAt: Math.max(book.deletedAt ?? 0, deletedAt),
  updatedAt: Math.max(book.updatedAt ?? 0, deletedAt),
  downloadedAt: null,
  coverDownloadedAt: null,
});

const applyDeletionTombstones = (
  library: Book[],
  targetHashes: ReadonlySet<string>,
  deletedAt: number,
): Book[] =>
  library.map((book) => (targetHashes.has(book.hash) ? toDeletedBook(book, deletedAt) : book));

const requireDeletionLibraryState = (expectedUserId: string) => {
  requireSyncMutationUserId(expectedUserId);
  const state = useLibraryStore.getState();
  if (state.libraryOwnerUserId !== expectedUserId) {
    throw new SyncMutationContextUnavailableError();
  }
  return state;
};

function removeDeletedBooksFromCollections(targetHashes: ReadonlySet<string>): void {
  const { collections, removeBookFromCollection } = usePlatformSidebarStore.getState();
  for (const collection of collections) {
    for (const hash of targetHashes) {
      if (collection.bookHashes.includes(hash)) {
        removeBookFromCollection(collection.id, hash);
      }
    }
  }
}

/**
 * Hook that provides book mutation actions for single and bulk operations.
 * All mutations go through libraryStore.updateBook() for consistency.
 */
export function useBookActions() {
  const library = useLibraryStore((state) => state.library);
  const updateBook = useLibraryStore((state) => state.updateBook);
  const addBookToCollection = usePlatformSidebarStore((state) => state.addBookToCollection);
  const clearSelection = useLibraryViewStore((state) => state.clearSelection);
  const setSelectMode = useLibraryViewStore((state) => state.setSelectMode);

  /**
   * Helper to get a book by hash and apply updates
   */
  const getBookByHash = useCallback(
    (hash: string): Book | undefined => {
      return library.find((b) => b.hash === hash);
    },
    [library],
  );

  // Single book actions

  /**
   * Update the reading status of a book
   */
  const setReadingStatus = useCallback(
    async (book: Book, status: ReadingStatus) => {
      try {
        const updatedBook: Book = {
          ...book,
          readingStatus: status,
          updatedAt: Date.now(),
        };
        await updateBook(envConfig, updatedBook);
        handleFireAndForgetSyncEnqueue(enqueueBookForSync(updatedBook), {
          source: 'book-actions.setReadingStatus',
          mutationType: 'book',
          operation: 'upsert',
          hasBookHash: Boolean(updatedBook.hash),
        });
      } catch (error) {
        logger.error('Failed to update reading status:', error);
        eventDispatcher.dispatch('toast', {
          type: 'error',
          message: 'Failed to update reading status',
        });
        throw error;
      }
    },
    [updateBook],
  );

  /**
   * Rename a book's title.
   * Does nothing if the new title is empty after trimming.
   */
  const renameBook = useCallback(
    async (book: Book, newTitle: string) => {
      const trimmedTitle = newTitle.trim();
      if (!trimmedTitle) return;

      try {
        const updatedBook: Book = {
          ...book,
          title: trimmedTitle,
          updatedAt: Date.now(),
        };
        await updateBook(envConfig, updatedBook);
        handleFireAndForgetSyncEnqueue(enqueueBookForSync(updatedBook), {
          source: 'book-actions.renameBook',
          mutationType: 'book',
          operation: 'upsert',
          hasBookHash: Boolean(updatedBook.hash),
        });
      } catch (error) {
        logger.error('Failed to rename book:', error);
        eventDispatcher.dispatch('toast', {
          type: 'error',
          message: 'Failed to rename book',
        });
        throw error;
      }
    },
    [updateBook],
  );

  // Bulk actions

  /**
   * Update reading status for multiple books.
   * Clears selection and exits select mode after completion.
   */
  const bulkSetReadingStatus = useCallback(
    async (hashes: string[], status: ReadingStatus) => {
      try {
        const updatedAt = Date.now();
        const updatedBooks: Book[] = [];
        const updatePromises = hashes
          .map((hash) => {
            const book = getBookByHash(hash);
            if (!book) return null;

            const updatedBook: Book = {
              ...book,
              readingStatus: status,
              updatedAt,
            };
            updatedBooks.push(updatedBook);
            return updateBook(envConfig, updatedBook);
          })
          .filter(Boolean);

        await Promise.all(updatePromises);

        handleFireAndForgetSyncEnqueue(enqueueBooksForSync(updatedBooks), {
          source: 'book-actions.bulkSetReadingStatus',
          mutationType: 'book',
          operation: 'upsert',
          count: updatedBooks.length,
        });

        clearSelection();
        setSelectMode(false);
      } catch (error) {
        logger.error('Failed to update reading status:', error);
        eventDispatcher.dispatch('toast', {
          type: 'error',
          message: `Failed to update ${hashes.length > 1 ? 'books' : 'book'}`,
        });
        throw error;
      }
    },
    [getBookByHash, updateBook, clearSelection, setSelectMode],
  );

  /**
   * Add multiple books to a collection
   * Clears selection and exits select mode after completion
   */
  const bulkAddToCollection = useCallback(
    (hashes: string[], collectionId: string) => {
      hashes.forEach((hash) => {
        addBookToCollection(collectionId, hash);
      });
      clearSelection();
      setSelectMode(false);
    },
    [addBookToCollection, clearSelection, setSelectMode],
  );

  /**
   * Permanently delete a book only after its exact tombstone is durably queued.
   * The outbox is the first durable commit; local persistence and visibility
   * are finalized only while the initiating account still owns the library.
   */
  const permanentlyDeleteBook = useCallback(async (book: Book) => {
    const expectedUserId = requireSyncMutationUserId();
    requireDeletionLibraryState(expectedUserId);
    const deletedAt = Date.now();
    const targetHashes = new Set([book.hash]);
    const deletedBook = toDeletedBook(book, deletedAt);

    let delivery: Awaited<ReturnType<typeof enqueueBooksForSync>>;
    try {
      delivery = await enqueueBooksForSync([deletedBook], expectedUserId);
    } catch (error) {
      logger.error('Failed to durably queue deleted book tombstone:', error);
      if (error instanceof SyncMutationDeliveryError) throw error;
      throw new Error('Failed to queue book deletion. Your library was not changed.');
    }

    const appService = await envConfig.getAppService();
    await runAccountLibraryMutation(async () => {
      const { library: currentLibrary } = requireDeletionLibraryState(expectedUserId);
      const committedLibrary = applyDeletionTombstones(currentLibrary, targetHashes, deletedAt);
      try {
        await appService.saveLibraryBooks(committedLibrary);
      } catch (error) {
        logger.error('Failed to finalize deleted book tombstone:', error);
        throw new Error('Deletion was queued, but the local library could not be updated.');
      }
      const { setLibrary } = requireDeletionLibraryState(expectedUserId);
      setLibrary(
        applyDeletionTombstones(useLibraryStore.getState().library, targetHashes, deletedAt),
      );
      removeDeletedBooksFromCollections(targetHashes);
    });

    // Local artifacts are evicted by the replayable, account-checked lifecycle pass.
    // The delete path only commits the durable tombstone and library projection.
    return delivery;
  }, []);

  /**
   * Permanently delete only the selected books after their exact tombstones are
   * durably queued for the account that initiated the action.
   */
  const bulkRemove = useCallback(
    async (hashes: string[]) => {
      const expectedUserId = requireSyncMutationUserId();
      const initialState = requireDeletionLibraryState(expectedUserId);
      const books = hashes
        .map((hash) => initialState.library.find((book) => book.hash === hash))
        .filter(Boolean) as Book[];
      if (books.length === 0) return;

      const deletedAt = Date.now();
      const targetHashes = new Set(books.map((book) => book.hash));
      const deletedBooks = books.map((book) => toDeletedBook(book, deletedAt));

      let delivery: Awaited<ReturnType<typeof enqueueBooksForSync>>;
      try {
        delivery = await enqueueBooksForSync(deletedBooks, expectedUserId);
      } catch (error) {
        logger.error('Failed to durably queue deleted book tombstones:', error);
        if (error instanceof SyncMutationDeliveryError) throw error;
        throw new Error('Failed to queue book deletions. Your library was not changed.');
      }

      const appService = await envConfig.getAppService();
      await runAccountLibraryMutation(async () => {
        const { library: currentLibrary } = requireDeletionLibraryState(expectedUserId);
        const committedLibrary = applyDeletionTombstones(currentLibrary, targetHashes, deletedAt);
        try {
          await appService.saveLibraryBooks(committedLibrary);
        } catch (error) {
          logger.error('Failed to finalize deleted book tombstones:', error);
          throw new Error('Deletions were queued, but the local library could not be updated.');
        }
        const { setLibrary } = requireDeletionLibraryState(expectedUserId);
        setLibrary(
          applyDeletionTombstones(useLibraryStore.getState().library, targetHashes, deletedAt),
        );
        clearSelection();
        setSelectMode(false);
        removeDeletedBooksFromCollections(targetHashes);
      });

      // Local artifacts are evicted by the replayable, account-checked lifecycle pass.
      return delivery;
    },
    [clearSelection, setSelectMode],
  );

  return {
    // Single actions
    setReadingStatus,
    renameBook,
    permanentlyDeleteBook,
    // Bulk actions
    bulkSetReadingStatus,
    bulkRemove,
    bulkAddToCollection,
  };
}
