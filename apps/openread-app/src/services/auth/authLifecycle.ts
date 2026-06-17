import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';
import type { AuthChangeEvent } from '@openread/auth';
import { clientAuth } from './clientAuth';
import { syncWorker } from '@/services/sync/syncWorker';

let unsubscribe: (() => void) | null = null;

export function startAuthLifecycle(): () => void {
  if (unsubscribe) return unsubscribe;

  unsubscribe = clientAuth.subscribe(({ session }: AuthChangeEvent) => {
    if (session) {
      posthog.identify(session.user.id);
      Sentry.setUser({ id: session.user.id });
      syncWorker.start(session.user.id);
      return;
    }

    Sentry.setUser(null);
    syncWorker.stop();
  });

  return unsubscribe;
}

export function stopAuthLifecycle(): void {
  unsubscribe?.();
  unsubscribe = null;
}
