import { NextResponse } from 'next/server';
import { AuthError, decodeJwtPayload, isAuthError } from '@openread/auth';
import {
  parseBearerToken,
  verifyServerAuth,
  type SupabaseJwtVerifierOptions,
} from '@openread/auth/server';
import type { ServerAuthContext } from '@openread/auth';

export type { ServerAuthContext } from '@openread/auth';

function decodeBase64UrlEnv(value: string): string {
  if (typeof globalThis.atob === 'function') return globalThis.atob(value);
  return Buffer.from(value, 'base64').toString('utf8');
}

function resolveAppSupabaseUrl(): string | undefined {
  if (process.env['NEXT_PUBLIC_SUPABASE_URL']) return process.env['NEXT_PUBLIC_SUPABASE_URL'];
  if (process.env['NEXT_PUBLIC_DEFAULT_SUPABASE_URL_BASE64']) {
    return decodeBase64UrlEnv(process.env['NEXT_PUBLIC_DEFAULT_SUPABASE_URL_BASE64']);
  }
  return process.env['SUPABASE_URL'];
}

function appVerifierOptions(options?: SupabaseJwtVerifierOptions): SupabaseJwtVerifierOptions {
  return {
    supabaseUrl: resolveAppSupabaseUrl(),
    ...options,
  };
}

export async function requireServerAuth(
  authHeader: string | null | undefined,
  options?: SupabaseJwtVerifierOptions,
): Promise<ServerAuthContext> {
  return verifyServerAuth(authHeader, appVerifierOptions(options));
}

export function authErrorResponse(error: unknown): NextResponse {
  const authError = isAuthError(error)
    ? error
    : new AuthError('invalid_token', 'Invalid or expired token');

  return NextResponse.json(
    { code: 'UNAUTHORIZED', message: authError.message },
    { status: authError.status === 500 ? 500 : 401 },
  );
}

type CanonicalRouteUser = {
  id: string;
  email?: string;
  user_metadata: Record<string, string | undefined>;
} & Record<string, unknown>;

export async function validateUserAndToken(
  authHeader: string | null | undefined,
): Promise<{ user?: CanonicalRouteUser; token?: string; auth?: ServerAuthContext }> {
  try {
    const token = parseBearerToken(authHeader);
    const { createSupabaseClient } = await import('@/utils/supabase');
    const {
      data: { user },
      error,
    } = await createSupabaseClient().auth.getUser(token);

    if (error || !user) return {};

    const claims = decodeJwtPayload(token);
    const tier = typeof claims.tier === 'string' ? claims.tier : claims.plan;
    const routeUser = {
      ...user,
      id: user.id,
      email: user.email ?? undefined,
      user_metadata: (user.user_metadata ?? {}) as Record<string, string | undefined>,
    } as CanonicalRouteUser;
    const auth: ServerAuthContext = {
      userId: routeUser.id,
      email: routeUser.email,
      tier: typeof tier === 'string' ? tier : undefined,
      token,
    };

    return {
      user: routeUser,
      token,
      auth,
    };
  } catch {
    return {};
  }
}
