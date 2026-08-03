'use client';

/**
 * @module hooks/useFeatureGate
 * React hook for checking if a specific feature is available
 * based on the user's subscription tier.
 *
 * Uses the tier gate definitions from `lib/tier-gates` which mirror
 * the `can_*` flags in the `tier_config` Supabase table.
 */

import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useQuotaStats } from '@/hooks/useQuotaStats';
import { useTierConfig } from '@/hooks/useTierConfig';
import type { UserPlan } from '@/types/quota';
import { checkFeatureGate, type GatedFeature, type FeatureGateResult } from '@/lib/tier-gates';
import { getFeatureDefinition } from '@/lib/plan-upgrades';
import { getLaunchFeatureOverrides } from '@/services/launchFeatures';

export type { GatedFeature, FeatureGateResult };

export interface UseFeatureGateReturn extends FeatureGateResult {
  /** Current user plan */
  plan: UserPlan;
  /** Whether the hook is still loading user state */
  isLoading: boolean;
  /** Runtime tier-config load error, if gates cannot be evaluated safely */
  error: Error | null;
}

/**
 * Hook for checking if a specific feature is gated for the current user.
 *
 * @example
 * ```tsx
 * function TTSButton() {
 *   const { allowed, message } = useFeatureGate('tts');
 *   if (!allowed) {
 *     return <UpgradeInline message={message} />;
 *   }
 *   return <Button onClick={startTTS}>Play</Button>;
 * }
 * ```
 */
export function useFeatureGate(feature: GatedFeature): UseFeatureGateReturn {
  const { user } = useAuth();
  const { userProfilePlan, isLoading: isQuotaLoading, error: quotaError } = useQuotaStats();
  const { config, isLoading: isTierConfigLoading, error: tierConfigError } = useTierConfig();

  const isLoading = user === undefined || Boolean(user && isQuotaLoading) || isTierConfigLoading;
  const error = tierConfigError ?? quotaError;

  const plan: UserPlan = useMemo(() => {
    if (!user) return 'free';
    return userProfilePlan || 'free';
  }, [user, userProfilePlan]);

  const gateResult = useMemo(() => {
    if (!config) {
      const definition = getFeatureDefinition(feature);
      return {
        feature,
        label: definition.label,
        allowed: false,
        availableOnAnyTier: false,
        requiredTier: definition.suggestedTier,
        requiredTierName: definition.suggestedTier,
        upgradeIntent: null,
        message: error?.message ?? 'Tier configuration is unavailable.',
        priceDisplay: '',
        ctaText: '',
      } satisfies FeatureGateResult;
    }
    return checkFeatureGate(feature, plan, config, getLaunchFeatureOverrides());
  }, [config, error, feature, plan]);

  return {
    ...gateResult,
    plan,
    isLoading,
    error,
  };
}

export default useFeatureGate;
