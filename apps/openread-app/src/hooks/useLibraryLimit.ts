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
import { canAddBook as resolveCanAddBook } from '@openread/entitlements';
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
  /** Whether the hook data is still loading */
  isLoading: boolean;
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
  const decision = resolveCanAddBook(config, plan, currentBookCount);
  return { allowed: decision.allowed, limit: decision.limit };
}

/**
 * React hook for library quota state.
 *
 * Upgrade presentation is resolved separately at the UI boundary so this hook
 * remains authoritative only for whether another book can be added.
 */
export function useLibraryLimit(): LibraryLimitInfo {
  const { user } = useAuth();
  const { userProfilePlan, isLoading: isQuotaLoading } = useQuotaStats();
  const { config, isLoading: isTierConfigLoading } = useTierConfig();
  const library = useLibraryStore((state) => state.library);

  const isLoading = user === undefined || Boolean(user && isQuotaLoading) || isTierConfigLoading;

  const plan: UserPlan = useMemo(() => {
    if (!user) return 'free';
    return userProfilePlan || 'free';
  }, [user, userProfilePlan]);

  const currentCount = useMemo(() => {
    return library.filter((b) => !b.deletedAt).length;
  }, [library]);

  const { canAddBook, libraryLimit } = useMemo(() => {
    if (!config) {
      return {
        canAddBook: false,
        libraryLimit: 0,
      };
    }

    const { allowed, limit } = checkLibraryLimit(currentCount, plan, config);
    return {
      canAddBook: allowed,
      libraryLimit: limit,
    };
  }, [config, currentCount, plan]);

  return {
    canAddBook,
    libraryLimit,
    currentCount,
    plan,
    isLoading,
  };
}
