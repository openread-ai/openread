import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Mock dependencies
vi.mock('@/utils/access', () => ({
  getAccessToken: vi.fn(() => Promise.resolve('mock-token')),
}));

vi.mock('@/services/environment', () => ({
  getAPIBaseUrl: vi.fn(() => ''),
  isWebAppPlatform: vi.fn(() => true),
  isWebDevMode: vi.fn(() => true),
}));

vi.mock('@/utils/event', () => ({
  eventDispatcher: {
    dispatch: vi.fn(),
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { useProviderKeys } from '@/hooks/useProviderKeys';
import { getAccessToken } from '@/utils/access';
import { eventDispatcher } from '@/utils/event';

describe('useProviderKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAccessToken).mockResolvedValue('mock-token');
  });

  it('should fetch keys on mount', async () => {
    const mockKeys = [
      { provider: 'openai', keyPrefix: 'sk-...7890', isValid: true, lastTestedAt: null },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockKeys),
    });

    const { result } = renderHook(() => useProviderKeys());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.keys).toEqual(mockKeys);
    expect(result.current.error).toBeNull();
  });

  it('should handle fetch error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useProviderKeys());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.keys).toEqual([]);
    expect(result.current.error).toBe('Failed to fetch provider keys');
  });

  it('should handle no auth token', async () => {
    vi.mocked(getAccessToken).mockResolvedValue(null);

    const { result } = renderHook(() => useProviderKeys());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.keys).toEqual([]);
  });

  it('should add a key', async () => {
    // Initial fetch returns empty
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const { result } = renderHook(() => useProviderKeys());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Mock add key response, then refresh response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ provider: 'openai', keyPrefix: 'sk-...7890', isValid: true }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { provider: 'openai', keyPrefix: 'sk-...7890', isValid: true, lastTestedAt: null },
        ]),
    });

    let success: boolean = false;
    await act(async () => {
      success = await result.current.addKey('openai', 'sk-proj-test1234567');
    });

    expect(success).toBe(true);
    expect(eventDispatcher.dispatch).toHaveBeenCalledWith('toast', {
      type: 'success',
      message: 'openai key saved',
    });
  });

  it('should handle add key failure', async () => {
    // Initial fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const { result } = renderHook(() => useProviderKeys());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Mock add key failure
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'BYOK keys require a Plus or Pro subscription' }),
    });

    let success: boolean = true;
    await act(async () => {
      success = await result.current.addKey('openai', 'sk-proj-test1234567');
    });

    expect(success).toBe(false);
    expect(eventDispatcher.dispatch).toHaveBeenCalledWith('toast', {
      type: 'error',
      message: 'BYOK keys require a Plus or Pro subscription',
    });
  });

  it('should remove a key', async () => {
    const mockKeys = [
      { provider: 'openai', keyPrefix: 'sk-...7890', isValid: true, lastTestedAt: null },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockKeys),
    });

    const { result } = renderHook(() => useProviderKeys());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Mock delete response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    let success: boolean = false;
    await act(async () => {
      success = await result.current.removeKey('openai');
    });

    expect(success).toBe(true);
    // Optimistic removal
    expect(result.current.keys).toEqual([]);
    expect(eventDispatcher.dispatch).toHaveBeenCalledWith('toast', {
      type: 'success',
      message: 'openai key removed',
    });
  });

  it('should test a key', async () => {
    const mockKeys = [
      { provider: 'openai', keyPrefix: 'sk-...7890', isValid: true, lastTestedAt: null },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockKeys),
    });

    const { result } = renderHook(() => useProviderKeys());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Mock test response, then refresh response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ isValid: true }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            provider: 'openai',
            keyPrefix: 'sk-...7890',
            isValid: true,
            lastTestedAt: '2025-01-15T00:00:00Z',
          },
        ]),
    });

    let testResult: { isValid: boolean; error?: string } | undefined;
    await act(async () => {
      testResult = await result.current.testKey('openai');
    });

    expect(testResult?.isValid).toBe(true);
  });

  it('should handle test key failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const { result } = renderHook(() => useProviderKeys());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Mock test failure
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'No key found for this provider' }),
    });

    let testResult: { isValid: boolean; error?: string } | undefined;
    await act(async () => {
      testResult = await result.current.testKey('openai');
    });

    expect(testResult?.isValid).toBe(false);
    expect(testResult?.error).toBe('No key found for this provider');
  });

  it('should call refresh to re-fetch keys', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const { result } = renderHook(() => useProviderKeys());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Mock refresh response with new data
    const updatedKeys = [
      { provider: 'anthropic', keyPrefix: 'sk-...efgh', isValid: true, lastTestedAt: null },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(updatedKeys),
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.keys).toEqual(updatedKeys);
  });
});
