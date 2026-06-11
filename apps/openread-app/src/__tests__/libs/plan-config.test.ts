import { describe, it, expect, vi, beforeAll } from 'vitest';
import { buildPlanCardConfigs, formatCentsToPrice } from '@/libs/payment/plan-config';
import type { PlanCardConfig } from '@/libs/payment/plan-config';
import { getFallbackConfig } from '@/lib/tier-config';

// Suppress logger noise
vi.mock('@/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: vi.fn(),
}));

const fallback = getFallbackConfig();

function labelsFor(config: PlanCardConfig): string[] {
  return config.featureGroups.flatMap((group) => group.features.map((feature) => feature.label));
}

describe('buildPlanCardConfigs', () => {
  let configs: PlanCardConfig[];

  beforeAll(() => {
    configs = buildPlanCardConfigs(fallback);
  });

  it('should return exactly 3 configs in order: free, reader, pro', () => {
    expect(configs).toHaveLength(3);
    expect(configs[0]!.plan).toBe('free');
    expect(configs[1]!.plan).toBe('reader');
    expect(configs[2]!.plan).toBe('pro');
  });

  it('should populate display names from tier config', () => {
    expect(configs[0]!.displayName).toBe('Free');
    expect(configs[1]!.displayName).toBe('Reader');
    expect(configs[2]!.displayName).toBe('Pro');
  });

  it('should populate monthly and annual prices from tier config', () => {
    expect(configs[0]!.monthlyPriceCents).toBe(0);
    expect(configs[0]!.annualPriceCents).toBe(0);
    expect(configs[1]!.monthlyPriceCents).toBe(999);
    expect(configs[1]!.annualPriceCents).toBe(9999);
    expect(configs[2]!.monthlyPriceCents).toBe(1999);
    expect(configs[2]!.annualPriceCents).toBe(19999);
  });

  it('should set "Most Popular" badge on Reader only', () => {
    expect(configs[0]!.badge).toBeUndefined();
    expect(configs[1]!.badge).toBe('Most Popular');
    expect(configs[2]!.badge).toBeUndefined();
  });

  it('should set primary CTA style for Reader, ghost for others', () => {
    expect(configs[0]!.ctaStyle).toBe('ghost');
    expect(configs[1]!.ctaStyle).toBe('primary');
    expect(configs[2]!.ctaStyle).toBe('ghost');
  });

  it('should set correct CTA labels', () => {
    expect(configs[0]!.ctaLabel).toBe('Get Started');
    expect(configs[1]!.ctaLabel).toBe('Start Reading');
    expect(configs[2]!.ctaLabel).toBe('Go Pro');
  });

  describe('canonical card display policy', () => {
    it('should render public aliases for Free without exposing storage', () => {
      expect(labelsFor(configs[0]!)).toEqual([
        'Essential AI',
        'Basic AI models',
        'Starter library',
        'Sync across devices',
      ]);
      expect(labelsFor(configs[0]!).some((label) => label.includes('storage'))).toBe(false);
    });

    it('should render public aliases for Reader from the canonical policy', () => {
      expect(labelsFor(configs[1]!)).toEqual([
        'Standard AI',
        'Standard AI models',
        'Unlimited library',
        'Sync across devices',
        '10 GB cloud storage',
      ]);
    });

    it('should render public aliases for Pro from the canonical policy', () => {
      expect(labelsFor(configs[2]!)).toEqual([
        'Premium AI',
        'Premium AI models',
        'Unlimited library',
        'Sync across devices',
        'Early access',
        '50 GB cloud storage',
      ]);
    });

    it('should make sync a real Free entitlement in the fallback contract', () => {
      expect(fallback.tiers.free.can_sync).toBe(true);
    });
  });
});

describe('formatCentsToPrice', () => {
  it('should format 0 cents as $0.00', () => {
    expect(formatCentsToPrice(0)).toBe('$0.00');
  });

  it('should format 799 cents as $7.99', () => {
    expect(formatCentsToPrice(799)).toBe('$7.99');
  });

  it('should format 1499 cents as $14.99', () => {
    expect(formatCentsToPrice(1499)).toBe('$14.99');
  });

  it('should format 7999 cents as $79.99', () => {
    expect(formatCentsToPrice(7999)).toBe('$79.99');
  });

  it('should format with specified currency', () => {
    // EUR formatting depends on locale
    const result = formatCentsToPrice(799, 'EUR', 'de-DE');
    expect(result).toContain('7,99');
  });
});
