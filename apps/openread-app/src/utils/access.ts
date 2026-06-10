import { jwtDecode } from 'jwt-decode';
import { supabase } from '@/utils/supabase';
import { UserPlan } from '@/types/quota';
import { isWebAppPlatform } from '@/services/environment';
import { getDailyUsage } from '@/services/translators/utils';

interface Token {
  plan: UserPlan;
  storage_usage_bytes: number;
  exp?: number;
  [key: string]: string | number | undefined;
}

/**
 * Check if a JWT token has expired.
 * Returns true if the token is expired or will expire within the grace period.
 *
 * @param token - The JWT token string
 * @param graceSeconds - Seconds before actual expiry to consider expired (default: 30)
 * @returns true if the token is expired or invalid
 */
export function isTokenExpired(token: string, graceSeconds = 30): boolean {
  try {
    const data = jwtDecode<Token>(token);
    if (!data.exp) return false; // No expiry claim means token doesn't expire
    const nowSeconds = Math.floor(Date.now() / 1000);
    return nowSeconds >= data.exp - graceSeconds;
  } catch {
    return true; // Invalid token is considered expired
  }
}

/** Normalize legacy plan values from JWT tokens to current UserPlan values. */
function normalizePlan(rawPlan: string): UserPlan {
  if (rawPlan === 'plus') return 'reader';
  if (rawPlan === 'purchase') return 'free';
  return (rawPlan || 'free') as UserPlan;
}

export const getSubscriptionPlan = (token: string): UserPlan => {
  const data = jwtDecode<Token>(token) || {};
  return normalizePlan(data['plan'] as string);
};

export const getUserProfilePlan = (token: string): UserPlan => {
  const data = jwtDecode<Token>(token) || {};
  return normalizePlan(data['plan'] as string);
};

export const STORAGE_QUOTA_GRACE_BYTES = 10 * 1024 * 1024; // 10 MB grace

export const getStoragePlanData = (token: string) => {
  const data = jwtDecode<Token>(token) || {};
  const plan = normalizePlan((data['plan'] as string) || 'free');
  const usage = data['storage_usage_bytes'] || 0;
  return {
    plan,
    usage,
  };
};

export const getTranslationPlanData = (token: string) => {
  const data = jwtDecode<Token>(token) || {};
  const plan = normalizePlan((data['plan'] as string) || 'free');
  const usage = getDailyUsage() || 0;
  return {
    plan,
    usage,
  };
};

export const getDailyTranslationPlanData = (token: string) => {
  const data = jwtDecode<Token>(token) || {};
  const plan = normalizePlan((data['plan'] as string) || 'free');

  return {
    plan,
  };
};

function persistWebSession(session: {
  access_token: string;
  refresh_token?: string | null;
  user?: unknown;
}) {
  localStorage.setItem('token', session.access_token);
  if (session.refresh_token) localStorage.setItem('refresh_token', session.refresh_token);
  if (session.user) localStorage.setItem('user', JSON.stringify(session.user));
}

function clearWebSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
}

async function refreshStoredWebSession(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) {
    localStorage.removeItem('token');
    return null;
  }

  try {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    const session = data?.session;
    if (error || !session?.access_token || isTokenExpired(session.access_token)) {
      clearWebSession();
      return null;
    }
    persistWebSession(session);
    return session.access_token;
  } catch {
    clearWebSession();
    return null;
  }
}

export const getAccessToken = async (): Promise<string | null> => {
  // In browser context there might be two instances of supabase one in the app route
  // and the other in the pages route, and they might have different sessions
  // making the access token invalid for API calls. In that case we should use localStorage.
  if (isWebAppPlatform()) {
    if (typeof localStorage === 'undefined') return null;

    const token = localStorage.getItem('token');
    if (token && !isTokenExpired(token, 60)) return token;
    return refreshStoredWebSession();
  }

  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token ?? null;
  if (!token) return null;
  if (!isTokenExpired(token, 60)) return token;

  const refreshed = await supabase.auth.refreshSession();
  const refreshedToken = refreshed.data?.session?.access_token ?? null;
  return refreshedToken && !isTokenExpired(refreshedToken) ? refreshedToken : null;
};

export const getUserID = async (): Promise<string | null> => {
  if (isWebAppPlatform()) {
    const user = localStorage.getItem('user') ?? '{}';
    return JSON.parse(user).id ?? null;
  }
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id ?? null;
};

export const validateUserAndToken = async (authHeader: string | null | undefined) => {
  if (!authHeader) return {};

  const token = authHeader.replace('Bearer ', '');
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return {};
  return { user, token };
};
