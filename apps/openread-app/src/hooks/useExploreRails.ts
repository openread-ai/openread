'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EXPLORE_RAILS,
  getExploreRailHref,
  type ExploreRailDefinition,
} from '@/components/explore/exploreRails';
import { CATALOG_API_BASE_URL } from '@/services/constants';
import { getPlatformFetch } from '@/utils/fetch';
import { createLogger } from '@/utils/logger';
import type { CatalogBook } from '@/types/catalog';

const logger = createLogger('explore-rails');

export interface ExploreRailResult extends ExploreRailDefinition {
  href: string;
  books: CatalogBook[];
  total: number;
}

interface UseExploreRailsReturn {
  rails: ExploreRailResult[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

function buildRailParams(rail: ExploreRailDefinition, limit: number): URLSearchParams {
  const params = new URLSearchParams();
  if (rail.params.subject) params.set('subject', rail.params.subject);
  if (rail.params.sources?.length) params.set('sources', rail.params.sources.join(','));
  if (rail.params.minPages !== undefined) params.set('minPages', String(rail.params.minPages));
  if (rail.params.maxPages !== undefined) params.set('maxPages', String(rail.params.maxPages));
  if (rail.params.sort) params.set('sort', rail.params.sort);
  params.set('page', '1');
  params.set('limit', String(limit));
  return params;
}

export function useExploreRails(limit = 10): UseExploreRailsReturn {
  const [rails, setRails] = useState<ExploreRailResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const abortRef = useRef<AbortController>(null);

  const refresh = useCallback(() => {
    setRefreshNonce((value) => value + 1);
  }, []);

  const railDefinitions = useMemo(() => EXPLORE_RAILS, []);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    async function fetchRails() {
      setIsLoading(true);
      setError(null);

      try {
        const platformFetch = await getPlatformFetch();
        const results = await Promise.all(
          railDefinitions.map(async (rail) => {
            const params = buildRailParams(rail, limit);
            const response = await platformFetch(
              `${CATALOG_API_BASE_URL}/catalog/books?${params}`,
              {
                signal: controller.signal,
              },
            );

            if (!response.ok) {
              throw new Error(`Failed to fetch ${rail.id}`);
            }

            const data = await response.json();
            return {
              ...rail,
              href: getExploreRailHref(rail.id),
              books: (data.books || []) as CatalogBook[],
              total: Number(data.total || 0),
            };
          }),
        );

        if (!controller.signal.aborted) {
          setRails(results.filter((rail) => rail.books.length > 0));
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.error('Explore rails failed', err);
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to load Explore rails');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void fetchRails();

    return () => {
      controller.abort();
    };
  }, [limit, railDefinitions, refreshNonce]);

  return { rails, isLoading, error, refresh };
}
