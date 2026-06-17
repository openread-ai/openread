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

// ── Client-side cache ──────────────────────────────────

interface CollectionsCacheEntry {
  booksPerCollection: number;
  collections: CollectionWithBooks[];
  timestamp: number;
}

const COLLECTIONS_CACHE_KEY = 'openread_explore_collections_cache_v1';
const collectionsCache = new Map<number, CollectionsCacheEntry>();
const CACHE_TTL = 5 * 60_000; // 5 minutes

function isFreshCacheEntry(
  entry: CollectionsCacheEntry | null | undefined,
  booksPerCollection: number,
): entry is CollectionsCacheEntry {
  return Boolean(
    entry &&
    entry.booksPerCollection === booksPerCollection &&
    Date.now() - entry.timestamp <= CACHE_TTL,
  );
}

function readDurableCollectionsCache(booksPerCollection: number): CollectionsCacheEntry | null {
  if (typeof localStorage === 'undefined') return null;

  try {
    const raw = localStorage.getItem(COLLECTIONS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CollectionsCacheEntry;
    if (!isFreshCacheEntry(parsed, booksPerCollection)) return null;
    collectionsCache.set(booksPerCollection, parsed);
    return parsed;
  } catch (error) {
    logger.warn('Failed to read Explore collections cache', error);
    return null;
  }
}

function getCachedCollections(booksPerCollection: number): CollectionWithBooks[] | null {
  const memoryEntry = collectionsCache.get(booksPerCollection);
  if (isFreshCacheEntry(memoryEntry, booksPerCollection)) return memoryEntry.collections;

  if (memoryEntry) collectionsCache.delete(booksPerCollection);

  return readDurableCollectionsCache(booksPerCollection)?.collections ?? null;
}

function setCachedCollections(booksPerCollection: number, collections: CollectionWithBooks[]) {
  const entry = { booksPerCollection, collections, timestamp: Date.now() };
  collectionsCache.set(booksPerCollection, entry);

  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(COLLECTIONS_CACHE_KEY, JSON.stringify(entry));
  } catch (error) {
    logger.warn('Failed to persist Explore collections cache', error);
  }
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

export async function preloadExploreCollections(booksPerCollection = 10): Promise<void> {
  if (getCachedCollections(booksPerCollection)) return;

  try {
    const collections = await fetchExploreCollections(booksPerCollection);
    setCachedCollections(booksPerCollection, collections);
  } catch (error) {
    logger.warn('Failed to preload Explore collections', error);
  }
}

/** Reset module-level cache (for testing) */
export function _resetCollectionsCache() {
  collectionsCache.clear();
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(COLLECTIONS_CACHE_KEY);
  }
}

// ── Hook ───────────────────────────────────────────────

export function useExploreCollections(booksPerCollection = 10): UseExploreCollectionsReturn {
  const [collections, setCollections] = useState<CollectionWithBooks[]>(() => {
    return getCachedCollections(booksPerCollection) ?? [];
  });
  const [isLoading, setIsLoading] = useState(() => collections.length === 0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController>(null);

  const fetchCollections = useCallback(
    async (skipCache = false) => {
      const cached = skipCache ? null : getCachedCollections(booksPerCollection);
      const hasCachedCollections = Boolean(cached?.length);

      if (cached) {
        setCollections(cached);
        setIsLoading(false);
        setError(null);
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(!hasCachedCollections);
      if (!hasCachedCollections) setError(null);

      try {
        const result = await fetchExploreCollections(booksPerCollection, controller.signal);

        if (!controller.signal.aborted) {
          setCollections(result);
          setCachedCollections(booksPerCollection, result);
          setError(null);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.error('Failed to load collections', { error: err });
        if (!controller.signal.aborted && !hasCachedCollections) {
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
    },
    [booksPerCollection],
  );

  useEffect(() => {
    fetchCollections();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchCollections]);

  const refresh = useCallback(() => {
    collectionsCache.delete(booksPerCollection);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(COLLECTIONS_CACHE_KEY);
    }
    fetchCollections(true);
  }, [booksPerCollection, fetchCollections]);

  return { collections, isLoading, error, refresh };
}
