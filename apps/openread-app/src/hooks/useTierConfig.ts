'use client';

import { useEffect, useState } from 'react';
import type { TierConfig } from '@/lib/tier-types';
import { platform } from '@/services/platform/client';

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
        const nextConfig = await platform.runtime.getTierConfig();
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
