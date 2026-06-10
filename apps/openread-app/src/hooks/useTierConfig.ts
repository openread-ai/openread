'use client';

import { useEffect, useState } from 'react';
import type { TierConfig } from '@/lib/tier-types';
import { getAPIBaseUrl } from '@/services/environment';
const TIER_CONFIG_URL = `${getAPIBaseUrl()}/tier-config`;

export interface UseTierConfigReturn {
  config: TierConfig | null;
  isLoading: boolean;
  error: Error | null;
}

export function useTierConfig(): UseTierConfigReturn {
  const [config, setConfig] = useState<TierConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTierConfig() {
      try {
        const response = await fetch(TIER_CONFIG_URL);
        const body = (await response.json()) as TierConfig | { error?: string };
        if (!response.ok) {
          const message = 'error' in body && body.error ? body.error : 'Tier config request failed';
          throw new Error(`${message} (${response.status})`);
        }
        const nextConfig = body as TierConfig;
        if (!cancelled) {
          setConfig(nextConfig);
          setError(null);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to load tier config');
        if (!cancelled) {
          setConfig(null);
          setError(error);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchTierConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  return { config, isLoading, error };
}
