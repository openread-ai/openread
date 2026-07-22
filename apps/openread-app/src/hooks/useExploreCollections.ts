'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { platform } from '@/services/platform/client';
import { createLogger } from '@/utils/logger';
import type { CatalogBook, CollectionWithBooks } from '@/types/catalog';

export type { CatalogCollection, CollectionWithBooks } from '@/types/catalog';

const logger = createLogger('explore-collections');

interface UseExploreCollectionsReturn {
  collections: CollectionWithBooks[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

async function fetchExploreCollections(
  booksPerCollection: number,
  signal?: AbortSignal,
): Promise<CollectionWithBooks[]> {
  // Step 1: Fetch the list of collections
  const listData = await platform.catalog.listCollections({ signal });

  // Filter out empty collections (book_count === 0)
  const nonEmpty = listData.collections.filter((c) => c.book_count > 0);

  // Step 2: Fetch books for each collection in parallel
  const withBooks = await Promise.all(
    nonEmpty.map(async (collection) => {
      try {
        const booksData = await platform.catalog.listCollectionBooks(
          collection.slug,
          { limit: booksPerCollection },
          { signal },
        );
        return { ...collection, books: booksData.books };
      } catch {
        // If individual collection fetch fails, return empty books
        return { ...collection, books: [] as CatalogBook[] };
      }
    }),
  );

  // Filter out collections that ended up with 0 books after fetch
  return withBooks.filter((c) => c.books.length > 0);
}

export function useExploreCollections(booksPerCollection = 10): UseExploreCollectionsReturn {
  const [collections, setCollections] = useState<CollectionWithBooks[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController>(null);

  const fetchCollections = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchExploreCollections(booksPerCollection, controller.signal);

      if (!controller.signal.aborted) {
        setCollections(result);
        setError(null);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      logger.error('Failed to load collections', { error: err });
      if (!controller.signal.aborted) {
        const status = typeof err === 'object' && err && 'status' in err ? err.status : null;
        setError(
          typeof status === 'number'
            ? `API error: ${status}`
            : err instanceof Error
              ? err.message
              : 'Failed to load collections',
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [booksPerCollection]);

  useEffect(() => {
    fetchCollections();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchCollections]);

  const refresh = useCallback(() => {
    fetchCollections();
  }, [fetchCollections]);

  return { collections, isLoading, error, refresh };
}
