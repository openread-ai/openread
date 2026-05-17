import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StorageMeter } from '@/components/settings/billing/StorageMeter';

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

vi.mock('@/utils/tailwind', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

const mockUseStorageQuota = vi.fn();
vi.mock('@/hooks/useStorageQuota', () => ({
  useStorageQuota: () => mockUseStorageQuota(),
}));

const GB = 1024 * 1024 * 1024;

function makeQuota(overrides: Record<string, unknown> = {}) {
  return {
    plan: 'reader',
    base_gb: 10,
    addon_gb: 0,
    total_bytes: 10 * GB,
    used_bytes: 6.2 * GB,
    available_bytes: 3.8 * GB,
    percent_used: 62,
    is_over_limit: false,
    active_addons: [],
    available_addons: [],
    ...overrides,
  };
}

describe('StorageMeter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows loading skeleton when loading', () => {
    mockUseStorageQuota.mockReturnValue({ quota: null, isLoading: true, error: null });

    render(<StorageMeter />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error state when fetch fails', () => {
    mockUseStorageQuota.mockReturnValue({
      quota: null,
      isLoading: false,
      error: new Error('fail'),
    });

    render(<StorageMeter />);
    expect(screen.getByText('Failed to load storage data')).toBeTruthy();
  });

  it('displays tier-only storage usage', () => {
    mockUseStorageQuota.mockReturnValue({
      quota: makeQuota(),
      isLoading: false,
      error: null,
    });

    render(<StorageMeter />);
    expect(screen.getByText('Storage')).toBeTruthy();
    expect(screen.getByText(/6\.2 GB/)).toBeTruthy();
    expect(screen.getByText(/of/)).toBeTruthy();
    expect(screen.getAllByText(/10 GB/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Up to 10 GB included/)).toBeTruthy();
    expect(screen.queryByText('Add Storage')).toBeNull();
  });

  it('uses base tier storage even if stale add-on fields are present', () => {
    mockUseStorageQuota.mockReturnValue({
      quota: makeQuota({ base_gb: 10, addon_gb: 25, total_bytes: 35 * GB }),
      isLoading: false,
      error: null,
    });

    render(<StorageMeter />);
    expect(screen.getByText(/of/)).toBeTruthy();
    expect(screen.getAllByText(/10 GB/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Up to 10 GB included/)).toBeTruthy();
    expect(screen.queryByText(/add-ons/)).toBeNull();
  });

  it('shows progress bar', () => {
    mockUseStorageQuota.mockReturnValue({
      quota: makeQuota(),
      isLoading: false,
      error: null,
    });

    render(<StorageMeter />);
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });

  it('applies warning color when usage is high', () => {
    mockUseStorageQuota.mockReturnValue({
      quota: makeQuota({ percent_used: 85 }),
      isLoading: false,
      error: null,
    });

    render(<StorageMeter />);
    const usageText = screen.getByText(/6\.2 GB/);
    expect(usageText.className).toContain('text-warning');
  });
});
