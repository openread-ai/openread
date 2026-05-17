import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useFeatureFlags,
  useCanSync,
  useCanAnalyze,
  useCanUseKnowledgeGraph,
} from '@/hooks/useFeatureFlags';
import type { UserPlan } from '@/types/quota';

// Mock state
let mockUser: { id: string } | null = null;
let mockUserProfilePlan: UserPlan | undefined = undefined;

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

describe('useFeatureFlags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockUserProfilePlan = undefined;
  });

  describe('unauthenticated user', () => {
    it('should return free tier flags when no user', async () => {
      mockUser = null;
      mockUserProfilePlan = undefined;

      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.plan).toBe('free');
      expect(result.current.flags.maxBooks).toBe(10);
      expect(result.current.flags.aiAnalysis).toBe(true);
      expect(result.current.flags.knowledgeGraph).toBe(false);
    });
  });

  describe('free tier user', () => {
    beforeEach(() => {
      mockUser = { id: 'user-1' };
      mockUserProfilePlan = 'free';
    });

    it('should return free tier flags', async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.plan).toBe('free');
      // Tier-gate driven flags
      expect(result.current.flags.canTTS).toBe(false);
      expect(result.current.flags.cloudSync).toBe(false);
      expect(result.current.flags.canTranslate).toBe(false);
      expect(result.current.flags.canBYOK).toBe(false);
      expect(result.current.flags.canBoost).toBe(false);
      // Limit-based flags
      expect(result.current.flags.aiAnalysis).toBe(true);
      expect(result.current.flags.knowledgeGraph).toBe(false);
      expect(result.current.flags.marketplace).toBe(true);
      expect(result.current.flags.maxBooks).toBe(10);
      expect(result.current.flags.maxCloudStorage).toBe(1 * 1024 * 1024 * 1024); // 1GB
    });

    it('should return false for canTTS', async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canTTS()).toBe(false);
    });

    it('should return false for canTranslate', async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canTranslate()).toBe(false);
    });

    it('should return false for canBYOK', async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canBYOK()).toBe(false);
    });

    it('should return false for canSync (tier-gated, not just auth)', async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Free tier: can_sync is false, so canSync() is false even if authenticated
      expect(result.current.canSync()).toBe(false);
    });

    it('should return true for canAnalyze', async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canAnalyze()).toBe(true);
    });

    it('should correctly check book limit', async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canAddBook(9)).toBe(true);
      expect(result.current.canAddBook(10)).toBe(false);
      expect(result.current.canAddBook(11)).toBe(false);
    });
  });

  describe('reader tier user', () => {
    beforeEach(() => {
      mockUser = { id: 'user-1' };
      mockUserProfilePlan = 'reader';
    });

    it('should return reader tier flags', async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.plan).toBe('reader');
      // Tier-gate driven flags
      expect(result.current.flags.canTTS).toBe(true);
      expect(result.current.flags.cloudSync).toBe(true);
      expect(result.current.flags.canTranslate).toBe(false);
      expect(result.current.flags.canBYOK).toBe(true);
      expect(result.current.flags.canBoost).toBe(false);
      // Limit-based flags
      expect(result.current.flags.aiAnalysis).toBe(true);
      expect(result.current.flags.knowledgeGraph).toBe(false);
      expect(result.current.flags.marketplace).toBe(true);
      expect(result.current.flags.maxBooks).toBe(Infinity);
      expect(result.current.flags.maxCloudStorage).toBe(10 * 1024 * 1024 * 1024); // 10GB
    });

    it('should return true for canTTS', async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canTTS()).toBe(true);
    });

    it('should return false for canTranslate (reader has no translation)', async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canTranslate()).toBe(false);
    });

    it('should return true for canBYOK', async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canBYOK()).toBe(true);
    });

    it('should return true for canSync', async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canSync()).toBe(true);
    });

    it('should return true for canAnalyze', async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canAnalyze()).toBe(true);
    });
  });

  describe('pro tier user', () => {
    beforeEach(() => {
      mockUser = { id: 'user-1' };
      mockUserProfilePlan = 'pro';
    });

    it('should return pro tier flags', async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.plan).toBe('pro');
      // Tier-gate driven flags - all true for pro
      expect(result.current.flags.canTTS).toBe(true);
      expect(result.current.flags.cloudSync).toBe(true);
      expect(result.current.flags.canTranslate).toBe(true);
      expect(result.current.flags.canBYOK).toBe(true);
      expect(result.current.flags.canBoost).toBe(false);
      // Limit-based flags
      expect(result.current.flags.aiAnalysis).toBe(true);
      expect(result.current.flags.knowledgeGraph).toBe(true);
      expect(result.current.flags.marketplace).toBe(true);
      expect(result.current.flags.maxBooks).toBe(Infinity);
      expect(result.current.flags.maxCloudStorage).toBe(50 * 1024 * 1024 * 1024); // 50GB
      expect(result.current.flags.prioritySupport).toBe(true);
    });

    it('should return true for canTranslate (pro only)', async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canTranslate()).toBe(true);
    });

    it('should return true for canUseKnowledgeGraph', async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canUseKnowledgeGraph()).toBe(true);
    });

    it('should always allow adding books', async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.canAddBook(1000)).toBe(true);
      expect(result.current.canAddBook(10000)).toBe(true);
    });
  });

  describe('unknown plan falls back to free', () => {
    beforeEach(() => {
      mockUser = { id: 'user-1' };
      // Simulate an unknown plan value (e.g. legacy 'purchase') from token
      mockUserProfilePlan = 'bogus' as UserPlan;
    });

    it('should return free tier flags for unknown plan', async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.flags.aiAnalysis).toBe(true);
      expect(result.current.flags.knowledgeGraph).toBe(false);
      expect(result.current.flags.canTTS).toBe(false);
      expect(result.current.flags.cloudSync).toBe(false);
    });
  });

  describe('hasStorageQuota', () => {
    it('should return true when within quota', async () => {
      mockUser = { id: 'user-1' };
      mockUserProfilePlan = 'reader';

      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const currentUsage = 1 * 1024 * 1024 * 1024; // 1GB
      const additional = 1 * 1024 * 1024 * 1024; // 1GB

      expect(result.current.hasStorageQuota(currentUsage, additional)).toBe(true);
    });

    it('should return false when exceeding quota', async () => {
      mockUser = { id: 'user-1' };
      mockUserProfilePlan = 'free';

      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const currentUsage = 0;
      const additional = 2 * 1024 * 1024 * 1024; // Free has 1GB cloud storage

      expect(result.current.hasStorageQuota(currentUsage, additional)).toBe(false);
    });
  });

  describe('hasTranslationQuota', () => {
    it('should return true when within quota', async () => {
      mockUser = { id: 'user-1' };
      mockUserProfilePlan = 'pro';

      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const currentUsage = 5 * 1024; // 5K chars
      const additional = 2 * 1024; // 2K chars

      expect(result.current.hasTranslationQuota(currentUsage, additional)).toBe(true);
    });

    it('should return false when exceeding quota', async () => {
      mockUser = { id: 'user-1' };
      mockUserProfilePlan = 'free';

      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const currentUsage = 0;
      const additional = 1; // Free has no translation access

      expect(result.current.hasTranslationQuota(currentUsage, additional)).toBe(false);
    });
  });
});

