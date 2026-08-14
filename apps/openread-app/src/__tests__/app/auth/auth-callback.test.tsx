import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const NORMALIZED_DOT_HOSTILE_REDIRECT = '/..//attacker.com';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  installSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: vi.fn(),
}));

vi.mock('@/services/auth/clientAuth', () => ({
  clientAuth: { installSession: mocks.installSession },
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

import AuthCallback from '@/app/auth/callback/page';
import AuthErrorPage from '@/app/auth/error/page';

function setCallbackHash(params: Record<string, string>) {
  window.location.hash = new URLSearchParams(params).toString();
}

describe('AuthCallback outcomes', () => {
  beforeEach(() => {
    mocks.installSession.mockResolvedValue({ user: { id: 'user-1' } });
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
    vi.clearAllMocks();
  });

  it('presents an actionable error and never navigates home when a token is missing', async () => {
    setCallbackHash({ access_token: 'access-token' });

    const callback = render(<AuthCallback />);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/auth/error'));
    expect(mocks.push).not.toHaveBeenCalledWith('/home');
    callback.unmount();

    render(<AuthErrorPage />);

    expect(
      screen.getByRole('heading', { name: "We couldn't complete authentication" }),
    ).toBeTruthy();
    expect(screen.getByText('Please try signing in again.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Login' }));
    expect(mocks.push).toHaveBeenCalledWith('/auth');
  });

  it.each([
    ['access token', { refresh_token: 'refresh-token' }],
    ['refresh token', { access_token: 'access-token' }],
  ])('rejects a callback missing its %s', async (_name, params) => {
    setCallbackHash(params);

    render(<AuthCallback />);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/auth/error'));
    expect(mocks.push).not.toHaveBeenCalledWith('/home');
    expect(mocks.installSession).not.toHaveBeenCalled();
  });

  it('preserves an explicit provider error as an auth failure', async () => {
    setCallbackHash({ error: 'access_denied' });

    render(<AuthCallback />);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/auth/error'));
    expect(mocks.installSession).not.toHaveBeenCalled();
  });

  it('presents an auth error when session installation fails', async () => {
    mocks.installSession.mockResolvedValueOnce(null);
    setCallbackHash({ access_token: 'access-token', refresh_token: 'refresh-token' });

    render(<AuthCallback />);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/auth/error'));
    expect(mocks.push).not.toHaveBeenCalledWith('/home');
  });

  it('installs a valid callback session and navigates to its safe destination', async () => {
    setCallbackHash({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      next: '/library?sort=recent#saved',
    });

    render(<AuthCallback />);

    await waitFor(() =>
      expect(mocks.installSession).toHaveBeenCalledWith({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
      }),
    );
    expect(mocks.push).toHaveBeenCalledWith('/library?sort=recent#saved');
    expect(mocks.push).not.toHaveBeenCalledWith('/auth/error');
  });

  it('routes a valid recovery callback to password recovery', async () => {
    setCallbackHash({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      type: 'recovery',
    });

    render(<AuthCallback />);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/auth/recovery'));
    expect(mocks.push).not.toHaveBeenCalledWith('/auth/error');
  });

  it.each([
    ['an absolute hostile target', 'https://attacker.example/path'],
    ['a normalized-dot hostile target', NORMALIZED_DOT_HOSTILE_REDIRECT],
  ])('falls back to home for %s after installing a valid session', async (_name, target) => {
    setCallbackHash({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      next: target,
    });

    render(<AuthCallback />);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/home'));
    expect(mocks.installSession).toHaveBeenCalledOnce();
    expect(mocks.push).not.toHaveBeenCalledWith('/auth/error');
  });
});
