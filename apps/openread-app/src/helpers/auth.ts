import { User } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';
import { createLogger } from '@/utils/logger';

const logger = createLogger('auth');

interface UseAuthCallbackOptions {
  accessToken?: string | null;
  refreshToken?: string | null;
  login: (accessToken: string, user: User) => void;
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
  login,
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

    const { error: err } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (err) {
      logger.error('Error setting session:', err);
      navigate('/auth/error');
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      login(accessToken, user);
      if (type === 'recovery') {
        navigate('/auth/recovery');
        return;
      }
      navigate(next);
    } else {
      logger.error('Error fetching user data');
      navigate('/auth/error');
    }
  }

  finalizeSession();
}