describe('useCanSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockUserProfilePlan = undefined;
  });

  it('should return false when not authenticated', async () => {
    mockUser = null;

    const { result } = renderHook(() => useCanSync());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.canSync).toBe(false);
  });

  it('should return false for free authenticated user (tier-gated)', async () => {
    mockUser = { id: 'user-1' };
    mockUserProfilePlan = 'free';

    const { result } = renderHook(() => useCanSync());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Free tier: can_sync is false
    expect(result.current.canSync).toBe(false);
  });

  it('should return true for reader user', async () => {
    mockUser = { id: 'user-1' };
    mockUserProfilePlan = 'reader';

    const { result } = renderHook(() => useCanSync());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.canSync).toBe(true);
  });
});

describe('useCanAnalyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockUserProfilePlan = undefined;
  });

  it('should return true for free users', async () => {
    mockUser = { id: 'user-1' };
    mockUserProfilePlan = 'free';

    const { result } = renderHook(() => useCanAnalyze());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.canAnalyze).toBe(true);
  });

  it('should return true for pro users', async () => {
    mockUser = { id: 'user-1' };
    mockUserProfilePlan = 'pro';

    const { result } = renderHook(() => useCanAnalyze());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.canAnalyze).toBe(true);
  });
});

describe('useCanUseKnowledgeGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockUserProfilePlan = undefined;
  });

  it('should return false for reader users', async () => {
    mockUser = { id: 'user-1' };
    mockUserProfilePlan = 'reader';

    const { result } = renderHook(() => useCanUseKnowledgeGraph());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.canUseKnowledgeGraph).toBe(false);
  });

  it('should return true for pro users', async () => {
    mockUser = { id: 'user-1' };
    mockUserProfilePlan = 'pro';

    const { result } = renderHook(() => useCanUseKnowledgeGraph());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.canUseKnowledgeGraph).toBe(true);
  });
});
