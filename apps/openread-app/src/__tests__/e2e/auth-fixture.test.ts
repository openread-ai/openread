import type { Page } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../e2e/fixtures/test-users', () => ({
  TEST_USER: { email: 'test@example.com', password: 'test-password' },
  SUPABASE_CONFIG: { url: 'https://example.supabase.co', anonKey: 'test-anon-key' },
  getSupabaseProjectRef: () => 'example',
}));

import { captureSession, resolveFixtureFailure } from '../../../e2e/fixtures/auth';

describe('authenticatedPage teardown', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves the primary test error when audit persistence and assertions also fail', () => {
    const primaryError = new Error('primary test failure');
    const auditPersistenceError = new Error('contract audit persistence failure');
    const auditAssertionError = new Error('contract audit assertion failure');
    let finalizationError: unknown;
    finalizationError ??= auditPersistenceError;
    finalizationError ??= auditAssertionError;

    const result = resolveFixtureFailure({
      useFailed: true,
      useError: primaryError,
      testError: primaryError,
      finalizationError,
    });

    expect(result).toEqual({ shouldThrow: true, error: primaryError });
    expect(result.error).toBe(primaryError);
  });

  it('bounds session capture when page evaluation never settles', async () => {
    vi.useFakeTimers();
    const page = {
      evaluate: vi.fn(() => new Promise(() => undefined)),
    } as unknown as Page;
    let settled = false;

    void captureSession(page).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(settled).toBe(true);
  });
});
