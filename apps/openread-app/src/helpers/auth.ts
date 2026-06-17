import { clientAuth } from '@/services/auth/clientAuth';
import { createLogger } from '@/utils/logger';

const logger = createLogger('auth');

interface UseAuthCallbackOptions {
  accessToken?: string | null;
  refreshToken?: string | null;
  navigate: (path: string) => void;
  type?: string | null;
  next?: string;
  error?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
}

export function handleAuthCallback({
  accessToken,
  refreshToken,
  navigate,
  type,
  next = '/home',
  error,
}: UseAuthCallbackOptions) {
  async function finalizeSession() {
    if (error) {
      navigate('/auth/error');
      return;
    }

    if (!accessToken || !refreshToken) {
      navigate('/home');
      return;
    }

    const session = await clientAuth.installSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (!session?.user) {
      logger.error('Error installing auth session');
      navigate('/auth/error');
      return;
    }

    if (type === 'recovery') {
      navigate('/auth/recovery');
      return;
    }
    navigate(next);
  }

  finalizeSession();
}
