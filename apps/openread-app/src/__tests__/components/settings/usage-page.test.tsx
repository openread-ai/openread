import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import UsagePage from '@/app/(platform)/settings/usage/page';

const fetchInitialQuota = vi.fn();

vi.mock('@/components/settings/billing', () => ({
  AIResetStatus: () => <div data-testid='ai-reset-status'>ai-reset-status</div>,
  StorageMeter: () => <div data-testid='storage-meter'>storage-meter</div>,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', user: { id: 'user-123' } }),
}));

vi.mock('@/store/aiQuotaStore', () => ({
  useAIQuotaStore: (selector: (state: { fetchInitial: typeof fetchInitialQuota }) => unknown) =>
    selector({ fetchInitial: fetchInitialQuota }),
}));

vi.mock('@/utils/access', () => ({
  getUserProfilePlan: () => 'reader',
}));

describe('UsagePage', () => {
  afterEach(() => {
    cleanup();
    fetchInitialQuota.mockClear();
  });

  it('renders lightweight AI reset and storage usage only', () => {
    render(<UsagePage />);

    expect(screen.getByTestId('ai-reset-status')).toBeTruthy();
    expect(screen.getByTestId('storage-meter')).toBeTruthy();
    expect(screen.queryByText('Monthly Usage')).toBeNull();
    expect(screen.queryByText(/messages left/i)).toBeNull();
    expect(fetchInitialQuota).toHaveBeenCalledWith('reader', 'user-123');
  });
});
