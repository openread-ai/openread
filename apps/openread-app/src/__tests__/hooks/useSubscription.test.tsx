import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvailablePlan } from '@/types/quota';

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockUseAuth = vi.fn();
const mockUseEnv = vi.fn();
const mockGetAccessToken = vi.fn();
const mockUseAvailablePlans = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => mockUseEnv(),
}));

vi.mock('@/utils/access', () => ({
  getAccessToken: () => mockGetAccessToken(),
}));

vi.mock('@/hooks/useAvailablePlans', () => ({
  useAvailablePlans: () => mockUseAvailablePlans(),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/utils/event', () => ({
  eventDispatcher: { dispatch: vi.fn() },
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

vi.mock('@/hooks/useQuotaStats', () => ({
  useQuotaStats: () => {
    throw new Error('useSubscription must not call useQuotaStats');
  },
}));

vi.mock('@/hooks/useStorageQuota', () => ({
  useStorageQuota: () => {
    throw new Error('useSubscription must not call useStorageQuota');
  },
}));

// Load the mocked hook graph during file collection, outside individual test budgets.
await import('@/hooks/useSubscription');

const stripePlans: AvailablePlan[] = [
  {
    plan: 'reader',
    productId: 'price_reader_monthly',
    price: 999,
    currency: 'USD',
    interval: 'month',
    productName: 'Reader Monthly',
  },
];

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('useSubscription billing fast path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' }, token: 'auth-token' });
    mockUseEnv.mockReturnValue({ appService: { hasIAP: false, isIOSApp: false } });
    mockGetAccessToken.mockResolvedValue('access-token');
    mockUseAvailablePlans.mockReturnValue({
      availablePlans: stripePlans,
      iapAvailable: false,
      loading: false,
      error: null,
    });
  });

  it('uses billing subscription summary as the current plan source without storage stats', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/billing/subscription')) {
        return jsonResponse({
          plan: 'reader',
          provider: 'stripe',
          status: 'active',
          currentPeriodEnd: '2030-01-01T00:00:00.000Z',
          cancelAtPeriodEnd: false,
        });
      }
      if (url.includes('/stripe/invoices')) return jsonResponse([]);
      throw new Error(`Unexpected billing fast-path request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { useSubscription } = await import('@/hooks/useSubscription');
    const { result } = renderHook(() => useSubscription());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.subscription).toMatchObject({
      planId: 'reader',
      planName: 'Reader Plan',
      status: 'active',
      source: 'stripe',
      cancelAtPeriodEnd: false,
    });
    expect(result.current.subscription?.currentPeriodEnd?.toISOString()).toBe(
      '2030-01-01T00:00:00.000Z',
    );
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toContain('/api/files/stats');
    expect(fetchMock.mock.calls.map((call) => String(call[0])).join('\n')).not.toContain(
      '/files/stats',
    );
  });

  it('keeps paid billing shell state ready while Stripe invoices are still loading', async () => {
    let releaseInvoices!: () => void;
    const delayedInvoices = new Promise<void>((resolve) => {
      releaseInvoices = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/billing/subscription')) {
        return jsonResponse({
          plan: 'reader',
          provider: 'stripe',
          status: 'active',
          currentPeriodEnd: '2030-01-01T00:00:00.000Z',
          cancelAtPeriodEnd: false,
        });
      }
      if (url.includes('/stripe/invoices')) {
        await delayedInvoices;
        return jsonResponse([]);
      }
      throw new Error(`Unexpected paid billing request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { useSubscription } = await import('@/hooks/useSubscription');
    const { result } = renderHook(() => useSubscription());

    await waitFor(() => expect(result.current.subscription?.planId).toBe('reader'));
    await waitFor(() => expect(result.current.invoicesLoading).toBe(true));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.subscription).toMatchObject({
      planId: 'reader',
      source: 'stripe',
    });
    expect(fetchMock.mock.calls.map((call) => String(call[0])).join('\n')).not.toContain(
      '/files/stats',
    );

    releaseInvoices();
    await waitFor(() => expect(result.current.invoicesLoading).toBe(false));
  });

  it('renders billing shell state while plan products are still loading', async () => {
    mockUseAvailablePlans.mockReturnValue({
      availablePlans: [],
      iapAvailable: false,
      loading: true,
      error: null,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/billing/subscription')) {
          return jsonResponse({ plan: 'free', provider: null });
        }
        throw new Error(`Unexpected request while products load: ${url}`);
      }),
    );

    const { useSubscription } = await import('@/hooks/useSubscription');
    const { result } = renderHook(() => useSubscription());

    await waitFor(() => expect(result.current.subscription?.planId).toBe('free'));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.plansLoading).toBe(true);
    expect(result.current.subscription).toMatchObject({ planId: 'free', source: null });
  });

  it('preserves native provider-owned management state for paid users', async () => {
    mockUseEnv.mockReturnValue({ appService: { hasIAP: true, isIOSApp: true } });
    mockUseAvailablePlans.mockReturnValue({
      availablePlans: [],
      iapAvailable: true,
      loading: false,
      error: null,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/billing/subscription')) {
          return jsonResponse({
            plan: 'pro',
            provider: 'apple',
            status: 'active',
            currentPeriodEnd: '2031-02-03T00:00:00.000Z',
            cancelAtPeriodEnd: true,
          });
        }
        throw new Error(`Unexpected native billing request: ${url}`);
      }),
    );

    const { useSubscription } = await import('@/hooks/useSubscription');
    const { result } = renderHook(() => useSubscription());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.subscription).toMatchObject({
      planId: 'pro',
      source: 'apple',
      cancelAtPeriodEnd: true,
    });
    expect(result.current.billingProvider).toBe('apple');
    expect(result.current.purchaseProvider).toBe('apple');
    expect(result.current.iapAvailable).toBe(true);
  });
});
