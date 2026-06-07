import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isWeb: true,
  refreshSession: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@/services/environment', () => ({
  isWebAppPlatform: () => mocks.isWeb,
}));

vi.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      refreshSession: mocks.refreshSession,
      getSession: mocks.getSession,
      getUser: mocks.getUser,
    },
  },
}));

import { getAccessToken } from '@/utils/access';

function jwtWithExp(expSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds, plan: 'free' })).toString(
    'base64url',
  );
  return `header.${payload}.sig`;
}

describe('getAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.isWeb = true;
  });

  it('returns a valid web token without refreshing', async () => {
    const token = jwtWithExp(Math.floor(Date.now() / 1000) + 3_600);
    localStorage.setItem('token', token);

    await expect(getAccessToken()).resolves.toBe(token);
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });

  it('refreshes an expired web token before returning it to API callers', async () => {
    const expiredToken = jwtWithExp(Math.floor(Date.now() / 1000) - 60);
    const freshToken = jwtWithExp(Math.floor(Date.now() / 1000) + 3_600);
    localStorage.setItem('token', expiredToken);
    localStorage.setItem('refresh_token', 'refresh-old');

    mocks.refreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: freshToken,
          refresh_token: 'refresh-new',
          user: { id: 'user-1' },
        },
      },
      error: null,
    });

    await expect(getAccessToken()).resolves.toBe(freshToken);
    expect(mocks.refreshSession).toHaveBeenCalledWith({ refresh_token: 'refresh-old' });
    expect(localStorage.getItem('token')).toBe(freshToken);
    expect(localStorage.getItem('refresh_token')).toBe('refresh-new');
    expect(localStorage.getItem('user')).toContain('user-1');
  });

  it('does not return an expired web token when no refresh token exists', async () => {
    localStorage.setItem('token', jwtWithExp(Math.floor(Date.now() / 1000) - 60));

    await expect(getAccessToken()).resolves.toBeNull();
    expect(mocks.refreshSession).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('refreshes an expired non-web Supabase session', async () => {
    const expiredToken = jwtWithExp(Math.floor(Date.now() / 1000) - 60);
    const freshToken = jwtWithExp(Math.floor(Date.now() / 1000) + 3_600);
    mocks.isWeb = false;
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: expiredToken } } });
    mocks.refreshSession.mockResolvedValue({
      data: { session: { access_token: freshToken } },
      error: null,
    });

    await expect(getAccessToken()).resolves.toBe(freshToken);
    expect(mocks.refreshSession).toHaveBeenCalledWith();
  });
});
