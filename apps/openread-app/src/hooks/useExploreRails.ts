'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogSubject } from '@openread/types';
import {
  createExploreRail,
  getExploreRailHref,
  type ExploreRailDefinition,
} from '@/components/explore/exploreRails';
import { platform } from '@/services/platform/client';
import { createLogger } from '@/utils/logger';
import type { CatalogBook } from '@/types/catalog';

const logger = createLogger('explore-rails');
const MAX_RAILS = 6;

export interface ExploreRailResult extends ExploreRailDefinition {
  href: string;
  books: CatalogBook[];
  total: number;
}

interface UseExploreRailsReturn {
  rails: ExploreRailResult[];
  categories: CatalogSubject[];
  totalActive: number | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useExploreRails(limit = 10, languages: string[] = []): UseExploreRailsReturn {
  const [rails, setRails] = useState<ExploreRailResult[]>([]);
  const [categories, setCategories] = useState<CatalogSubject[]>([]);
  const [totalActive, setTotalActive] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const abortRef = useRef<AbortController>(null);

  const refresh = useCallback(() => setRefreshNonce((value) => value + 1), []);
  const languageKey = languages.join(',');
  const requestedLanguages = useMemo(
    () => (languageKey ? languageKey.split(',') : undefined),
    [languageKey],
  );

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    async function fetchRails() {
      setIsLoading(true);
      setError(null);

      try {
        const [stats, subjectResponse] = await Promise.all([
          platform.catalog.getStats({ signal: controller.signal }),
          platform.catalog.listSubjects({ signal: controller.signal }),
        ]);
        const liveCategories = subjectResponse.subjects.filter((subject) => subject.book_count > 0);
        const railDefinitions = liveCategories.slice(0, MAX_RAILS).map(createExploreRail);
        const results = await Promise.all(
          railDefinitions.map(async (rail) => {
            const data = await platform.catalog.listBooks(
              {
                languages: requestedLanguages,
                subject: rail.params.subject,
                sort: rail.params.sort,
                page: 1,
                limit,
              },
              { signal: controller.signal },
            );
            return {
              ...rail,
              href: getExploreRailHref(rail.id),
              books: (data.books || []) as CatalogBook[],
              total: Number(data.total || 0),
            };
          }),
        );

        if (!controller.signal.aborted) {
          setTotalActive(Number(stats.total_active || 0));
          setCategories(liveCategories);
          setRails(results.filter((rail) => rail.total > 0 && rail.books.length > 0));
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.error('Explore rails failed', err);
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to load Explore rails');
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void fetchRails();
    return () => controller.abort();
  }, [limit, refreshNonce, requestedLanguages]);

  return { rails, categories, totalActive, isLoading, error, refresh };
}
