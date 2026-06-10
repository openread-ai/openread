/**
 * Client-safe feature gate definitions per tier.
 *
 * Runtime source of truth is the `tier_config` Supabase table. This module is a
 * compatibility facade over the canonical upgrade/feature registry in
 * `plan-upgrades.ts`, so feature availability, upgrade CTAs, and plan checkout
 * intents stay aligned as launch features are added or removed.
 */

import type { UserPlan } from '@/types/quota';
import type { TierConfig } from '@/lib/tier-types';
import {
  FEATURE_REGISTRY,
  formatPriceDisplay,
  resolveFeatureAccess,
  type FeatureAccessResult,
  type UpgradeFeature,
} from '@/lib/plan-upgrades';

export interface TierGates {
  can_tts: boolean;
  can_sync: boolean;
  can_translate: boolean;
  can_byok: boolean;
  can_boost: boolean;
}

const GATE_FEATURES = {
  can_tts: 'tts',
  can_sync: 'sync',
  can_translate: 'translate',
  can_byok: 'byok',
  can_boost: 'boost',
} as const satisfies Record<keyof TierGates, UpgradeFeature>;

/**
 * Get feature gates for a plan. Falls back to free tier for unknown plans.
 */
export function getTierGates(plan: UserPlan, config: TierConfig): TierGates {
  const normalizedPlan = config.tiers[plan] ? plan : 'free';
  return {
    can_tts: resolveFeatureAccess(GATE_FEATURES.can_tts, normalizedPlan, config).allowed,
    can_sync: resolveFeatureAccess(GATE_FEATURES.can_sync, normalizedPlan, config).allowed,
    can_translate: resolveFeatureAccess(GATE_FEATURES.can_translate, normalizedPlan, config)
      .allowed,
    can_byok: resolveFeatureAccess(GATE_FEATURES.can_byok, normalizedPlan, config).allowed,
    can_boost: resolveFeatureAccess(GATE_FEATURES.can_boost, normalizedPlan, config).allowed,
  };
}

export type GatedFeature = UpgradeFeature;

/** Human-readable tier display names */
const TIER_DISPLAY_NAMES: Record<UserPlan, string> = {
  free: 'Free',
  reader: 'Reader',
  pro: 'Pro',
};

export type FeatureGateResult = FeatureAccessResult;

/**
 * Check whether a specific feature is allowed for a given plan.
 */
export function checkFeatureGate(
  feature: GatedFeature,
  plan: UserPlan,
  config: TierConfig,
): FeatureGateResult {
  return resolveFeatureAccess(feature, plan, config);
}

export { FEATURE_REGISTRY, TIER_DISPLAY_NAMES, formatPriceDisplay };
