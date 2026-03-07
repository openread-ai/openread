'use client';

import { useCallback } from 'react';
import { useLibraryStore } from '@/store/libraryStore';
import { usePlatformSidebarStore } from '@/store/platformSidebarStore';
import { useLibraryViewStore } from '@/store/libraryViewStore';
import { eventDispatcher } from '@/utils/event';
import envConfig from '@/services/environment';
import { enqueueAndSync, enqueueBatchAndSync } from '@/services/sync/helpers';
import { useBookDataStore } from '@/store/bookDataStore';
import { getAccessToken } from '@/utils/access';
import type { Book, ReadingStatus } from '@/types/book';
import { createLogger } from '@/utils/logger';

const logger = createLogger('bookActions');

/** Cast a Book to the queue payload format. */
function bookPayload(book: Book): Record<string, unknown> {
  return book as unknown as Record<string, unknown>;
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
        enqueueAndSync({ type: 'book', action: 'upsert', payload: bookPayload(updatedBook) });
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
        enqueueAndSync({ type: 'book', action: 'upsert', payload: bookPayload(updatedBook) });
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

  /**
   * Soft delete a book by setting deletedAt timestamp.
   * Uses optimistic update: UI updates immediately, persistence happens in background.
   * On failure, library is rolled back to its previous state.
   */
  const removeBook = useCallback(
    (book: Book) => {
      // Snapshot current library for rollback
      const snapshot = useLibraryStore.getState().library.slice();

      const updatedBook: Book = {
        ...book,
        deletedAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Fire-and-forget: updateBook sets state synchronously, then persists async.
      // We attach a catch handler for rollback instead of awaiting.
      updateBook(envConfig, updatedBook).catch((error) => {
        logger.error('Failed to remove book, rolling back:', error);
        try {
          useLibraryStore.getState().setLibrary(snapshot);
        } catch (rollbackError) {
          logger.error('Rollback also failed:', rollbackError);
        }
        eventDispatcher.dispatch('toast', {
          type: 'error',
          message: 'Failed to remove book',
        });
      });

      enqueueAndSync({ type: 'book', action: 'delete', payload: bookPayload(updatedBook) });
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

        enqueueBatchAndSync(
          updatedBooks.map((b) => ({
            type: 'book' as const,
            action: 'upsert' as const,
            payload: bookPayload(b),
          })),
        );

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
   * Permanently delete a book: hard-delete from library, server configs/notes, and storage.
   * Unlike removeBook (soft-delete), this is irreversible — re-importing the same file starts fresh.
   */
  const permanentlyDeleteBook = useCallback(async (book: Book) => {
    try {
      const appService = await envConfig.getAppService();

      // 1. Delete local + cloud files (book file, cover)
      await appService.deleteBook(book, 'both');

      // 2. Delete local config directory ({hash}/)
      try {
        await appService.deleteDir(`${book.hash}`, 'Books');
      } catch {
        // Directory may not exist or be partially deleted — continue
      }

      // 3. Remove from library entirely (not soft-delete)
      const { library, setLibrary } = useLibraryStore.getState();
      const remaining = library.filter((b) => b.hash !== book.hash);
      setLibrary(remaining);
      appService.saveLibraryBooks(remaining);

      // 4. Push a tombstone for cross-device sync
      const tombstone: Book = { ...book, deletedAt: Date.now(), updatedAt: Date.now() };
      enqueueAndSync({ type: 'book', action: 'delete', payload: bookPayload(tombstone) });

      // 5. Clear local book data from in-memory store
      const bookKey = `${book.hash}-${book.format}`;
      useBookDataStore.getState().setConfig(bookKey, { booknotes: [], progress: undefined });

      // 6. Delete AI conversations from IndexedDB
      try {
        const { aiStore } = await import('@/services/ai/storage/aiStore');
        const conversations = await aiStore.getConversations(book.hash);
        for (const conv of conversations) {
          await aiStore.deleteConversation(conv.id);
        }
      } catch {
        // AI store may not be initialized — continue
      }

      // 7. Hard-delete server-side data (configs, notes, AI, files metadata)
      try {
        const token = await getAccessToken();
        if (token) {
          await fetch(`/api/sync?book_hash=${encodeURIComponent(book.hash)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } catch {
        // Server cleanup is best-effort — tombstone sync handles cross-device
      }
    } catch (error) {
      logger.error('Failed to permanently delete book:', error);
      eventDispatcher.dispatch('toast', {
        type: 'error',
        message: 'Failed to permanently delete book',
      });
    }
  }, []);

  /**
   * Permanently delete multiple books.
   * Removes all from library immediately (optimistic), then cleans up in sequence.
   */
  const bulkRemove = useCallback(
    async (hashes: string[]) => {
      const books = hashes.map((hash) => getBookByHash(hash)).filter(Boolean) as Book[];
      if (books.length === 0) return;

      clearSelection();
      setSelectMode(false);

      // Delete sequentially to avoid library state races
      for (const book of books) {
        await permanentlyDeleteBook(book).catch((error) => {
          logger.error(`Failed to permanently delete ${book.title}:`, error);
        });
      }
    },
    [getBookByHash, clearSelection, setSelectMode, permanentlyDeleteBook],
  );

  return {
    // Single actions
    setReadingStatus,
    renameBook,
    removeBook,
    permanentlyDeleteBook,
    // Bulk actions
    bulkSetReadingStatus,
    bulkRemove,
    bulkAddToCollection,
  };
}
