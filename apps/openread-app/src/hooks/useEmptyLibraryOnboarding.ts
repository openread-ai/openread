'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { LOCAL_PERSISTENCE_PREFIXES } from '@/services/persistence/localPersistenceRegistry';
import {
  readLocalPersistence,
  writeLocalPersistence,
} from '@/services/persistence/localPersistence';
import { useLibraryStore } from '@/store/libraryStore';
import type { EmptyLibraryVariant } from '@/components/platform/empty-library-start-screen';

const COMPLETED_VALUE = 'completed';
const ANONYMOUS_ONBOARDING_SCOPE = 'anonymous';

export function emptyLibraryOnboardingKey(userId: string | null | undefined): string {
  return `${LOCAL_PERSISTENCE_PREFIXES.emptyLibraryOnboarding}${userId ?? ANONYMOUS_ONBOARDING_SCOPE}`;
}

export function markEmptyLibraryOnboardingCompletedForUser(
  userId: string | null | undefined,
): void {
  writeLocalPersistence(emptyLibraryOnboardingKey(userId), COMPLETED_VALUE);
}

function hasCompletedEmptyLibraryOnboarding(userId: string | null | undefined): boolean {
  return readLocalPersistence(emptyLibraryOnboardingKey(userId)) === COMPLETED_VALUE;
}

interface EmptyLibraryOnboardingState {
  variant: EmptyLibraryVariant;
  completeOnboarding: () => void;
  onboardingCompleted: boolean;
  shouldRouteToGetStarted: boolean;
}

export function useEmptyLibraryOnboarding(): EmptyLibraryOnboardingState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const library = useLibraryStore((state) => state.library);
  const lastSyncAt = useLibraryStore((state) => state.lastSyncAt);
  const [, setVersion] = useState(0);

  const onboardingCompleted = hasCompletedEmptyLibraryOnboarding(userId);

  const hasBooksTombstonesOrSyncHistory = library.length > 0 || Boolean(lastSyncAt);
  const shouldRouteToGetStarted = !onboardingCompleted && !hasBooksTombstonesOrSyncHistory;
  const variant: EmptyLibraryVariant = shouldRouteToGetStarted ? 'onboarding' : 'empty-library';

  const completeOnboarding = useCallback(() => {
    markEmptyLibraryOnboardingCompletedForUser(userId);
    setVersion((current) => current + 1);
  }, [userId]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === emptyLibraryOnboardingKey(userId)) {
        setVersion((current) => current + 1);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [userId]);

  return { variant, completeOnboarding, onboardingCompleted, shouldRouteToGetStarted };
}
