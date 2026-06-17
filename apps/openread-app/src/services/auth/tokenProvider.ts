import type { AuthTokenProvider } from '@openread/auth';
import { clientAuth } from './clientAuth';

export const appAuthTokenProvider: AuthTokenProvider = {
  getAccessToken: () => clientAuth.getAccessToken(),
  refreshIfNeeded: () => clientAuth.refreshIfNeeded(),
  clear: () => clientAuth.clear(),
};

export const getAccessToken = () => appAuthTokenProvider.getAccessToken();
export const refreshIfNeeded = () => appAuthTokenProvider.refreshIfNeeded();
export const clearAuthSession = () => appAuthTokenProvider.clear();
