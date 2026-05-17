import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StorageSection } from '@/components/settings/storage-section';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, vars?: Record<string, unknown>) => {
    if (!vars) return key;
    let result = key;
    for (const [k, v] of Object.entries(vars)) {
      result = result.replace(`{{${k}}}`, String(v));
    }
    return result;
  },
}));

const mockUserProfilePlan = vi.fn();
vi.mock('@/hooks/useQuotaStats', () => ({
  useQuotaStats: () => ({
    userProfilePlan: mockUserProfilePlan(),
    quotas: [],
  }),
}));

const mockUseStorageQuota = vi.fn();
vi.mock('@/hooks/useStorageQuota', () => ({
  useStorageQuota: () => mockUseStorageQuota(),
}));

vi.mock('@/utils/tailwind', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

const GB = 1024 * 1024 * 1024;

function makeQuota(overrides: Record<string, unknown> = {}) {
  return {
    plan: 'reader',
    base_gb: 10,
    addon_gb: 0,
    total_bytes: 10 * GB,
    used_bytes: 5 * GB,
    available_bytes: 5 * GB,
    percent_used: 50,
    is_over_limit: false,
    active_addons: [],
    available_addons: [],
    ...overrides,
  };
}

function setupHook(
  quota: ReturnType<typeof makeQuota> | null,
  isLoading = false,
  error: Error | null = null,
) {
  mockUseStorageQuota.mockReturnValue({
    quota,
    isLoading,
    error,
    refetch: vi.fn(),
  });
}

describe('StorageSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserProfilePlan.mockReturnValue('reader');
  });

  afterEach(() => {
    cleanup();
  });

  it('shows free storage quota without add-on controls', () => {
    mockUserProfilePlan.mockReturnValue('free');
    setupHook(
      makeQuota({
        plan: 'free',
        base_gb: 1,
        total_bytes: 1 * GB,
        used_bytes: 0.4 * GB,
        available_bytes: 0.6 * GB,
        percent_used: 40,
      }),
    );

    render(<StorageSection />);

    expect(screen.getByText(/409.6 MB.*of.*1 GB.*used/)).toBeTruthy();
    expect(screen.getByText('Up to 1 GB included with Free plan')).toBeTruthy();
    expect(screen.queryByText('Add Storage')).toBeNull();
    expect(screen.queryByText('Active Add-ons')).toBeNull();
  });

  it('shows fallback prompt when plan is undefined', () => {
    mockUserProfilePlan.mockReturnValue(undefined);
    setupHook(null, false);

    render(<StorageSection />);

    expect(screen.getByText('Storage usage is unavailable until your plan loads.')).toBeTruthy();
  });

  it('shows loading skeletons', () => {
    setupHook(null, true);

    render(<StorageSection />);

    expect(screen.getByText('Cloud Storage')).toBeTruthy();
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error message when fetch fails', () => {
    setupHook(null, false, new Error('Network error'));

    render(<StorageSection />);

    expect(screen.getByText('Failed to load storage information')).toBeTruthy();
  });

  it('renders tier storage usage and up-to copy', () => {
    setupHook(makeQuota({ used_bytes: 1 * GB, percent_used: 50 }));

    render(<StorageSection />);

    expect(screen.getByText(/1 GB.*of.*10 GB.*used/)).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByText('Up to 10 GB included with Reader plan')).toBeTruthy();
  });

  it('shows the current plan name in tier storage copy', () => {
    setupHook(makeQuota({ plan: 'pro', base_gb: 50 }));

    render(<StorageSection />);

    expect(screen.getByText('Up to 50 GB included with Pro plan')).toBeTruthy();
  });

  it('never renders storage add-on purchase or cancel controls', () => {
    setupHook(
      makeQuota({
        addon_gb: 25,
        available_addons: [{ gb: 25, price_cents: 499, mobile_price_cents: 699 }],
        active_addons: [
          {
            id: 'a1',
            gb_amount: 25,
            price_cents: 499,
            source: 'stripe',
            created_at: '2026-01-01',
          },
        ],
      }),
    );

    render(<StorageSection />);

    expect(screen.queryByText('Add Storage')).toBeNull();
    expect(screen.queryByText('Active Add-ons')).toBeNull();
    expect(screen.queryByText('+25 GB')).toBeNull();
    expect(screen.queryByText('Cancel')).toBeNull();
  });

  it('applies usage colors at the configured thresholds', () => {
    setupHook(makeQuota({ percent_used: 85 }));

    render(<StorageSection />);

    const percentText = screen.getByText('85%');
    expect(percentText.className).toContain('text-warning');
  });

  it('shows over-limit warning with upgrade-oriented copy', () => {
    setupHook(
      makeQuota({
        is_over_limit: true,
        percent_used: 150,
        used_bytes: 12 * GB,
        available_bytes: 0,
      }),
    );

    render(<StorageSection />);

    expect(
      screen.getByText(
        'You have exceeded your plan storage limit. Upgrade your plan or remove files.',
      ),
    ).toBeTruthy();
  });
});
