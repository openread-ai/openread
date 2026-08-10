import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NORMALIZED_DOT_HOSTILE_REDIRECT = '/..//attacker.com';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  authStateCallback: null as null | ((event: string, session: unknown) => void),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, back: mocks.back }),
}));

vi.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn((callback) => {
        mocks.authStateCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
  },
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ isDarkMode: false }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string) => value,
}));

vi.mock('@supabase/auth-ui-react', () => ({ Auth: () => <div data-testid='auth-ui' /> }));
vi.mock('@supabase/auth-ui-shared', () => ({ ThemeSupa: {} }));

import ResetPasswordPage from '@/app/auth/recovery/page';

describe('ResetPasswordPage redirects', () => {
  beforeEach(() => {
    mocks.authStateCallback = null;
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
    vi.clearAllMocks();
  });

  it.each([
    ['rejects an absolute hostile target', 'https://attacker.example/path', '/library'],
    ['rejects a normalized-dot hostile target', NORMALIZED_DOT_HOSTILE_REDIRECT, '/library'],
    ['accepts an internal target', '/settings/account#security', '/settings/account#security'],
  ])('%s', (_name, target, expected) => {
    window.history.replaceState({}, '', `/auth/recovery?redirect=${encodeURIComponent(target)}`);
    render(<ResetPasswordPage />);

    act(() => {
      mocks.authStateCallback?.('USER_UPDATED', {
        access_token: 'access-token',
        user: { id: 'user-1' },
      });
    });

    expect(mocks.push).toHaveBeenCalledWith(expected);
  });
});
