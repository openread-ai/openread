import type { Page } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../e2e/fixtures/test-users', () => ({
  TEST_USER: { email: 'test@example.com', password: 'test-password' },
  SUPABASE_CONFIG: { url: 'https://example.supabase.co', anonKey: 'test-anon-key' },
  getSupabaseProjectRef: () => 'example',
}));

import { captureSession } from '../../../e2e/fixtures/auth';

describe('authenticatedPage teardown', () => {
  afterEach(() => {
    vi.useRealTimers();
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
