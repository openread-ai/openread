import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';
import type { AuthChangeEvent } from '@openread/auth';
import { clientAuth } from './clientAuth';

let unsubscribe: (() => void) | null = null;

export function startAuthLifecycle(): () => void {
  if (unsubscribe) return unsubscribe;

  unsubscribe = clientAuth.subscribe(({ session }: AuthChangeEvent) => {
    if (session) {
      posthog.identify(session.user.id);
      Sentry.setUser({ id: session.user.id });
      return;
    }

    Sentry.setUser(null);
  });

  return unsubscribe;
}

export function stopAuthLifecycle(): void {
  unsubscribe?.();
  unsubscribe = null;
}
