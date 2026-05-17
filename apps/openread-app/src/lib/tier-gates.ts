/**
 * Client-safe feature gate definitions per tier.
 *
 * These mirror the `can_*` flags from the Gen 3 v3 tier defaults.
 * Runtime source of truth is the `tier_config` Supabase table; this client-safe
 * fallback derives price copy from `lib/tier-defaults.ts`.
 */

import type { UserPlan } from '@/types/quota';
import { getFallbackConfig } from '@/lib/tier-defaults';

export interface TierGates {
  can_tts: boolean;
  can_sync: boolean;
  can_translate: boolean;
  can_byok: boolean;
  can_boost: boolean;
}

function gatesFromTier(plan: UserPlan): TierGates {
  const tier = getFallbackConfig().tiers[plan];
  return {
    can_tts: tier.can_tts,
    can_sync: tier.can_sync,
    can_translate: tier.can_translate,
    can_byok: tier.can_byok,
    can_boost: tier.can_boost,
  };
}

const TIER_GATES: Record<UserPlan, TierGates> = {
  free: gatesFromTier('free'),
  reader: gatesFromTier('reader'),
  pro: gatesFromTier('pro'),
};

/**
 * Get feature gates for a plan. Falls back to free tier for unknown plans.
 */
export function getTierGates(plan: UserPlan): TierGates {
  return TIER_GATES[plan] || TIER_GATES.free;
}

export type GatedFeature = 'tts' | 'sync' | 'translate' | 'byok' | 'boost';

const FEATURE_TO_GATE_KEY: Record<GatedFeature, keyof TierGates> = {
  tts: 'can_tts',
  sync: 'can_sync',
  translate: 'can_translate',
  byok: 'can_byok',
  boost: 'can_boost',
};

/** The minimum tier required for each feature */
const FEATURE_REQUIRED_TIER: Record<GatedFeature, UserPlan> = {
  tts: 'reader',
  sync: 'reader',
  translate: 'pro',
  byok: 'reader',
  boost: 'reader',
};

/** Human-readable tier display names */
const TIER_DISPLAY_NAMES: Record<UserPlan, string> = {
  free: 'Free',
  reader: 'Reader',
  pro: 'Pro',
};

export interface FeatureGateResult {
  /** Whether the current plan allows this feature */
  allowed: boolean;
  /** The minimum tier required to use this feature */
  requiredTier: UserPlan;
  /** Display name for the required tier (e.g. "Reader", "Pro") */
  requiredTierName: string;
  /** Upgrade message for the feature */
  message: string;
  /** Monthly price display string for the required tier (e.g. "$9.99/mo") */
  priceDisplay: string;
  /** Full CTA text with tier name and price (e.g. "Start Reading — $9.99/mo") */
  ctaText: string;
}

/**
 * Format cents as a monthly price string (e.g. 999 -> "$9.99/mo").
 * Returns an empty string for 0 cents (free tier).
 */
export function formatPriceDisplay(priceCents: number): string {
  if (priceCents <= 0) return '';
  return `$${(priceCents / 100).toFixed(2)}/mo`;
}

/**
 * Check whether a specific feature is allowed for a given plan.
 */
export function checkFeatureGate(feature: GatedFeature, plan: UserPlan): FeatureGateResult {
  const gates = getTierGates(plan);
  const gateKey = FEATURE_TO_GATE_KEY[feature];
  const allowed = gates[gateKey];
  const requiredTier = FEATURE_REQUIRED_TIER[feature];
  const requiredTierName = TIER_DISPLAY_NAMES[requiredTier];

  const featureLabels: Record<GatedFeature, string> = {
    tts: 'Text-to-Speech',
    sync: 'Cloud Sync',
    translate: 'Translation',
    byok: 'Bring Your Own Key',
    boost: 'AI Boosts',
  };

  const featureAvailableOnAnyTier = Object.values(TIER_GATES).some((tier) => tier[gateKey]);
  const message = allowed
    ? ''
    : featureAvailableOnAnyTier
      ? `${featureLabels[feature]} is available on ${requiredTierName}.`
      : `${featureLabels[feature]} is not currently available.`;

  // Pull price from the client-safe fallback config
  const config = getFallbackConfig();
  const tierDef = config.tiers[requiredTier] ?? config.tiers.free;
  const priceDisplay = featureAvailableOnAnyTier
    ? formatPriceDisplay(tierDef.display_price_cents)
    : '';
  const ctaText =
    allowed || !featureAvailableOnAnyTier ? '' : `Start ${requiredTierName} \u2014 ${priceDisplay}`;

  return { allowed, requiredTier, requiredTierName, message, priceDisplay, ctaText };
}
