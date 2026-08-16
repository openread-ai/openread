import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { getFallbackConfig } from '@/lib/tier-defaults';
import type { UserPlan } from '@/types/quota';

const TEST_TIER_CONFIG = getFallbackConfig();

// Mock state
let mockUser: { id: string } | null = null;
let mockUserProfilePlan: UserPlan | undefined = undefined;
const launchAdapterState = vi.hoisted(() => ({ overrides: {} as Record<string, boolean> }));
const mockTierConfigState = vi.hoisted(() => ({
  config: null as ReturnType<typeof getFallbackConfig> | null,
  isLoading: false,
  error: null as Error | null,
}));

// Mock useAuth
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    token: mockUser ? 'mock-token' : null,
  }),
}));

// Mock useQuotaStats
vi.mock('@/hooks/useQuotaStats', () => ({
  useQuotaStats: () => ({
    quotas: [],
    userProfilePlan: mockUserProfilePlan,
  }),
}));

// Mock tier-config transitive dependencies (supabase, logger)
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

vi.mock('@/hooks/useTierConfig', () => ({
  useTierConfig: () => mockTierConfigState,
}));

vi.mock('@/services/launchFeatures', () => ({
  getLaunchFeatureOverrides: () => launchAdapterState.overrides,
}));

import { useFeatureGate } from '@/hooks/useFeatureGate';

