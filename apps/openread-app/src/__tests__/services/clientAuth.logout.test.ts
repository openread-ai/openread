import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authStateCallback: null as null | ((event: string, session: unknown) => void),
  authStateCallbacks: [] as Array<(event: string, session: unknown) => void>,
  signOut: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  setSession: vi.fn(),
  isWebAppPlatform: true,
}));

vi.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn((callback) => {
        mocks.authStateCallback = callback;
        mocks.authStateCallbacks.push(callback);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signOut: mocks.signOut,
      setSession: mocks.setSession,
      getSession: mocks.getSession,
      refreshSession: mocks.refreshSession,
    },
  },
}));

vi.mock('@/services/environment', () => ({
  isWebAppPlatform: () => mocks.isWebAppPlatform,
}));

import { clientAuth } from '@/services/auth/clientAuth';

const fakeJwt = (suffix: string, exp = 4_102_444_800) =>
  ['header', btoa(JSON.stringify({ exp })), suffix].join('.');

const staleSession = {
  access_token: fakeJwt('stale'),
  refresh_token: ['stale', 'refresh', 'value'].join('-'),
  user: { id: 'user-1' },
};

const expiredStaleSession = {
  ...staleSession,
  access_token: fakeJwt('expired-stale', 1),
};

const rotatedStaleSession = {
  access_token: fakeJwt('rotated-stale'),
  refresh_token: ['rotated', 'stale', 'refresh'].join('-'),
  user: staleSession.user,
};

const replacementSession = {
  access_token: fakeJwt('replacement'),
  refresh_token: ['replacement', 'refresh', 'value'].join('-'),
  user: { id: 'user-2' },
};

const credentialKey = 'token';
const refreshCredentialKey = 'refresh_token';
const storedAuthState = () => ({
  [credentialKey]: window.localStorage.getItem(credentialKey),
  refreshToken: window.localStorage.getItem(refreshCredentialKey),
  user: window.localStorage.getItem('user'),
});

