'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { platform } from '@/services/platform/client';
import { createLogger } from '@/utils/logger';
import type { CatalogBook } from '@/types/catalog';
import type { CatalogBrowseQuery } from '@openread/types';

export type { CatalogBook } from '@/types/catalog';

const logger = createLogger('explore-books');

export interface UseExploreBooksParams {
  q?: string;
  subject?: string;
  language?: string;
  languages?: string[];
  sources?: string[];
  minPages?: number;
  maxPages?: number;
  enabled?: boolean;
  region?: string;
  sort?: 'popularity' | 'relevance' | 'title_asc' | 'title_desc' | 'added_desc';
  limit?: number;
}

interface UseExploreBooksReturn {
  books: CatalogBook[];
  total: number;
  isLoading: boolean;
  isStale: boolean;
  error: string | null;
  loadMore: () => void;
  hasMore: boolean;
  refresh: () => void;
  // IA blended search fields
  iaBooks: CatalogBook[];
  iaTotal: number;
  iaLoading: boolean;
  iaError: string | null;
  iaLoadMore: () => void;
  iaHasMore: boolean;
}

interface CacheEntry {
  books: CatalogBook[];
  total: number;
  timestamp: number;
}

// Client-side query cache — survives re-renders, shared across hook instances
const queryCache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000; // 1 minute

/** Clear the module-level query cache. Exported for use in tests only. */
export function _clearQueryCache() {
  queryCache.clear();
}

function getCached(key: string): CacheEntry | null {
  const entry = queryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    queryCache.delete(key);
    return null;
  }
  return entry;
}

function setCache(key: string, books: CatalogBook[], total: number) {
  queryCache.set(key, { books, total, timestamp: Date.now() });
  // Evict old entries if cache grows too large
  if (queryCache.size > 50) {
    const oldest = [...queryCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 10; i++) queryCache.delete(oldest[i]![0]);
  }
}

/**
 * Dedup IA books against local books by normalized title+author.
 * Returns only IA books that do NOT have a local match.
 */
export function deduplicateIA(localBooks: CatalogBook[], iaBooks: CatalogBook[]): CatalogBook[] {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const localKeys = new Set(
    localBooks.map((b) => `${normalize(b.title)}::${normalize(b.author_name)}`),
  );
  return iaBooks.filter(
    (b) => !localKeys.has(`${normalize(b.title)}::${normalize(b.author_name)}`),
  );
}

