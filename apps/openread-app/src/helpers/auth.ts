import { clientAuth } from '@/services/auth/clientAuth';
import { createLogger } from '@/utils/logger';

const logger = createLogger('auth');
const AUTH_REDIRECT_ORIGIN = 'https://openread.invalid';

export function safeInternalRedirect(value: string | null | undefined): string | null {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    /\s|[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return null;
  }

  try {
    decodeURI(value);
    const url = new URL(value, AUTH_REDIRECT_ORIGIN);
    if (
      url.origin !== AUTH_REDIRECT_ORIGIN ||
      !url.pathname.startsWith('/') ||
      url.pathname.startsWith('//')
    ) {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

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
      navigate('/auth/error');
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
    navigate(safeInternalRedirect(next) ?? '/home');
  }

  finalizeSession();
}