describe('clientAuth logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authStateCallbacks.length = 0;
    mocks.isWebAppPlatform = true;
    window.localStorage.clear();
    clientAuth.destroy();
    clientAuth.initialize();
  });

  it('keeps durable credentials absent when a stale session callback arrives after logout clears', async () => {
    window.localStorage.setItem('token', staleSession.access_token);
    window.localStorage.setItem('refresh_token', staleSession.refresh_token);
    window.localStorage.setItem('user', JSON.stringify(staleSession.user));

    mocks.signOut.mockImplementation(async () => {
      mocks.authStateCallback?.('SIGNED_OUT', null);
      return { error: null };
    });

    await clientAuth.logout();
    mocks.authStateCallback?.('TOKEN_REFRESHED', rotatedStaleSession);

    const emptyAuthState = { token: null, refreshToken: null, user: null };
    expect(storedAuthState()).toEqual(emptyAuthState);

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(storedAuthState()).toEqual(emptyAuthState);

    await new Promise((resolve) => setTimeout(resolve, 750));
    expect(storedAuthState()).toEqual(emptyAuthState);

    await new Promise((resolve) => setTimeout(resolve, 4_000));
    expect(storedAuthState()).toEqual(emptyAuthState);
  }, 7_000);

  it('does not return a pre-logout native refresh token after logout completes', async () => {
    mocks.isWebAppPlatform = false;
    mocks.getSession.mockResolvedValue({
      data: { session: expiredStaleSession },
      error: null,
    });

    let resolveRefresh: ((value: unknown) => void) | undefined;
    mocks.refreshSession.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    const pendingAccess = clientAuth.getAccessToken();
    await vi.waitFor(() => expect(mocks.refreshSession).toHaveBeenCalledTimes(1));

    await clientAuth.logout();
    resolveRefresh?.({ data: { session: rotatedStaleSession }, error: null });

    await expect(pendingAccess).resolves.toBeNull();
    expect(storedAuthState()).toEqual({ token: null, refreshToken: null, user: null });
  });

  it('rejects a pre-logout refresh completion with rotated credentials', async () => {
    window.localStorage.setItem('token', expiredStaleSession.access_token);
    window.localStorage.setItem('refresh_token', expiredStaleSession.refresh_token);
    window.localStorage.setItem('user', JSON.stringify(expiredStaleSession.user));

    let resolveRefresh: ((value: unknown) => void) | undefined;
    mocks.refreshSession.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    const refresh = clientAuth.refreshIfNeeded();
    await clientAuth.logout();
    resolveRefresh?.({ data: { session: rotatedStaleSession }, error: null });
    await refresh;

    expect(storedAuthState()).toEqual({ token: null, refreshToken: null, user: null });
  });

  it('rejects an old rotated refresh broadcast delivered to the replacement listener', async () => {
    window.localStorage.setItem('token', expiredStaleSession.access_token);
    window.localStorage.setItem('refresh_token', expiredStaleSession.refresh_token);
    window.localStorage.setItem('user', JSON.stringify(expiredStaleSession.user));

    let resolveRefresh: ((value: unknown) => void) | undefined;
    mocks.refreshSession.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    mocks.setSession.mockResolvedValue({
      data: { session: replacementSession },
      error: null,
    });

    const refresh = clientAuth.refreshIfNeeded();
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    await clientAuth.logout();
    await clientAuth.installSession(replacementSession);
    const replacementCallback = mocks.authStateCallbacks.at(-1);
    replacementCallback?.('TOKEN_REFRESHED', rotatedStaleSession);

    expect(storedAuthState()).toMatchObject({
      [credentialKey]: replacementSession.access_token,
      refreshToken: replacementSession.refresh_token,
    });

    resolveRefresh?.({ data: { session: rotatedStaleSession }, error: null });
    await refresh;

    const refreshedReplacementSession = {
      ...replacementSession,
      access_token: fakeJwt('replacement-refreshed'),
      refresh_token: ['replacement', 'refreshed', 'value'].join('-'),
    };
    const resumedCallback = mocks.authStateCallbacks.at(-1);
    resumedCallback?.('TOKEN_REFRESHED', refreshedReplacementSession);

    expect(storedAuthState()).toMatchObject({
      [credentialKey]: refreshedReplacementSession.access_token,
      refreshToken: refreshedReplacementSession.refresh_token,
    });
  });

  it('does not let a pre-logout refresh failure clear an explicit replacement', async () => {
    window.localStorage.setItem('token', expiredStaleSession.access_token);
    window.localStorage.setItem('refresh_token', expiredStaleSession.refresh_token);
    window.localStorage.setItem('user', JSON.stringify(expiredStaleSession.user));

    let resolveRefresh: ((value: unknown) => void) | undefined;
    mocks.refreshSession.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    mocks.setSession.mockResolvedValue({
      data: { session: replacementSession },
      error: null,
    });

    const refresh = clientAuth.refreshIfNeeded();
    await clientAuth.logout();
    await clientAuth.installSession(replacementSession);
    resolveRefresh?.({ data: { session: null }, error: new Error('stale refresh failed') });
    await refresh;

    expect(storedAuthState()).toMatchObject({
      [credentialKey]: replacementSession.access_token,
      refreshToken: replacementSession.refresh_token,
    });
  });

  it('does not let a stale restore failure clear an explicit replacement', async () => {
    clientAuth.destroy();
    window.localStorage.setItem('token', staleSession.access_token);
    window.localStorage.setItem('refresh_token', staleSession.refresh_token);
    window.localStorage.setItem('user', JSON.stringify(staleSession.user));

    let resolveRestore: ((value: unknown) => void) | undefined;
    mocks.setSession
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRestore = resolve;
        }),
      )
      .mockResolvedValue({ data: { session: replacementSession }, error: null });

    clientAuth.initialize();
    await clientAuth.logout();
    await clientAuth.installSession(replacementSession);
    resolveRestore?.({ data: { session: null }, error: new Error('stale restore failed') });
    await Promise.resolve();
    await Promise.resolve();

    expect(storedAuthState()).toMatchObject({
      [credentialKey]: replacementSession.access_token,
      refreshToken: replacementSession.refresh_token,
    });
  });

  it('accepts an explicitly installed replacement session after logout', async () => {
    window.localStorage.setItem('token', staleSession.access_token);
    window.localStorage.setItem('refresh_token', staleSession.refresh_token);
    window.localStorage.setItem('user', JSON.stringify(staleSession.user));
    mocks.signOut.mockResolvedValue({ error: null });

    await clientAuth.logout();
    mocks.setSession.mockResolvedValue({
      data: { session: replacementSession },
      error: null,
    });

    await clientAuth.installSession(replacementSession);

    expect(storedAuthState()).toMatchObject({
      [credentialKey]: replacementSession.access_token,
      refreshToken: replacementSession.refresh_token,
    });
  });
});
