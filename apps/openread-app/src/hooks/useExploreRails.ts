'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EXPLORE_RAILS,
  getExploreRailHref,
  type ExploreRailDefinition,
} from '@/components/explore/exploreRails';
import { platform } from '@/services/platform/client';
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

function buildRailQuery(rail: ExploreRailDefinition, limit: number) {
  return {
    subject: rail.params.subject,
    sources: rail.params.sources,
    minPages: rail.params.minPages,
    maxPages: rail.params.maxPages,
    sort: rail.params.sort,
    page: 1,
    limit,
  };
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
        const results = await Promise.all(
          railDefinitions.map(async (rail) => {
            const data = await platform.catalog.listBooks(buildRailQuery(rail, limit), {
              signal: controller.signal,
            });
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