describe('useFeatureGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockUserProfilePlan = undefined;
    launchAdapterState.overrides = {};
    mockTierConfigState.config = TEST_TIER_CONFIG;
    mockTierConfigState.isLoading = false;
    mockTierConfigState.error = null;
  });

  describe('unresolved tier configuration', () => {
    it('reports an honest unavailable state without claiming an upgrade tier', () => {
      const configError = new Error('tier config unavailable');
      mockTierConfigState.config = null;
      mockTierConfigState.error = configError;

      const { result } = renderHook(() => useFeatureGate('byok'));

      expect(result.current.allowed).toBe(false);
      expect(result.current.isResolved).toBe(false);
      expect(result.current.error).toBe(configError);
      expect(result.current.requiredTierName).toBe('');
      expect(result.current.upgradeIntent).toBeNull();
      expect(result.current.message).toBe('tier config unavailable');
      expect(result.current.priceDisplay).toBe('');
      expect(result.current.ctaText).toBe('');
    });
  });

  // ─── Free tier ─────────────────────────────────────────────────────

  describe('free tier', () => {
    beforeEach(() => {
      mockUser = { id: 'user-1' };
      mockUserProfilePlan = 'free';
    });

    it('should disable TTS for free users because TTS is retired for launch', async () => {
      const { result } = renderHook(() => useFeatureGate('tts'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allowed).toBe(false);
      expect(result.current.requiredTier).toBe('reader');
      expect(result.current.requiredTierName).toBe('Reader');
      expect(result.current.message).toContain('Text-to-Speech');
      expect(result.current.message).toContain('not currently available');
      expect(result.current.priceDisplay).toBe('');
      expect(result.current.ctaText).toBe('');
      expect(result.current.plan).toBe('free');
    });

    it('derives the unlimited-library message and CTA from the entitlement registry', async () => {
      const { result } = renderHook(() => useFeatureGate('library'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allowed).toBe(false);
      expect(result.current.message).toBe('Unlimited library is available on Reader.');
      expect(result.current.priceDisplay).toBe('$9.99/mo');
      expect(result.current.ctaText).toBe('Start Reader — $9.99/mo');
      expect(result.current.upgradeIntent).toEqual({ plan: 'reader', interval: 'month' });
    });

    it('should allow sync for free users', async () => {
      const { result } = renderHook(() => useFeatureGate('sync'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allowed).toBe(true);
      expect(result.current.requiredTier).toBe('free');
      expect(result.current.message).toBe('');
    });

    it('should disable translate for free users because translation is retired for launch', async () => {
      const { result } = renderHook(() => useFeatureGate('translate'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allowed).toBe(false);
      expect(result.current.requiredTier).toBe('pro');
      expect(result.current.requiredTierName).toBe('Pro');
      expect(result.current.message).toContain('Translation');
      expect(result.current.message).toContain('not currently available');
      expect(result.current.priceDisplay).toBe('');
      expect(result.current.ctaText).toBe('');
    });

    it('should gate BYOK for free users', async () => {
      const { result } = renderHook(() => useFeatureGate('byok'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allowed).toBe(false);
      expect(result.current.requiredTier).toBe('reader');
      expect(result.current.message).toContain('Bring Your Own Key');
      expect(result.current.message).toContain('not currently available');
      expect(result.current.ctaText).toBe('');
    });

    it('should gate boost for free users', async () => {
      const { result } = renderHook(() => useFeatureGate('boost'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allowed).toBe(false);
      expect(result.current.requiredTier).toBe('reader');
    });
  });

  // ─── Reader tier ───────────────────────────────────────────────────

  describe('reader tier', () => {
    beforeEach(() => {
      mockUser = { id: 'user-1' };
      mockUserProfilePlan = 'reader';
    });

    it('should not allow TTS for reader users because TTS is retired for launch', async () => {
      const { result } = renderHook(() => useFeatureGate('tts'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allowed).toBe(false);
      expect(result.current.message).toContain('not currently available');
      expect(result.current.plan).toBe('reader');
    });

    it('should allow sync for reader users', async () => {
      const { result } = renderHook(() => useFeatureGate('sync'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allowed).toBe(true);
    });

    it('should not allow translate for reader users because translation is retired for launch', async () => {
      const { result } = renderHook(() => useFeatureGate('translate'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allowed).toBe(false);
      expect(result.current.requiredTier).toBe('pro');
      expect(result.current.message).toContain('not currently available');
      expect(result.current.ctaText).toBe('');
    });

    it('should hold BYOK for reader users when the adapter override is unset', async () => {
      const { result } = renderHook(() => useFeatureGate('byok'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allowed).toBe(false);
      expect(result.current.message).toContain('not currently available');
      expect(result.current.ctaText).toBe('');
    });

    it('should transport an explicit BYOK adapter override into the UI gate', async () => {
      launchAdapterState.overrides = { byok: true };
      const { result } = renderHook(() => useFeatureGate('byok'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allowed).toBe(true);
      expect(result.current.message).toBe('');
    });

    it('should not allow boost for reader users because boosts are disabled', async () => {
      const { result } = renderHook(() => useFeatureGate('boost'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allowed).toBe(false);
      expect(result.current.message).toContain('not currently available');
      expect(result.current.ctaText).toBe('');
    });
  });

  // ─── Pro tier ──────────────────────────────────────────────────────

  describe('pro tier', () => {
    beforeEach(() => {
      mockUser = { id: 'user-1' };
      mockUserProfilePlan = 'pro';
    });

    it('should allow live sync for pro users', async () => {
      const { result } = renderHook(() => useFeatureGate('sync'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allowed).toBe(true);
      expect(result.current.message).toBe('');
      expect(result.current.plan).toBe('pro');
    });

    it('should not allow held features for pro users', async () => {
      const features = ['byok', 'tts', 'translate', 'boost'] as const;

      for (const feature of features) {
        const { result } = renderHook(() => useFeatureGate(feature));

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.allowed).toBe(false);
        expect(result.current.message).toContain('not currently available');
        expect(result.current.ctaText).toBe('');
        expect(result.current.plan).toBe('pro');
      }
    });
  });

  // ─── Unauthenticated user ─────────────────────────────────────────

  describe('unauthenticated user', () => {
    it('should gate all features (defaults to free)', async () => {
      mockUser = null;
      mockUserProfilePlan = undefined;

      const { result } = renderHook(() => useFeatureGate('tts'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allowed).toBe(false);
      expect(result.current.plan).toBe('free');
    });
  });

  // ─── Unknown plan ──────────────────────────────────────────────────

  describe('unknown plan', () => {
    it('should fall back to free tier gates', async () => {
      mockUser = { id: 'user-1' };
      mockUserProfilePlan = 'unknown' as UserPlan;

      const { result } = renderHook(() => useFeatureGate('tts'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allowed).toBe(false);
    });
  });

  // ─── S4.2: Price and CTA text ─────────────────────────────────────

  describe('price display in gate result (S4.2)', () => {
    beforeEach(() => {
      mockUser = { id: 'user-1' };
      mockUserProfilePlan = 'free';
    });

    it('should not include price or CTA for retired TTS gate', async () => {
      const { result } = renderHook(() => useFeatureGate('tts'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.priceDisplay).toBe('');
      expect(result.current.ctaText).toBe('');
    });

    it('should not include price or CTA for retired translate gate', async () => {
      const { result } = renderHook(() => useFeatureGate('translate'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.priceDisplay).toBe('');
      expect(result.current.ctaText).toBe('');
    });

    it('should not include price or CTA for allowed sync gate', async () => {
      const { result } = renderHook(() => useFeatureGate('sync'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allowed).toBe(true);
      expect(result.current.priceDisplay).toBe('');
      expect(result.current.ctaText).toBe('');
    });

    it('should include Reader price for BYOK when the adapter override enables it', async () => {
      launchAdapterState.overrides = { byok: true };
      const { result } = renderHook(() => useFeatureGate('byok'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.priceDisplay).toBe('$9.99/mo');
      expect(result.current.ctaText).toContain('Reader');
    });

    it('reader user should see no CTA for retired translate', async () => {
      mockUserProfilePlan = 'reader';
      const { result } = renderHook(() => useFeatureGate('translate'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.priceDisplay).toBe('');
      expect(result.current.ctaText).toBe('');
    });

    it('reader user should have empty ctaText for allowed features', async () => {
      mockUserProfilePlan = 'reader';
      const { result } = renderHook(() => useFeatureGate('sync'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allowed).toBe(true);
      expect(result.current.ctaText).toBe('');
    });
  });
});