export function useExploreBooks(params: UseExploreBooksParams = {}): UseExploreBooksReturn {
  const [books, setBooks] = useState<CatalogBook[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // IA search state
  const [iaBooks, setIaBooks] = useState<CatalogBook[]>([]);
  const [iaTotal, setIaTotal] = useState(0);
  const [iaPage, setIaPage] = useState(1);
  const [iaLoading, setIaLoading] = useState(false);
  const [iaError, setIaError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const abortRef = useRef<AbortController>(null);
  const iaAbortRef = useRef<AbortController>(null);

  const limit = params.limit ?? 20;
  const enabled = params.enabled ?? true;

  // Frozen Add contract requires every visible Explore row to have a canonical
  // catalog import intent. Live IA search rows do not have catalog_book IDs yet,
  // so keep blended IA disabled until the API exposes a canonical intent path.
  const shouldSearchIA = false;

  // Stable serialized key for params (excluding page)
  const paramsKey = useMemo(
    () =>
      JSON.stringify({
        q: params.q,
        subject: params.subject,
        language: params.language,
        languages: params.languages,
        sources: params.sources,
        minPages: params.minPages,
        maxPages: params.maxPages,
        enabled,
        region: params.region,
        sort: params.sort,
        limit,
      }),
    [
      params.q,
      params.subject,
      params.language,
      params.languages,
      params.sources,
      params.minPages,
      params.maxPages,
      enabled,
      params.region,
      params.sort,
      limit,
    ],
  );

  const buildCatalogQuery = useCallback(
    (fetchPage: number): CatalogBrowseQuery => ({
      q: params.q,
      subject: params.subject,
      language: params.language,
      languages: params.languages,
      sources: params.sources,
      minPages: params.minPages,
      maxPages: params.maxPages,
      region: params.region,
      sort: params.sort,
      page: fetchPage,
      limit,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paramsKey],
  );

  // ── Fetch IA results ──────────────────────────────────
  const fetchIA = useCallback(
    async (query: string, fetchPage: number, append: boolean, localBooks: CatalogBook[]) => {
      iaAbortRef.current?.abort();
      const controller = new AbortController();
      iaAbortRef.current = controller;

      setIaLoading(true);
      setIaError(null);

      try {
        const data = await platform.catalog.searchInternetArchive(
          { q: query, page: fetchPage, limit },
          { signal: controller.signal },
        );

        if (!controller.signal.aborted) {
          const rawIaBooks: CatalogBook[] = data.books || [];
          const deduped = deduplicateIA(localBooks, rawIaBooks);

          if (append) {
            setIaBooks((prev) => {
              const combined = [...prev, ...deduped];
              return deduplicateIA(localBooks, combined);
            });
          } else {
            setIaBooks(deduped);
          }
          setIaTotal(data.total || 0);

          // If the API returned an error field (graceful degradation)
          if (data.error) {
            setIaError(data.error);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // IA errors are non-fatal — local results still show
        logger.error('IA search failed', err);
        setIaError('ia_unavailable');
      } finally {
        if (!controller.signal.aborted) {
          setIaLoading(false);
        }
      }
    },
    [limit],
  );

  // ── Fetch local catalog results ───────────────────────
  const fetchBooks = useCallback(
    async (fetchPage: number, append: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const cacheKey = `${paramsKey}:${fetchPage}`;

      // Check cache first — if hit, show cached data immediately
      if (!append) {
        const cached = getCached(cacheKey);
        if (cached) {
          setBooks(cached.books);
          setTotal(cached.total);
          setIsStale(false);
          setIsLoading(false);
          setError(null);
          // Trigger IA search for cached local results too
          if (shouldSearchIA && params.q) {
            fetchIA(params.q, 1, false, cached.books);
          }
          return;
        }
        // Mark as stale (keep showing old data while loading)
        setIsStale(true);
      }

      setIsLoading(true);
      setError(null);

      try {
        const data = await platform.catalog.listBooks(buildCatalogQuery(fetchPage), {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          const nextBooks = (data.books || []) as CatalogBook[];
          setBooks((prev) => (append ? [...prev, ...nextBooks] : nextBooks));
          setTotal(data.total);
          setIsStale(false);

          // Cache the result
          if (!append) {
            setCache(cacheKey, nextBooks, data.total);
          }

          // After local results arrive, also fetch IA results
          if (shouldSearchIA && params.q && !append) {
            setIaPage(1);
            fetchIA(params.q, 1, false, nextBooks);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.error('Failed to fetch catalog books', err);
        setError(err instanceof Error ? err.message : 'Failed to load books');
        setIsStale(false);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paramsKey, buildCatalogQuery, shouldSearchIA, fetchIA],
  );

  // Reset and fetch when params change (debounced for search only)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!enabled) {
      abortRef.current?.abort();
      iaAbortRef.current?.abort();
      setBooks([]);
      setTotal(0);
      setPage(1);
      setIsLoading(false);
      setIsStale(false);
      setError(null);
      setIaBooks([]);
      setIaTotal(0);
      setIaPage(1);
      setIaError(null);
      setIaLoading(false);
      return;
    }

    // Clear IA state when params change
    if (!shouldSearchIA) {
      iaAbortRef.current?.abort();
      setIaBooks([]);
      setIaTotal(0);
      setIaError(null);
      setIaLoading(false);
    }

    // Fetch immediately — debouncing is handled by ExploreSearchBar (300ms)
    setPage(1);
    fetchBooks(1, false);
  }, [fetchBooks, params.q, shouldSearchIA, enabled]);

  const loadMore = useCallback(() => {
    if (!enabled || isLoading) return;
    const nextPage = page + 1;
    if ((nextPage - 1) * limit >= total) return;
    setPage(nextPage);
    fetchBooks(nextPage, true);
  }, [enabled, isLoading, page, limit, total, fetchBooks]);

  const iaLoadMore = useCallback(() => {
    if (!enabled || iaLoading || !params.q) return;
    const nextPage = iaPage + 1;
    if ((nextPage - 1) * limit >= iaTotal) return;
    setIaPage(nextPage);
    fetchIA(params.q, nextPage, true, books);
  }, [enabled, iaLoading, iaPage, limit, iaTotal, fetchIA, params.q, books]);

  const refresh = useCallback(() => {
    if (!enabled) return;
    // Clear cache for current params to force fresh fetch
    queryCache.delete(`${paramsKey}:1`);
    setPage(1);
    fetchBooks(1, false);
  }, [enabled, fetchBooks, paramsKey]);

  const hasMore = enabled && page * limit < total;
  const iaHasMore = enabled && iaPage * limit < iaTotal;

  return {
    books,
    total,
    isLoading,
    isStale,
    error,
    loadMore,
    hasMore,
    refresh,
    iaBooks,
    iaTotal,
    iaLoading,
    iaError,
    iaLoadMore,
    iaHasMore,
  };
}
