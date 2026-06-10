import { describe, expect, it } from 'vitest';
import {
  canSelectPlan,
  normalizeBillingInterval,
  requiresBillingPortal,
  resolveFeatureAccess,
  resolvePlanUpgradeIntent,
} from '@/lib/plan-upgrades';
import { getFallbackConfig } from '@/lib/tier-defaults';

const TEST_TIER_CONFIG = getFallbackConfig();

describe('plan-upgrades', () => {
  it('routes active launch gates to the first paid tier that unlocks them', () => {
    const sync = resolveFeatureAccess('sync', 'free', TEST_TIER_CONFIG);
    expect(sync.allowed).toBe(false);
    expect(sync.requiredTier).toBe('reader');
    expect(sync.upgradeIntent).toEqual({ plan: 'reader', interval: 'month' });
    expect(sync.ctaText).toContain('Reader');

    const earlyAccess = resolveFeatureAccess('early_access', 'reader', TEST_TIER_CONFIG);
    expect(earlyAccess.allowed).toBe(false);
    expect(earlyAccess.requiredTier).toBe('pro');
    expect(earlyAccess.upgradeIntent).toEqual({ plan: 'pro', interval: 'month' });
  });

  it('keeps disabled launch features unavailable without upgrade CTAs', () => {
    for (const feature of ['tts', 'translate', 'boost'] as const) {
      const result = resolveFeatureAccess(feature, 'free', TEST_TIER_CONFIG);
      expect(result.allowed).toBe(false);
      expect(result.availableOnAnyTier).toBe(false);
      expect(result.upgradeIntent).toBeNull();
      expect(result.ctaText).toBe('');
      expect(result.message).toContain('not currently available');
    }
  });

  it('allows only upward paid plan selection', () => {
    expect(canSelectPlan('free', 'reader')).toBe(true);
    expect(canSelectPlan('free', 'pro')).toBe(true);
    expect(canSelectPlan('reader', 'pro')).toBe(true);
    expect(canSelectPlan('reader', 'free')).toBe(false);
    expect(canSelectPlan('pro', 'reader')).toBe(false);
    expect(canSelectPlan('pro', 'pro')).toBe(false);
  });

  it('routes lower-tier paid subscription changes through the billing portal', () => {
    expect(requiresBillingPortal('reader', 'free')).toBe(true);
    expect(requiresBillingPortal('pro', 'reader')).toBe(true);
    expect(requiresBillingPortal('pro', 'free')).toBe(true);
    expect(requiresBillingPortal('free', 'reader')).toBe(false);
    expect(requiresBillingPortal('reader', 'pro')).toBe(false);
    expect(requiresBillingPortal('pro', 'pro')).toBe(false);
  });

  it('normalizes billing intervals and only creates paid plan intents', () => {
    expect(normalizeBillingInterval('annual')).toBe('year');
    expect(normalizeBillingInterval('year')).toBe('year');
    expect(normalizeBillingInterval('month')).toBe('month');
    expect(resolvePlanUpgradeIntent('reader', 'year')).toEqual({
      plan: 'reader',
      interval: 'year',
    });
    expect(resolvePlanUpgradeIntent('free', 'month')).toBeNull();
  });
});
