'use client';

import { useCallback } from 'react';
import { useLibraryStore } from '@/store/libraryStore';
import { usePlatformSidebarStore } from '@/store/platformSidebarStore';
import { useLibraryViewStore } from '@/store/libraryViewStore';
import { eventDispatcher } from '@/utils/event';
import envConfig from '@/services/environment';
import { enqueueBookForSync, enqueueBooksForSync } from '@/services/sync/helpers';
import { useBookDataStore } from '@/store/bookDataStore';
import type { Book, ReadingStatus } from '@/types/book';
import { createLogger } from '@/utils/logger';

const logger = createLogger('bookActions');

/**
 * Background cleanup for a permanently deleted book.
 * Runs after the book is already removed from the UI — all steps are best-effort.
 */
async function cleanupDeletedBook(book: Book): Promise<void> {
  try {
    const appService = await envConfig.getAppService();

    // Remove local files/config/AI/collection references only. The foreground
    // delete path already persisted the tombstoned library before hiding it.
    const [, sidebarStore] = await Promise.all([
      appService.deleteBook(book, 'both').catch(() => {}),
      import('@/store/platformSidebarStore'),
    ]);

    // Remove from all collections
    const { collections, removeBookFromCollection } =
      sidebarStore.usePlatformSidebarStore.getState();
    for (const col of collections) {
      if (col.bookHashes.includes(book.hash)) {
        removeBookFromCollection(col.id, book.hash);
      }
    }

    // Delete local config directory
    appService.deleteDir(`${book.hash}`, 'Books').catch(() => {});

    // Delete AI conversations from IndexedDB
    import('@/services/ai/storage/aiStore')
      .then(async ({ aiStore }) => {
        const conversations = await aiStore.getConversations(book.hash);
        for (const conv of conversations) {
          await aiStore.deleteConversation(conv.id);
        }
      })
      .catch(() => {});
  } catch (error) {
    logger.error('Background cleanup failed:', error);
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
        void enqueueBookForSync(updatedBook);
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
        void enqueueBookForSync(updatedBook);
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

        void enqueueBooksForSync(updatedBooks);

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
   * Permanently delete a book. The local tombstone is the foreground commit:
   * persist first, then hide from UI, then enqueue sync/cleanup best-effort.
   */
  const permanentlyDeleteBook = useCallback(async (book: Book) => {
    const now = Date.now();
    const deletedBook: Book = {
      ...book,
      deletedAt: now,
      updatedAt: now,
      downloadedAt: null,
      coverDownloadedAt: null,
    };

    const { library, setLibrary } = useLibraryStore.getState();
    const previousLibrary = library;
    const nextLibrary = library.map((existing) =>
      existing.hash === book.hash ? deletedBook : existing,
    );
    const appService = await envConfig.getAppService();

    try {
      await appService.saveLibraryBooks(nextLibrary);
    } catch (error) {
      logger.error('Failed to durably save deleted book tombstone:', error);
      setLibrary(previousLibrary);
      throw new Error('Failed to delete book locally. Your library was not changed.');
    }

    setLibrary(nextLibrary);

    void enqueueBookForSync(deletedBook).catch((error) => {
      logger.warn('Deleted book sync enqueue failed; tombstone remains local for retry:', error);
    });

    const bookKey = `${book.hash}-${book.format}`;
    useBookDataStore.getState().setConfig(bookKey, { booknotes: [], progress: undefined });

    void cleanupDeletedBook(deletedBook);
  }, []);

  /**
   * Permanently delete multiple books. Persist tombstones first, then hide.
   */
  const bulkRemove = useCallback(
    async (hashes: string[]) => {
      const books = hashes.map((hash) => getBookByHash(hash)).filter(Boolean) as Book[];
      if (books.length === 0) return;

      const now = Date.now();
      const deletedByHash = new Map(
        books.map((book) => [
          book.hash,
          {
            ...book,
            deletedAt: now,
            updatedAt: now,
            downloadedAt: null,
            coverDownloadedAt: null,
          } satisfies Book,
        ]),
      );
      const { library, setLibrary } = useLibraryStore.getState();
      const previousLibrary = library;
      const nextLibrary = library.map((book) => deletedByHash.get(book.hash) ?? book);
      const appService = await envConfig.getAppService();

      try {
        await appService.saveLibraryBooks(nextLibrary);
      } catch (error) {
        logger.error('Failed to durably save deleted book tombstones:', error);
        setLibrary(previousLibrary);
        throw new Error('Failed to delete books locally. Your library was not changed.');
      }

      setLibrary(nextLibrary);

      void enqueueBooksForSync(Array.from(deletedByHash.values())).catch((error) => {
        logger.warn('Deleted books sync enqueue failed; tombstones remain local for retry:', error);
      });

      clearSelection();
      setSelectMode(false);

      for (const book of books) {
        const bookKey = `${book.hash}-${book.format}`;
        useBookDataStore.getState().setConfig(bookKey, { booknotes: [], progress: undefined });
      }

      void Promise.all(
        Array.from(deletedByHash.values()).map((deletedBook) => cleanupDeletedBook(deletedBook)),
      );
    },
    [getBookByHash, clearSelection, setSelectMode],
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
