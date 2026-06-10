import type { TierConfig, TierDefinition } from '@/lib/tier-types';
import type { PlanInterval, UserPlan } from '@/types/quota';

export type UpgradeFeature =
  | 'library'
  | 'storage'
  | 'sync'
  | 'byok'
  | 'ai_models'
  | 'early_access'
  | 'tts'
  | 'translate'
  | 'boost';

export type BillablePlan = Exclude<UserPlan, 'free'>;
export type BillingInterval = Extract<PlanInterval, 'month' | 'year'>;

export interface FeatureDefinition {
  id: UpgradeFeature;
  label: string;
  suggestedTier: UserPlan;
  isAvailable: (tier: TierDefinition, plan: UserPlan, config: TierConfig) => boolean;
}

export interface UpgradeIntent {
  plan: BillablePlan;
  interval: BillingInterval;
}

export interface FeatureAccessResult {
  feature: UpgradeFeature;
  label: string;
  allowed: boolean;
  availableOnAnyTier: boolean;
  requiredTier: UserPlan;
  requiredTierName: string;
  upgradeIntent: UpgradeIntent | null;
  message: string;
  priceDisplay: string;
  ctaText: string;
}

const PLAN_ORDER: UserPlan[] = ['free', 'reader', 'pro'];

export const FEATURE_REGISTRY: readonly FeatureDefinition[] = [
  {
    id: 'library',
    label: 'Unlimited library',
    suggestedTier: 'reader',
    isAvailable: (tier) => tier.library_limit === null,
  },
  {
    id: 'storage',
    label: 'More cloud storage',
    suggestedTier: 'reader',
    isAvailable: (tier, _plan, config) => tier.storage_gb > config.tiers.free.storage_gb,
  },
  {
    id: 'sync',
    label: 'Cloud Sync',
    suggestedTier: 'reader',
    isAvailable: (tier) => tier.can_sync,
  },
  {
    id: 'byok',
    label: 'Bring Your Own Key',
    suggestedTier: 'reader',
    isAvailable: (tier) => tier.can_byok,
  },
  {
    id: 'ai_models',
    label: 'Standard AI models',
    suggestedTier: 'reader',
    isAvailable: (tier) => tier.ai_model_tier !== 'basic',
  },
  {
    id: 'early_access',
    label: 'Early feature access',
    suggestedTier: 'pro',
    isAvailable: (tier) => tier.early_access,
  },
  {
    id: 'tts',
    label: 'Text-to-Speech',
    suggestedTier: 'reader',
    isAvailable: (tier) => tier.can_tts,
  },
  {
    id: 'translate',
    label: 'Translation',
    suggestedTier: 'pro',
    isAvailable: (tier) => tier.can_translate,
  },
  {
    id: 'boost',
    label: 'AI Boosts',
    suggestedTier: 'reader',
    isAvailable: (tier) => tier.can_boost,
  },
] as const;

export function isBillablePlan(plan: UserPlan | string | undefined): plan is BillablePlan {
  return plan === 'reader' || plan === 'pro';
}

export function normalizeBillingInterval(interval: string | undefined): BillingInterval {
  return interval === 'year' || interval === 'annual' ? 'year' : 'month';
}

export function getFeatureDefinition(feature: UpgradeFeature): FeatureDefinition {
  const definition = FEATURE_REGISTRY.find((item) => item.id === feature);
  if (!definition) throw new Error(`Unknown feature: ${feature}`);
  return definition;
}

function getTierDisplayName(plan: UserPlan, config: TierConfig): string {
  return config.tiers[plan]?.display_name ?? plan;
}

export function formatPriceDisplay(priceCents: number): string {
  if (priceCents <= 0) return '';
  return `$${(priceCents / 100).toFixed(2)}/mo`;
}

export function resolveTargetPlan(targetPlan: UserPlan): UpgradeIntent | null {
  if (!isBillablePlan(targetPlan)) return null;
  return { plan: targetPlan, interval: 'month' };
}

export function resolveFeatureAccess(
  feature: UpgradeFeature,
  currentPlan: UserPlan,
  config: TierConfig,
): FeatureAccessResult {
  const definition = getFeatureDefinition(feature);
  const currentTier = config.tiers[currentPlan] ?? config.tiers.free;
  const allowed = definition.isAvailable(currentTier, currentPlan, config);
  const firstAvailableTier = PLAN_ORDER.find((plan) =>
    definition.isAvailable(config.tiers[plan], plan, config),
  );
  const requiredTier = firstAvailableTier ?? definition.suggestedTier;
  const availableOnAnyTier = firstAvailableTier != null;
  const upgradeIntent = availableOnAnyTier ? resolveTargetPlan(requiredTier) : null;
  const requiredTierName = getTierDisplayName(requiredTier, config);
  const priceDisplay = upgradeIntent
    ? formatPriceDisplay(config.tiers[upgradeIntent.plan].display_price_cents)
    : '';

  const message = allowed
    ? ''
    : availableOnAnyTier && upgradeIntent
      ? `${definition.label} is available on ${requiredTierName}.`
      : `${definition.label} is not currently available.`;

  const ctaText = allowed || !upgradeIntent ? '' : `Start ${requiredTierName} — ${priceDisplay}`;

  return {
    feature,
    label: definition.label,
    allowed,
    availableOnAnyTier,
    requiredTier,
    requiredTierName,
    upgradeIntent,
    message,
    priceDisplay,
    ctaText,
  };
}

export function canSelectPlan(currentPlan: UserPlan | undefined, targetPlan: UserPlan): boolean {
  if (!isBillablePlan(targetPlan)) return false;
  if (!currentPlan) return true;
  return PLAN_ORDER.indexOf(targetPlan) > PLAN_ORDER.indexOf(currentPlan);
}

export function requiresBillingPortal(
  currentPlan: UserPlan | undefined,
  targetPlan: UserPlan,
): boolean {
  if (!currentPlan || currentPlan === 'free' || currentPlan === targetPlan) return false;
  return PLAN_ORDER.indexOf(targetPlan) < PLAN_ORDER.indexOf(currentPlan);
}

export function resolvePlanUpgradeIntent(
  targetPlan: UserPlan,
  interval: BillingInterval = 'month',
): UpgradeIntent | null {
  if (!isBillablePlan(targetPlan)) return null;
  return { plan: targetPlan, interval };
}
