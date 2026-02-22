import { createLogger } from '@/utils/logger';

const logger = createLogger('error');

/** Extract a human-readable message from an unknown thrown value. */
export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  return error instanceof Error ? error.message : fallback;
}

export const handleGlobalError = (e: Error) => {
  const isChunkError = e?.message?.includes('Loading chunk');

  if (!isChunkError) {
    const now = Date.now();
    const lastReload = Number(sessionStorage.getItem('lastErrorReload') || '0');
    if (now - lastReload > 60_000) {
      sessionStorage.setItem('lastErrorReload', String(now));
      window.location.reload();
    } else {
      logger.warn('Error detected, but reload suppressed (rate limit)');
    }
  }
};
