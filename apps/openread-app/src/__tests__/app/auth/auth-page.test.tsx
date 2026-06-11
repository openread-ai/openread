import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const mockRouter = {
  push: vi.fn(),
  back: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

vi.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: vi.fn(),
      signInWithOAuth: vi.fn(),
      signInWithPassword: vi.fn(),
      signInWithIdToken: vi.fn(),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
  },
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: {},
  }),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: vi.fn(),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({
    safeAreaInsets: { top: 0 },
    isRoundedWindow: false,
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: { keepLogin: true },
    setSettings: vi.fn(),
    saveSettings: vi.fn(),
  }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string) => value,
}));

vi.mock('@/services/environment', () => ({
  getBaseUrl: () => 'https://app.openread.ai',
  isTauriAppPlatform: () => false,
}));

vi.mock('@tauri-apps/plugin-deep-link', () => ({
  onOpenUrl: vi.fn(),
}));

vi.mock('@fabianlars/tauri-plugin-oauth', () => ({
  start: vi.fn(),
  cancel: vi.fn(),
  onUrl: vi.fn(),
  onInvalidUrl: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@/helpers/auth', () => ({
  handleAuthCallback: vi.fn(),
}));

vi.mock('@/components/WindowButtons', () => ({
  default: () => <div data-testid='window-buttons' />,
}));

vi.mock('@/components/auth/openread-auth-card', () => ({
  OpenReadAuthCard: () => <div data-testid='openread-auth-card'>Auth card</div>,
}));

vi.mock('@/app/auth/auth-provider-actions', () => ({
  buildAuthProviderActions: () => [],
}));

import AuthPage from '@/app/auth/page';

describe('AuthPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the auth card without a back navigation button', () => {
    render(<AuthPage />);

    expect(screen.getByTestId('openread-auth-card')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Go Back' })).toBeNull();
  });
});
