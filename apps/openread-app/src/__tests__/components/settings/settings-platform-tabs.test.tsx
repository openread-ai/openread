import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const platformMocks = vi.hoisted(() => ({
  isWeb: true,
  pathname: '/settings/account',
  replace: vi.fn(),
  useApiKeys: vi.fn(),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/services/environment', () => ({
  isWebAppPlatform: () => platformMocks.isWeb,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => platformMocks.pathname,
  useRouter: () => ({ replace: platformMocks.replace }),
}));

vi.mock('@/hooks/useApiKeys', () => ({
  useApiKeys: () => {
    platformMocks.useApiKeys();
    return {
      keys: [],
      isLoading: false,
      createKey: vi.fn(),
      revokeKey: vi.fn(),
    };
  },
}));

import SettingsLayout from '@/app/(platform)/settings/layout';
import ApiKeysPage from '@/app/(platform)/settings/api-keys/page';

describe('Settings platform tabs', () => {
  beforeEach(() => {
    platformMocks.isWeb = true;
    platformMocks.pathname = '/settings/account';
    platformMocks.replace.mockClear();
    platformMocks.useApiKeys.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the API Keys tab on web', () => {
    render(
      <SettingsLayout>
        <div>Settings content</div>
      </SettingsLayout>,
    );

    expect(screen.getByText('API Keys')).toBeTruthy();
  });

  it('uses neutral low-contrast styling for the active tab', () => {
    render(
      <SettingsLayout>
        <div>Settings content</div>
      </SettingsLayout>,
    );

    const activeTab = screen.getByText('Account').closest('a');
    expect(activeTab?.className).toContain('bg-base-200/60');
    expect(activeTab?.className).toContain('text-base-content/80');
    expect(activeTab?.className).not.toContain('border-primary');
    expect(activeTab?.className).not.toContain('text-primary');
  });

  it('hides the API Keys tab outside web builds', () => {
    platformMocks.isWeb = false;

    render(
      <SettingsLayout>
        <div>Settings content</div>
      </SettingsLayout>,
    );

    expect(screen.queryByText('API Keys')).toBeNull();
  });

  it('redirects direct API Keys route access outside web builds without loading keys', async () => {
    platformMocks.isWeb = false;

    render(<ApiKeysPage />);

    await waitFor(() => {
      expect(platformMocks.replace).toHaveBeenCalledWith('/settings/account');
    });
    expect(platformMocks.useApiKeys).not.toHaveBeenCalled();
    expect(screen.queryByText('API Keys')).toBeNull();
  });

  it('loads the API Keys page on web builds', () => {
    render(<ApiKeysPage />);

    expect(platformMocks.useApiKeys).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Create API Key')).toBeTruthy();
  });
});
