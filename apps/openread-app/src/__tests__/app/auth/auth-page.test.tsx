import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NORMALIZED_DOT_HOSTILE_REDIRECT = '/..//attacker.com';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  signUp: vi.fn(),
  authStateCallback: null as null | ((event: string, session: unknown) => void),
  authCardProps: null as null | {
    onEmailPassword: (
      mode: 'sign-in' | 'sign-up',
      email: string,
      password: string,
    ) => Promise<unknown>;
    providers?: Array<{ id: string; onClick: () => void }>;
  },
  isTauri: false,
  appService: {} as Record<string, unknown>,
  onUrlCallback: null as null | ((url: string) => Promise<void>),
  startOAuth: vi.fn(),
  registerOAuthUrl: vi.fn(),
  runNativeCommand: vi.fn(),
  installSession: vi.fn(),
  beginSignIn: vi.fn(),
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
      signOut: vi.fn(),
      signInWithOAuth: mocks.signInWithOAuth,
      signInWithPassword: mocks.signInWithPassword,
      signInWithIdToken: vi.fn(),
      signUp: mocks.signUp,
      resetPasswordForEmail: vi.fn(),
    },
  },
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService: mocks.appService }),
}));

vi.mock('@/hooks/useTheme', () => ({ useTheme: vi.fn() }));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ safeAreaInsets: { top: 0 }, isRoundedWindow: false }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string) => value,
}));

vi.mock('@/services/environment', () => ({
  getBaseUrl: () => 'https://app.openread.ai',
  isTauriAppPlatform: () => mocks.isTauri,
}));

vi.mock('@tauri-apps/plugin-deep-link', () => ({ onOpenUrl: vi.fn() }));

vi.mock('@fabianlars/tauri-plugin-oauth', () => ({
  start: mocks.startOAuth,
  cancel: vi.fn(),
  onUrl: mocks.registerOAuthUrl,
  onInvalidUrl: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

vi.mock('@/services/bridge/bridgeService', () => ({
  runNativeCommand: mocks.runNativeCommand,
}));

vi.mock('@/services/auth/clientAuth', () => ({
  clientAuth: {
    installSession: mocks.installSession,
    beginSignIn: mocks.beginSignIn,
  },
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/helpers/settings', () => ({ saveSysSettings: vi.fn() }));

vi.mock('@/components/WindowButtons', () => ({
  default: ({ onClose }: { onClose?: () => void }) => (
    <button aria-label='Close' onClick={onClose}>
      Close
    </button>
  ),
}));

vi.mock('@/components/auth/openread-auth-card', () => ({
  OpenReadAuthCard: (props: NonNullable<typeof mocks.authCardProps>) => {
    mocks.authCardProps = props;
    return <div data-testid='openread-auth-card'>Auth card</div>;
  },
}));

vi.mock('@/app/auth/auth-provider-actions', () => ({
  buildAuthProviderActions: ({ onGoogle }: { onGoogle: () => void }) => [
    { id: 'google', onClick: onGoogle },
  ],
}));

import AuthPage from '@/app/auth/page';

async function renderAuthPage(target: string, options?: { tauri?: boolean }) {
  mocks.isTauri = options?.tauri ?? false;
  mocks.appService = options?.tauri ? { hasWindowBar: true, hasTrafficLight: false } : {};
  window.history.replaceState({}, '', `/auth?redirect=${encodeURIComponent(target)}`);
  render(<AuthPage />);
  await waitFor(() => expect(mocks.authCardProps).not.toBeNull());
}

describe('AuthPage redirects', () => {
  beforeEach(() => {
    mocks.authCardProps = null;
    mocks.authStateCallback = null;
    mocks.onUrlCallback = null;
    mocks.isTauri = false;
    mocks.appService = {};
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    mocks.signInWithOAuth.mockResolvedValue({ error: null });
    mocks.signUp.mockResolvedValue({ data: { session: { access_token: 'token' } }, error: null });
    mocks.startOAuth.mockResolvedValue(47123);
    mocks.registerOAuthUrl.mockImplementation((callback) => {
      mocks.onUrlCallback = callback;
    });
    mocks.runNativeCommand.mockResolvedValue('false');
    mocks.installSession.mockResolvedValue({ user: { id: 'user-1' } });
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
    vi.clearAllMocks();
  });

  it('does not render the Tauri close control on web', async () => {
    await renderAuthPage('/home');

    expect(screen.getByTestId('openread-auth-card')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    expect(mocks.startOAuth).not.toHaveBeenCalled();
    expect(mocks.registerOAuthUrl).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.back).not.toHaveBeenCalled();
  });

  it.each([
    ['sign-in', 'https://attacker.example/path', '/home'],
    ['sign-in', NORMALIZED_DOT_HOSTILE_REDIRECT, '/home'],
    ['sign-in', '/library?sort=recent#saved', '/library?sort=recent#saved'],
    ['sign-up', 'https://attacker.example/path', '/home'],
    ['sign-up', NORMALIZED_DOT_HOSTILE_REDIRECT, '/home'],
    ['sign-up', '/collections/favorites', '/collections/favorites'],
  ] as const)('%s redirects %s to %s', async (mode, target, expected) => {
    await renderAuthPage(target);

    await act(async () => {
      await mocks.authCardProps?.onEmailPassword(mode, 'reader@example.com', 'password');
    });

    expect(mocks.beginSignIn).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(expected);
  });

  it('begins a new auth generation before OAuth sign-in', async () => {
    await renderAuthPage('/home');

    await act(async () => {
      await mocks.authCardProps?.providers?.[0]?.onClick();
    });

    expect(mocks.beginSignIn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['https://attacker.example/path', '/home'],
    [NORMALIZED_DOT_HOSTILE_REDIRECT, '/home'],
    ['/library?view=grid', '/library?view=grid'],
  ])('auth-state redirect maps %s to %s', async (target, expected) => {
    await renderAuthPage(target);

    act(() => {
      mocks.authStateCallback?.('SIGNED_IN', {
        access_token: 'access-token',
        user: { id: 'user-1' },
      });
    });

    expect(mocks.push).toHaveBeenCalledWith(expected);
  });

  it.each([
    ['https://attacker.example/path', 'back'],
    [NORMALIZED_DOT_HOSTILE_REDIRECT, 'back'],
    ['/library?view=list', 'push'],
  ])('Tauri close maps %s to %s', async (target, action) => {
    await renderAuthPage(target, { tauri: true });

    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));

    if (action === 'push') {
      expect(mocks.push).toHaveBeenCalledWith('/library?view=list');
      expect(mocks.back).not.toHaveBeenCalled();
    } else {
      expect(mocks.back).toHaveBeenCalledOnce();
      expect(mocks.push).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['https://attacker.example/path', '/home'],
    [NORMALIZED_DOT_HOSTILE_REDIRECT, '/home'],
    ['/collections/favorites', '/collections/favorites'],
  ])('Tauri OAuth next maps %s to %s', async (target, expected) => {
    await renderAuthPage('/home', { tauri: true });
    await waitFor(() => expect(mocks.onUrlCallback).not.toBeNull());

    const hash = new URLSearchParams({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      next: target,
    });
    await act(async () => {
      await mocks.onUrlCallback?.(`http://localhost:47123/#${hash.toString()}`);
    });

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(expected));
  });
});
