import { decodeJwtPayload, isAccessTokenExpired } from '@openread/auth';
import { getAccessToken as getCanonicalAccessToken } from '@/services/auth/tokenProvider';
import { clientAuth } from '@/services/auth/clientAuth';

/** Compatibility export; canonical expiry policy lives in @openread/auth. */
export function isTokenExpired(token: string, graceSeconds = 30): boolean {
  return isAccessTokenExpired(token, graceSeconds);
}

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
