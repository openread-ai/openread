import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: vi.fn(() => mockSupabase),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('@/lib/tier-config', () => ({
  getTierDefinition: vi.fn((plan: string) => {
    const tiers: Record<string, { storage_gb: number }> = {
      free: { storage_gb: 1 },
      reader: { storage_gb: 10 },
      pro: { storage_gb: 50 },
    };
    return Promise.resolve(tiers[plan] || tiers.free);
  }),
}));

const BYTES_PER_GB = 1024 * 1024 * 1024;

function setupPlanQuery(data: { storage_used_bytes: number } | null, error: unknown = null) {
  const mockSingle = vi.fn().mockResolvedValue({ data, error });
  const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
  return { select: mockSelect };
}

describe('storage-quota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStorageQuota', () => {
    it('calculates quota from tier storage only', async () => {
      const planResult = setupPlanQuery({ storage_used_bytes: 0 });
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'plans') return planResult;
        throw new Error(`Unexpected table: ${table}`);
      });

      const { getStorageQuota } = await import('@/lib/storage-quota');
      const quota = await getStorageQuota('user-1', 'reader');

      expect(quota.baseGb).toBe(10);
      expect(quota.addonGb).toBe(0);
      expect(quota.totalBytes).toBe(10 * BYTES_PER_GB);
      expect(quota.usedBytes).toBe(0);
      expect(quota.availableBytes).toBe(10 * BYTES_PER_GB);
      expect(quota.percentUsed).toBe(0);
      expect(quota.isOverLimit).toBe(false);
      expect(mockSupabase.from).toHaveBeenCalledWith('plans');
      expect(mockSupabase.from).not.toHaveBeenCalledWith('storage_addons');
    });

    it('calculates usage percentage for tier storage', async () => {
      const planResult = setupPlanQuery({ storage_used_bytes: BYTES_PER_GB });
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'plans') return planResult;
        return {};
      });

      const { getStorageQuota } = await import('@/lib/storage-quota');
      const quota = await getStorageQuota('user-1', 'reader');

      expect(quota.percentUsed).toBe(10);
      expect(quota.isOverLimit).toBe(false);
      expect(quota.availableBytes).toBe(9 * BYTES_PER_GB);
    });

    it('reports over-limit when usage exceeds tier storage', async () => {
      const usedBytes = 11 * BYTES_PER_GB;
      const planResult = setupPlanQuery({ storage_used_bytes: usedBytes });
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'plans') return planResult;
        return {};
      });

      const { getStorageQuota } = await import('@/lib/storage-quota');
      const quota = await getStorageQuota('user-1', 'reader');

      expect(quota.isOverLimit).toBe(true);
      expect(quota.percentUsed).toBeCloseTo(110, 5);
      expect(quota.availableBytes).toBe(0);
    });

    it('supports the free tier storage allowance', async () => {
      const planResult = setupPlanQuery({ storage_used_bytes: 0 });
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'plans') return planResult;
        return {};
      });

      const { getStorageQuota } = await import('@/lib/storage-quota');
      const quota = await getStorageQuota('user-1', 'free');

      expect(quota.baseGb).toBe(1);
      expect(quota.totalBytes).toBe(BYTES_PER_GB);
      expect(quota.addonGb).toBe(0);
    });

    it('defaults used bytes to 0 when the usage query fails', async () => {
      const planResult = setupPlanQuery(null, { message: 'DB error' });
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'plans') return planResult;
        return {};
      });

      const { getStorageQuota } = await import('@/lib/storage-quota');
      const quota = await getStorageQuota('user-1', 'reader');

      expect(quota.usedBytes).toBe(0);
      expect(quota.totalBytes).toBe(10 * BYTES_PER_GB);
    });
  });

  describe('add-on compatibility helpers', () => {
    it('returns no active add-ons', async () => {
      const { getActiveAddons } = await import('@/lib/storage-quota');
      const addons = await getActiveAddons('user-1');

      expect(addons).toEqual([]);
      expect(mockSupabase.from).not.toHaveBeenCalledWith('storage_addons');
    });

    it('returns zero add-on storage', async () => {
      const { getAddonStorageGb } = await import('@/lib/storage-quota');
      const total = await getAddonStorageGb('user-1');

      expect(total).toBe(0);
    });

    it('does not create storage add-ons', async () => {
      const { createStorageAddon } = await import('@/lib/storage-quota');
      const addon = await createStorageAddon('user-1', 25, 499, 'sub_test');

      expect(addon).toBeNull();
      expect(mockSupabase.from).not.toHaveBeenCalledWith('storage_addons');
    });

    it('does not cancel storage add-ons', async () => {
      const { cancelStorageAddon } = await import('@/lib/storage-quota');
      const success = await cancelStorageAddon('addon-1');

      expect(success).toBe(false);
      expect(mockSupabase.from).not.toHaveBeenCalledWith('storage_addons');
    });
  });

  describe('storage usage tracking', () => {
    it('increments storage used via RPC', async () => {
      mockSupabase.rpc.mockResolvedValue({ error: null });

      const { incrementStorageUsed } = await import('@/lib/storage-quota');
      const success = await incrementStorageUsed('user-1', 1024);

      expect(success).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('increment_storage_used', {
        p_user_id: 'user-1',
        p_bytes: 1024,
      });
    });

    it('returns false when increment RPC fails', async () => {
      mockSupabase.rpc.mockResolvedValue({ error: { message: 'RPC failed' } });

      const { incrementStorageUsed } = await import('@/lib/storage-quota');
      const success = await incrementStorageUsed('user-1', 1024);

      expect(success).toBe(false);
    });

    it('decrements storage used via RPC', async () => {
      mockSupabase.rpc.mockResolvedValue({ error: null });

      const { decrementStorageUsed } = await import('@/lib/storage-quota');
      const success = await decrementStorageUsed('user-1', 1024);

      expect(success).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('decrement_storage_used', {
        p_user_id: 'user-1',
        p_bytes: 1024,
      });
    });

    it('returns false when decrement RPC fails', async () => {
      mockSupabase.rpc.mockResolvedValue({ error: { message: 'RPC failed' } });

      const { decrementStorageUsed } = await import('@/lib/storage-quota');
      const success = await decrementStorageUsed('user-1', 1024);

      expect(success).toBe(false);
    });
  });
});
