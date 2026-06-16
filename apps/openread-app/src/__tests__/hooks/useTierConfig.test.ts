import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetTierConfig } = vi.hoisted(() => ({
  mockGetTierConfig: vi.fn(),
}));

vi.mock('@/services/platform/client', () => ({
  platform: {
    runtime: {
      getTierConfig: mockGetTierConfig,
    },
  },
}));

const mockTierConfig = {
  tiers: {
    free: { display_name: 'Free' },
    reader: { display_name: 'Reader' },
    pro: { display_name: 'Pro' },
  },
};

describe('useTierConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTierConfig.mockResolvedValue(mockTierConfig);
  });

  afterEach(() => {
    cleanup();
  });

  it('loads the tier contract through the canonical platform SDK client', async () => {
    const { useTierConfig } = await import('@/hooks/useTierConfig');
    const { result } = renderHook(() => useTierConfig());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetTierConfig).toHaveBeenCalledTimes(1);
    expect(result.current.config).toEqual(mockTierConfig);
    expect(result.current.error).toBeNull();
  });

  it('fails closed when the canonical tier contract cannot be loaded', async () => {
    mockGetTierConfig.mockRejectedValue(new Error('tier config unavailable'));

    const { useTierConfig } = await import('@/hooks/useTierConfig');
    const { result } = renderHook(() => useTierConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.config).toBeNull();
    expect(result.current.error?.message).toBe('tier config unavailable');
  });
});
