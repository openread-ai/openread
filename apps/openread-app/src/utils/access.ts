import { jwtDecode } from 'jwt-decode';
import { decodeJwtPayload, isAccessTokenExpired } from '@openread/auth';
import { getAccessToken as getCanonicalAccessToken } from '@/services/auth/tokenProvider';
import { clientAuth } from '@/services/auth/clientAuth';
import { UserPlan } from '@/types/quota';
import { getDailyUsage } from '@/services/translators/utils';

interface Token {
  plan: UserPlan;
  storage_usage_bytes: number;
  exp?: number;
  [key: string]: string | number | undefined;
}

/** Compatibility export; canonical expiry policy lives in @openread/auth. */
export function isTokenExpired(token: string, graceSeconds = 30): boolean {
  return isAccessTokenExpired(token, graceSeconds);
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

export const getAccessToken = async (): Promise<string | null> => getCanonicalAccessToken();

export const getUserID = async (): Promise<string | null> => {
  const session = await clientAuth.refreshIfNeeded();
  return session?.user.id ?? null;
};

export const validateUserAndToken = async (authHeader: string | null | undefined) => {
  const { validateUserAndToken: validate } = await import('@/services/auth/serverAuth');
  return validate(authHeader);
};

export const getTokenClaims = (token: string) => decodeJwtPayload(token);
