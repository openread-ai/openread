import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockWarn = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    warn: (...args: unknown[]) => mockWarn(...args),
  }),
}));

vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: () => ({ from: mockFrom }),
}));

import { normalizeUserPlan, resolveServerUserPlan } from '@/lib/server-plan';

function mockPlanRow(plan: string | null, error: unknown = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue({ data: plan == null ? null : { plan }, error }),
  };
  mockFrom.mockReturnValue(query);
  return query;
}

describe('server-plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes legacy plan values', () => {
    expect(normalizeUserPlan('plus')).toBe('reader');
    expect(normalizeUserPlan('purchase')).toBe('free');
    expect(normalizeUserPlan('reader')).toBe('reader');
    expect(normalizeUserPlan('pro')).toBe('pro');
    expect(normalizeUserPlan(null)).toBe('free');
    expect(normalizeUserPlan('unknown')).toBe('free');
  });

  it('resolves canonical plan from plans table', async () => {
    mockPlanRow('pro');

    await expect(resolveServerUserPlan('user-1')).resolves.toBe('pro');

    expect(mockFrom).toHaveBeenCalledWith('plans');
  });

  it('falls back to free when plan lookup fails', async () => {
    mockPlanRow(null, { message: 'db unavailable' });

    await expect(resolveServerUserPlan('user-1')).resolves.toBe('free');

    expect(mockWarn).toHaveBeenCalled();
  });
});
