'use client';

import { useMemo } from 'react';
import { useLibraryStore } from '@/store/libraryStore';
import type { Book } from '@/types/book';

type FilterType = 'all' | 'reading' | 'recent' | 'want-to-read' | 'finished' | 'books' | 'pdfs';

interface UseLibraryBooksOptions {
  filter?: FilterType;
  limit?: number;
}

interface UseLibraryBooksReturn {
  books: Book[];
  isLoading: boolean;
}

/**
 * Calculate progress percentage from progress tuple [current, total]
 */
function getProgressPercentage(progress?: [number, number]): number {
  if (!progress || progress[1] === 0) return 0;
  return (progress[0] / progress[1]) * 100;
}

/**
 * Hook for querying library books with filtering and limiting
 * Filters out deleted books and applies the specified filter
 */
export function useLibraryBooks(options: UseLibraryBooksOptions = {}): UseLibraryBooksReturn {
  const { filter = 'all', limit } = options;

  const libraryLoaded = useLibraryStore((state) => state.libraryLoaded);
  const library = useLibraryStore((state) => state.library);

  const books = useMemo(() => {
    const visibleBooks = library.filter((book) => !book.deletedAt);

    let filteredBooks: Book[];

    switch (filter) {
      case 'reading': {
        // Books with progress > 0% and < 100%
        filteredBooks = visibleBooks.filter((book) => {
          const progress = getProgressPercentage(book.progress);
          return (progress > 0 && progress < 100) || book.readingStatus === 'reading';
        });
        // Sort by most recently updated
        filteredBooks.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        break;
      }

      case 'recent': {
        // Sort by createdAt descending (newest first)
        filteredBooks = [...visibleBooks].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        break;
      }

      case 'want-to-read': {
        // Books with readingStatus === 'unread' or no progress
        filteredBooks = visibleBooks.filter((book) => {
          const progress = getProgressPercentage(book.progress);
          return book.readingStatus === 'unread' || (progress === 0 && !book.readingStatus);
        });
        // Sort by createdAt descending
        filteredBooks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        break;
      }

      case 'finished': {
        // Books with progress === 100% or readingStatus === 'finished'
        filteredBooks = visibleBooks.filter((book) => {
          const progress = getProgressPercentage(book.progress);
          return progress >= 100 || book.readingStatus === 'finished';
        });
        // Sort by updatedAt descending
        filteredBooks.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        break;
      }

      case 'books': {
        // EPUB and Kindle format books
        filteredBooks = visibleBooks.filter(
          (book) =>
            book.format === 'epub' ||
            book.format === 'mobi' ||
            book.format === 'azw' ||
            book.format === 'azw3',
        );
        filteredBooks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        break;
      }

      case 'pdfs': {
        // PDF format books
        filteredBooks = visibleBooks.filter((book) => book.format === 'pdf');
        filteredBooks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        break;
      }

      default:
        filteredBooks = [...visibleBooks].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    // Apply limit if specified
    if (limit && limit > 0) {
      filteredBooks = filteredBooks.slice(0, limit);
    }

    return filteredBooks;
  }, [filter, limit, library]);

  return {
    books,
    isLoading: !libraryLoaded,
  };
}

/**
 * Utility to get progress percentage for a book
 */
export function getBookProgressPercentage(book: Book): number {
  return getProgressPercentage(book.progress);
}
