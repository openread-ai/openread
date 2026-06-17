import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  verifyServerAuth: vi.fn(),
}));

vi.mock('@openread/auth/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openread/auth/server')>();
  return {
    ...actual,
    verifyServerAuth: mocks.verifyServerAuth,
  };
});

vi.mock('@/utils/supabase', () => ({
  createSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: mocks.getUser,
    },
  })),
}));

function jwtPayload(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
}

describe('app server auth adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env['NEXT_PUBLIC_SUPABASE_URL'];
    delete process.env['NEXT_PUBLIC_DEFAULT_SUPABASE_URL_BASE64'];
    delete process.env['SUPABASE_URL'];
  });

  it('preserves Supabase getUser(token) validation for app API routes', async () => {
    const token = jwtPayload({ sub: 'user-1', email: 'reader@example.com', tier: 'reader' });
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'reader@example.com',
          user_metadata: { role: 'reader' },
        },
      },
      error: null,
    });

    const { validateUserAndToken } = await import('@/services/auth/serverAuth');
    const result = await validateUserAndToken(`Bearer ${token}`);

    expect(mocks.getUser).toHaveBeenCalledWith(token);
    expect(mocks.verifyServerAuth).not.toHaveBeenCalled();
    expect(result.user?.id).toBe('user-1');
    expect(result.token).toBe(token);
    expect(result.auth).toMatchObject({
      userId: 'user-1',
      email: 'reader@example.com',
      tier: 'reader',
      token,
    });
  });

  it('returns unauthenticated when Supabase rejects the token', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid') });

    const { validateUserAndToken } = await import('@/services/auth/serverAuth');
    await expect(validateUserAndToken('Bearer invalid.token')).resolves.toEqual({});
  });

  it('passes the app Supabase URL fallback into canonical server verification', async () => {
    process.env['NEXT_PUBLIC_DEFAULT_SUPABASE_URL_BASE64'] = Buffer.from(
      'https://app-project.supabase.co',
    ).toString('base64');
    mocks.verifyServerAuth.mockResolvedValue({ userId: 'user-1', token: 'token' });

    const { requireServerAuth } = await import('@/services/auth/serverAuth');
    await requireServerAuth('Bearer token');

    expect(mocks.verifyServerAuth).toHaveBeenCalledWith('Bearer token', {
      supabaseUrl: 'https://app-project.supabase.co',
    });
  });
});
