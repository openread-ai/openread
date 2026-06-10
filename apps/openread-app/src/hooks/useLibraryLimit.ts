'use client';

/**
 * @module hooks/useLibraryLimit
 *
 * Client-side hook for checking whether the current user can add books
 * to their library, based on the tier-config library_limit.
 *
 * Uses the client-safe tier contract endpoint. If the runtime config cannot
 * be loaded, book additions are denied rather than guessed from stale defaults.
 */

import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useQuotaStats } from '@/hooks/useQuotaStats';
import { useLibraryStore } from '@/store/libraryStore';
import { useTierConfig } from '@/hooks/useTierConfig';
import type { TierConfig } from '@/lib/tier-types';
import type { UserPlan } from '@/types/quota';

export interface LibraryLimitInfo {
  /** Whether the user can add at least one more book */
  canAddBook: boolean;
  /** The library_limit for the user's tier, or null if unlimited */
  libraryLimit: number | null;
  /** Current number of non-deleted books in the library */
  currentCount: number;
  /** Current user plan */
  plan: UserPlan;
  /** Display name of the next paid tier (for upgrade CTA) */
  upgradeTierName: string;
  /** Monthly price in cents of the cheapest paid tier (for upgrade CTA) */
  upgradePriceCents: number;
  /** Whether the hook data is still loading */
  isLoading: boolean;
}

/**
 * Get the library_limit for a given plan from the provided tier config.
 * Returns null for unlimited (paid tiers).
 */
export function getLibraryLimitForPlan(plan: UserPlan, config: TierConfig): number | null {
  const tier = config.tiers[plan] ?? config.tiers.free;
  return tier.library_limit;
}

/**
 * Check whether a user with the given plan and book count can add a book.
 * Pure function — no hooks, safe to call anywhere.
 */
export function checkLibraryLimit(
  currentBookCount: number,
  plan: UserPlan,
  config: TierConfig,
): { allowed: boolean; limit: number | null } {
  const limit = getLibraryLimitForPlan(plan, config);
  if (limit === null) return { allowed: true, limit: null };
  return { allowed: currentBookCount < limit, limit };
}

/**
 * React hook for library limit state.
 *
 * @example
 * ```tsx
 * const { canAddBook, libraryLimit, upgradePriceCents } = useLibraryLimit();
 * if (!canAddBook) {
 *   return <LibraryLimitBanner limit={libraryLimit} priceCents={upgradePriceCents} />;
 * }
 * ```
 */
export function useLibraryLimit(): LibraryLimitInfo {
  const { user } = useAuth();
  const { userProfilePlan } = useQuotaStats();
  const { config, isLoading: isTierConfigLoading } = useTierConfig();
  const library = useLibraryStore((state) => state.library);

  const isLoading = user === undefined || isTierConfigLoading;

  const plan: UserPlan = useMemo(() => {
    if (!user) return 'free';
    return userProfilePlan || 'free';
  }, [user, userProfilePlan]);

  const currentCount = useMemo(() => {
    return library.filter((b) => !b.deletedAt).length;
  }, [library]);

  const { canAddBook, libraryLimit, upgradeTierName, upgradePriceCents } = useMemo(() => {
    if (!config) {
      return {
        canAddBook: false,
        libraryLimit: 0,
        upgradeTierName: '',
        upgradePriceCents: 0,
      };
    }

    const { allowed, limit } = checkLibraryLimit(currentCount, plan, config);
    const readerTier = config.tiers.reader;
    return {
      canAddBook: allowed,
      libraryLimit: limit,
      upgradeTierName: readerTier.display_name,
      upgradePriceCents: readerTier.display_price_cents,
    };
  }, [config, currentCount, plan]);

  return {
    canAddBook,
    libraryLimit,
    currentCount,
    plan,
    upgradeTierName,
    upgradePriceCents,
    isLoading,
  };
}
