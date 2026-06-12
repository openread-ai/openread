import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AIResetStatus } from '@/components/settings/billing/AIResetStatus';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, options?: Record<string, string>) =>
    key.replace(/{{(\w+)}}/g, (_, token: string) => options?.[token] ?? ''),
}));

const mockAIQuotaState: {
  plan: 'free' | 'reader' | 'pro';
  used: number;
  limit: number;
  limitType: 'daily' | 'weekly' | 'monthly' | 'window';
  resetAt: string | null;
  percentUsed: number;
  windowHours: number | null;
  rateLimit: number | null;
  rateWindowHours: number | null;
  rateUsed: number;
  rateResetAt: string | null;
} = {
  plan: 'free',
  used: 42,
  limit: 100,
  limitType: 'weekly',
  resetAt: '2026-04-28T12:00:00Z',
  percentUsed: 42,
  windowHours: 168,
  rateLimit: 5,
  rateWindowHours: 5,
  rateUsed: 1,
  rateResetAt: '2026-04-22T23:53:00Z',
};

vi.mock('@/store/aiQuotaStore', () => ({
  useAIQuotaStore: (selector: (s: typeof mockAIQuotaState) => unknown) =>
    selector(mockAIQuotaState),
}));

describe('AIResetStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAIQuotaState.plan = 'free';
    mockAIQuotaState.used = 42;
    mockAIQuotaState.limit = 100;
    mockAIQuotaState.limitType = 'weekly';
    mockAIQuotaState.resetAt = '2026-04-28T12:00:00Z';
    mockAIQuotaState.percentUsed = 42;
    mockAIQuotaState.windowHours = 168;
    mockAIQuotaState.rateLimit = 5;
    mockAIQuotaState.rateWindowHours = 5;
    mockAIQuotaState.rateUsed = 1;
    mockAIQuotaState.rateResetAt = '2026-04-22T23:53:00Z';
  });

  afterEach(() => {
    cleanup();
  });

  it('shows separate canonical AI usage limits without a reset button', () => {
    render(<AIResetStatus />);

    expect(screen.getByText('AI usage limits')).toBeTruthy();
    expect(screen.getByText('5 hour usage limit')).toBeTruthy();
    expect(screen.getByText('Weekly usage limit')).toBeTruthy();
    expect(screen.getAllByRole('progressbar')).toHaveLength(2);
    expect(screen.getByText('80% left')).toBeTruthy();
    expect(screen.getByText('58% left')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('falls back to the primary quota window when no short cap exists', () => {
    mockAIQuotaState.rateLimit = null;
    mockAIQuotaState.rateWindowHours = null;
    mockAIQuotaState.windowHours = 24;

    render(<AIResetStatus />);

    expect(screen.queryByText('5 hour usage limit')).toBeNull();
    expect(screen.getByText('Weekly usage limit')).toBeTruthy();
  });

  it('shows a subtle upgrade link when a free plan reaches the threshold', () => {
    mockAIQuotaState.rateUsed = 5;

    render(<AIResetStatus />);

    expect(screen.getByRole('link', { name: 'Upgrade plan' }).getAttribute('href')).toBe(
      '/settings/billing',
    );
  });

  it('does not show the upgrade link below threshold or for pro', () => {
    render(<AIResetStatus />);
    expect(screen.queryByRole('link', { name: 'Upgrade plan' })).toBeNull();

    cleanup();
    mockAIQuotaState.plan = 'pro';
    mockAIQuotaState.rateUsed = 5;
    render(<AIResetStatus />);
    expect(screen.queryByRole('link', { name: 'Upgrade plan' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Upgrade to Pro' })).toBeNull();
  });

  it('does not require a reset for unlimited plans', () => {
    mockAIQuotaState.limit = -1;

    render(<AIResetStatus />);

    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.queryByText(/No reset needed/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
