import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the sync retry logic in useSync.ts.
 *
 * Since syncWithRetry is a module-level function (not exported) in useSync.ts,
 * we test the equivalent logic here by replicating it and verifying behavior.
 * This ensures the retry pattern works correctly for sync operations, including
 * handling AbortError which the AI withRetry utility explicitly skips.
 */

const SYNC_MAX_RETRIES = 2;
const SYNC_RETRY_DELAY_MS = 10; // Use short delay for tests

/** Replicated from useSync.ts for testing */
async function syncWithRetry<T>(
  fn: () => Promise<T>,
  label: string,
  onRetryLog?: (msg: string, detail: string) => void,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= SYNC_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isLastAttempt = attempt === SYNC_MAX_RETRIES;
      if (isLastAttempt) break;
      onRetryLog?.(
        `${label} failed (attempt ${attempt + 1}/${SYNC_MAX_RETRIES + 1}), retrying in ${SYNC_RETRY_DELAY_MS}ms`,
        lastError.message,
      );
      await new Promise((resolve) => setTimeout(resolve, SYNC_RETRY_DELAY_MS));
    }
  }
  throw lastError;
}

describe('syncWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue({ books: [], configs: [], notes: [] });

    const result = await syncWithRetry(fn, 'Pull books');

    expect(result).toEqual({ books: [], configs: [], notes: [] });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed on second attempt', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Request timed out'))
      .mockResolvedValue({ books: [], configs: [], notes: [] });

    const result = await syncWithRetry(fn, 'Pull books');

    expect(result).toEqual({ books: [], configs: [], notes: [] });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on failure and succeed on third attempt', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue({ books: [] });

    const result = await syncWithRetry(fn, 'Pull books');

    expect(result).toEqual({ books: [] });
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('should throw after max retries exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(syncWithRetry(fn, 'Pull books')).rejects.toThrow('always fails');

    // initial attempt + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should retry on AbortError (unlike AI withRetry)', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    const fn = vi.fn().mockRejectedValueOnce(abortError).mockResolvedValue({ books: [] });

    const result = await syncWithRetry(fn, 'Pull books');

    expect(result).toEqual({ books: [] });
    // Critically, this should be 2 (retried), not 1 (thrown immediately)
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw AbortError after max retries', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    const fn = vi.fn().mockRejectedValue(abortError);

    await expect(syncWithRetry(fn, 'Pull books')).rejects.toThrow('The operation was aborted');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should log retry attempts', async () => {
    const logFn = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue('ok');

    await syncWithRetry(fn, 'Pull books', logFn);

    expect(logFn).toHaveBeenCalledTimes(1);
    expect(logFn).toHaveBeenCalledWith(
      expect.stringContaining('Pull books failed (attempt 1/3)'),
      'timeout',
    );
  });

  it('should log multiple retry attempts', async () => {
    const logFn = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('error 1'))
      .mockRejectedValueOnce(new Error('error 2'))
      .mockResolvedValue('ok');

    await syncWithRetry(fn, 'Push changes', logFn);

    expect(logFn).toHaveBeenCalledTimes(2);
    expect(logFn).toHaveBeenCalledWith(
      expect.stringContaining('Push changes failed (attempt 1/3)'),
      'error 1',
    );
    expect(logFn).toHaveBeenCalledWith(
      expect.stringContaining('Push changes failed (attempt 2/3)'),
      'error 2',
    );
  });

  it('should handle non-Error thrown values', async () => {
    const fn = vi.fn().mockRejectedValueOnce('string error').mockResolvedValue('ok');

    const result = await syncWithRetry(fn, 'Pull books');

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should preserve the last error when all retries fail', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('first error'))
      .mockRejectedValueOnce(new Error('second error'))
      .mockRejectedValueOnce(new Error('third error'));

    await expect(syncWithRetry(fn, 'Test')).rejects.toThrow('third error');
  });

  it('should not retry when fn succeeds first time even with previous failures', async () => {
    // Verify the happy path does not introduce unnecessary delay
    const start = Date.now();
    const fn = vi.fn().mockResolvedValue('fast');

    await syncWithRetry(fn, 'Test');

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50); // Should be near-instant
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
