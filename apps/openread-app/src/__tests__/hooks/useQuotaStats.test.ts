import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { getFallbackConfig } from '@/lib/tier-defaults';
import type { StorageQuotaData } from '@/hooks/useStorageQuota';
import type { UserPlan } from '@/types/quota';
import { useQuotaStats } from '@/hooks/useQuotaStats';

const GB = 1024 * 1024 * 1024;
const tierConfig = getFallbackConfig();

const mockAuthState = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
}));

const mockStorageState = vi.hoisted(() => ({
  quota: null as StorageQuotaData | null,
  isLoading: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));

const mockAiState = vi.hoisted(() => ({
  used: 3,
  limit: 10,
  limitType: 'weekly' as const,
  resetAt: '2026-06-20T00:00:00Z' as string | null,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mockAuthState.user }),
}));

vi.mock('@/hooks/useTierConfig', () => ({
  useTierConfig: () => ({ config: tierConfig, isLoading: false, error: null }),
}));

vi.mock('@/hooks/useStorageQuota', () => ({
  useStorageQuota: () => mockStorageState,
}));

vi.mock('@/store/aiQuotaStore', () => ({
  useAIQuotaStore: (selector: (state: typeof mockAiState) => unknown) => selector(mockAiState),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, vars?: Record<string, unknown>) => {
    if (!vars) return key;
    return Object.entries(vars).reduce(
      (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
      key,
    );
  },
}));

function makeStorageQuota(plan: UserPlan, usedBytes: number): StorageQuotaData {
  const totalBytes = tierConfig.tiers[plan].storage_gb * GB;
  return {
    plan,
    base_gb: tierConfig.tiers[plan].storage_gb,
    addon_gb: 0,
    total_bytes: totalBytes,
    used_bytes: usedBytes,
    available_bytes: Math.max(0, totalBytes - usedBytes),
    percent_used: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0,
    is_over_limit: usedBytes > totalBytes,
    active_addons: [],
    available_addons: [],
  };
}

describe('useQuotaStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.user = { id: 'user-1' };
    mockStorageState.quota = makeStorageQuota('free', 0.4 * GB);
    mockStorageState.isLoading = false;
    mockStorageState.error = null;
    mockAiState.used = 3;
    mockAiState.limit = 10;
    mockAiState.limitType = 'weekly';
    mockAiState.resetAt = '2026-06-20T00:00:00Z';
  });

  it.each(['free', 'reader', 'pro'] as UserPlan[])(
    'uses live storage stats as the plan source for %s',
    (plan) => {
      mockStorageState.quota = makeStorageQuota(plan, 0.25 * GB);

      const { result } = renderHook(() => useQuotaStats());

      expect(result.current.userProfilePlan).toBe(plan);
      expect(result.current.storageQuota?.plan).toBe(plan);
      expect(result.current.quotas[0]).toMatchObject({ name: 'Cloud Sync Storage' });
    },
  );

  it('updates storage usage from live stats without any JWT refresh', () => {
    const { result, rerender } = renderHook(() => useQuotaStats());

    expect(result.current.quotas[0]?.used).toBe(0.4);

    mockStorageState.quota = makeStorageQuota('free', 0.8 * GB);
    rerender();

    expect(result.current.userProfilePlan).toBe('free');
    expect(result.current.quotas[0]?.used).toBe(0.8);
  });

  it('surfaces storage stats failures through the canonical contract', () => {
    const error = new Error('storage unavailable');
    mockStorageState.quota = null;
    mockStorageState.error = error;

    const { result } = renderHook(() => useQuotaStats());

    expect(result.current.userProfilePlan).toBeUndefined();
    expect(result.current.error).toBe(error);
    expect(result.current.quotas.some((quota) => quota.name.includes('Storage'))).toBe(false);
  });

  it('does not expose translation quota while translation is launch-disabled', () => {
    const { result } = renderHook(() => useQuotaStats());

    expect(result.current.quotas.some((quota) => quota.name.includes('Translation'))).toBe(false);
  });
});
