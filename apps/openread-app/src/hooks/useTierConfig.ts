'use client';

import { useEffect, useState } from 'react';
import type { TierConfig } from '@/lib/tier-types';
import { platform } from '@/services/platform/client';

export interface UseTierConfigReturn {
  config: TierConfig | null;
  isLoading: boolean;
  error: Error | null;
}

const MAX_TIER_CONFIG_ATTEMPTS = 3;
const TIER_CONFIG_RETRY_DELAY_MS = 100;

export function useTierConfig(): UseTierConfigReturn {
  const [config, setConfig] = useState<TierConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTierConfig() {
      let lastError = new Error('Failed to load tier config');

      for (let attempt = 1; attempt <= MAX_TIER_CONFIG_ATTEMPTS; attempt += 1) {
        if (cancelled) return;

        try {
          const nextConfig = await platform.runtime.getTierConfig();
          if (!cancelled) {
            setConfig(nextConfig);
            setError(null);
            setIsLoading(false);
          }
          return;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error('Failed to load tier config');
          if (attempt < MAX_TIER_CONFIG_ATTEMPTS) {
            await new Promise((resolve) => window.setTimeout(resolve, TIER_CONFIG_RETRY_DELAY_MS));
          }
        }
      }

      if (!cancelled) {
        setConfig(null);
        setError(lastError);
        setIsLoading(false);
      }
    }

    fetchTierConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  return { config, isLoading, error };
}
