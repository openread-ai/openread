import { describe, it, expect, vi } from 'vitest';

// Mock tier-config's transitive dependencies (supabase, logger)
vi.mock('@/utils/supabase-admin.server', () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from: vi.fn() })),
}));
vi.mock('@/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import {
  getTierGates,
  checkFeatureGate,
  formatPriceDisplay,
  type GatedFeature,
} from '@/lib/tier-gates';
import { getFallbackConfig } from '@/lib/tier-defaults';
import type { UserPlan } from '@/types/quota';

const TEST_TIER_CONFIG = getFallbackConfig();

describe('tier-gates', () => {
  // ─── getTierGates ──────────────────────────────────────────────────

  describe('getTierGates', () => {
    it('should return correct free tier gates', () => {
      const gates = getTierGates('free', TEST_TIER_CONFIG);
      expect(gates.can_tts).toBe(false);
      expect(gates.can_sync).toBe(true);
      expect(gates.can_translate).toBe(false);
      expect(gates.can_byok).toBe(false);
      expect(gates.can_boost).toBe(false);
    });

    it('should return correct reader tier gates', () => {
      const gates = getTierGates('reader', TEST_TIER_CONFIG);
      expect(gates.can_tts).toBe(false);
      expect(gates.can_sync).toBe(true);
      expect(gates.can_translate).toBe(false);
      expect(gates.can_byok).toBe(false);
      expect(gates.can_boost).toBe(false);
    });

    it('should return correct pro tier gates', () => {
      const gates = getTierGates('pro', TEST_TIER_CONFIG);
      expect(gates.can_tts).toBe(false);
      expect(gates.can_sync).toBe(true);
      expect(gates.can_translate).toBe(false);
      expect(gates.can_byok).toBe(false);
      expect(gates.can_boost).toBe(false);
    });

    it('should fall back to free for unknown plan', () => {
      const gates = getTierGates('unknown' as UserPlan, TEST_TIER_CONFIG);
      expect(gates).toEqual(getTierGates('free', TEST_TIER_CONFIG));
    });
  });

  // ─── checkFeatureGate ─────────────────────────────────────────────

  describe('checkFeatureGate', () => {
    describe('TTS gate', () => {
      it('free: not allowed because TTS is disabled for launch', () => {
        const result = checkFeatureGate('tts', 'free', TEST_TIER_CONFIG);
        expect(result.allowed).toBe(false);
        expect(result.requiredTier).toBe('reader');
        expect(result.requiredTierName).toBe('Reader');
        expect(result.message).toContain('Text-to-Speech');
        expect(result.message).toContain('not currently available');
        expect(result.priceDisplay).toBe('');
        expect(result.ctaText).toBe('');
      });

      it('reader: not allowed because TTS is disabled for launch', () => {
        const result = checkFeatureGate('tts', 'reader', TEST_TIER_CONFIG);
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('not currently available');
      });

      it('pro: not allowed because TTS is disabled for launch', () => {
        const result = checkFeatureGate('tts', 'pro', TEST_TIER_CONFIG);
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('not currently available');
      });
    });

    describe('sync gate', () => {
      it('free: allowed', () => {
        const result = checkFeatureGate('sync', 'free', TEST_TIER_CONFIG);
        expect(result.allowed).toBe(true);
        expect(result.message).toBe('');
      });

      it('reader: allowed', () => {
        const result = checkFeatureGate('sync', 'reader', TEST_TIER_CONFIG);
        expect(result.allowed).toBe(true);
      });

      it('pro: allowed', () => {
        const result = checkFeatureGate('sync', 'pro', TEST_TIER_CONFIG);
        expect(result.allowed).toBe(true);
      });
    });

    describe('translate gate', () => {
      it('free: not allowed because translation is disabled for launch', () => {
        const result = checkFeatureGate('translate', 'free', TEST_TIER_CONFIG);
        expect(result.allowed).toBe(false);
        expect(result.requiredTier).toBe('pro');
        expect(result.requiredTierName).toBe('Pro');
        expect(result.message).toContain('Translation');
        expect(result.message).toContain('not currently available');
        expect(result.priceDisplay).toBe('');
        expect(result.ctaText).toBe('');
      });

      it('reader: not allowed because translation is disabled for launch', () => {
        const result = checkFeatureGate('translate', 'reader', TEST_TIER_CONFIG);
        expect(result.allowed).toBe(false);
        expect(result.requiredTier).toBe('pro');
        expect(result.message).toContain('not currently available');
      });

      it('pro: not allowed because translation is disabled for launch', () => {
        const result = checkFeatureGate('translate', 'pro', TEST_TIER_CONFIG);
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('not currently available');
      });
    });

    describe('BYOK gate', () => {
      it('free: held before tier evaluation', () => {
        const result = checkFeatureGate('byok', 'free', TEST_TIER_CONFIG);
        expect(result.allowed).toBe(false);
        expect(result.requiredTier).toBe('reader');
        expect(result.message).toContain('Bring Your Own Key');
        expect(result.message).toContain('not currently available');
        expect(result.ctaText).toBe('');
      });

      it('reader: held when the app override is unset', () => {
        const result = checkFeatureGate('byok', 'reader', TEST_TIER_CONFIG);
        expect(result.allowed).toBe(false);
      });

      it('reader: allowed when the app override enables BYOK', () => {
        const result = checkFeatureGate('byok', 'reader', TEST_TIER_CONFIG, { byok: true });
        expect(result.allowed).toBe(true);
      });

      it('pro: allowed when the app override enables BYOK', () => {
        const result = checkFeatureGate('byok', 'pro', TEST_TIER_CONFIG, { byok: true });
        expect(result.allowed).toBe(true);
      });
    });

    describe('boost gate', () => {
      it('free: not allowed because boosts are disabled', () => {
        const result = checkFeatureGate('boost', 'free', TEST_TIER_CONFIG);
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('not currently available');
        expect(result.priceDisplay).toBe('');
        expect(result.ctaText).toBe('');
      });

      it('reader: not allowed because boosts are disabled', () => {
        const result = checkFeatureGate('boost', 'reader', TEST_TIER_CONFIG);
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('not currently available');
        expect(result.ctaText).toBe('');
      });

      it('pro: not allowed because boosts are disabled', () => {
        const result = checkFeatureGate('boost', 'pro', TEST_TIER_CONFIG);
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('not currently available');
        expect(result.ctaText).toBe('');
      });
    });

    describe('all features x all plans matrix', () => {
      const features = [
        'tts',
        'sync',
        'translate',
        'byok',
        'boost',
      ] as const satisfies GatedFeature[];
      type GateMatrixFeature = (typeof features)[number];
      const plans: UserPlan[] = ['free', 'reader', 'pro'];

      // Expected: feature -> [free, reader, pro]
      const expected: Record<GateMatrixFeature, [boolean, boolean, boolean]> = {
        tts: [false, false, false],
        sync: [true, true, true],
        translate: [false, false, false],
        byok: [false, false, false],
        boost: [false, false, false],
      };

      for (const feature of features) {
        for (let i = 0; i < plans.length; i++) {
          const plan = plans[i]!;
          const expectedAllowed = expected[feature][i];

          it(`${feature} x ${plan} = ${expectedAllowed ? 'allowed' : 'gated'}`, () => {
            const result = checkFeatureGate(feature, plan, TEST_TIER_CONFIG);
            expect(result.allowed).toBe(expectedAllowed);
          });
        }
      }
    });

    // ─── S4.2: Price display in gate results ──────────────────────────

    describe('price display (S4.2)', () => {
      it('free user TTS gate is disabled without an upgrade CTA', () => {
        const result = checkFeatureGate('tts', 'free', TEST_TIER_CONFIG);
        expect(result.priceDisplay).toBe('');
        expect(result.ctaText).toBe('');
      });

      it('free user sync gate is allowed without an upgrade CTA', () => {
        const result = checkFeatureGate('sync', 'free', TEST_TIER_CONFIG);
        expect(result.allowed).toBe(true);
        expect(result.priceDisplay).toBe('');
        expect(result.ctaText).toBe('');
      });

      it('free user translate gate is disabled without an upgrade CTA', () => {
        const result = checkFeatureGate('translate', 'free', TEST_TIER_CONFIG);
        expect(result.priceDisplay).toBe('');
        expect(result.ctaText).toBe('');
      });

      it('free user BYOK gate shows Reader price when the app override enables it', () => {
        const result = checkFeatureGate('byok', 'free', TEST_TIER_CONFIG, { byok: true });
        expect(result.priceDisplay).toBe('$9.99/mo');
        expect(result.ctaText).toContain('Reader');
      });

      it('reader user translate gate is disabled without an upgrade CTA', () => {
        const result = checkFeatureGate('translate', 'reader', TEST_TIER_CONFIG);
        expect(result.priceDisplay).toBe('');
        expect(result.ctaText).toBe('');
      });

      it('allowed features have empty cta', () => {
        const result = checkFeatureGate('sync', 'reader', TEST_TIER_CONFIG);
        expect(result.allowed).toBe(true);
        expect(result.ctaText).toBe('');
      });

      it('pro user sees empty ctaText for all features, including disabled boosts', () => {
        const features: GatedFeature[] = ['tts', 'sync', 'translate', 'byok', 'boost'];
        for (const feature of features) {
          const result = checkFeatureGate(feature, 'pro', TEST_TIER_CONFIG);
          expect(result.ctaText).toBe('');
        }
      });
    });
  });

  describe('runtime tier config contract', () => {
    it('uses the provided runtime config instead of fallback-only gates', () => {
      const fallback = getFallbackConfig();
      const config = {
        ...fallback,
        tiers: {
          ...fallback.tiers,
          reader: {
            ...fallback.tiers.reader,
            can_tts: true,
          },
        },
      };

      const result = checkFeatureGate('tts', 'reader', config, { tts: true });
      expect(result.allowed).toBe(true);
      expect(getTierGates('reader', config, { tts: true }).can_tts).toBe(true);
    });
  });

  // ─── formatPriceDisplay ─────────────────────────────────────────────

  describe('formatPriceDisplay', () => {
    it('should format 999 cents as $9.99/mo', () => {
      expect(formatPriceDisplay(999)).toBe('$9.99/mo');
    });

    it('should format 1999 cents as $19.99/mo', () => {
      expect(formatPriceDisplay(1999)).toBe('$19.99/mo');
    });

    it('should return empty string for 0 cents', () => {
      expect(formatPriceDisplay(0)).toBe('');
    });

    it('should return empty string for negative cents', () => {
      expect(formatPriceDisplay(-100)).toBe('');
    });

    it('should format 100 cents as $1.00/mo', () => {
      expect(formatPriceDisplay(100)).toBe('$1.00/mo');
    });
  });
});
