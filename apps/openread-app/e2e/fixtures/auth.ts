/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixture, not React — `use` is a teardown callback. */
import { test as base, type Page } from '@playwright/test';
import { createClient, type Session } from '@supabase/supabase-js';
import {
  assertContractAudit,
  hashContractEvidence,
  persistContractAudit,
  startContractAudit,
} from '../helpers/contract-audit';
import { TEST_USER, SUPABASE_CONFIG, getSupabaseProjectRef } from './test-users';

/**
 * Two localStorage writes are BOTH required — missing either breaks auth silently:
 *
 *   1. Custom keys (`token`, `refresh_token`, `user`) — AuthContext reads these
 *      directly on mount at src/context/AuthContext.tsx:26-38.
 *
 *   2. `sb-<projectRef>-auth-token` — @supabase/supabase-js reads this when
 *      refreshSession() fires on mount (AuthContext.tsx:103). Without it,
 *      refreshSession fails, syncSession(null) fires, and the keys from
 *      step 1 get wiped before first render.
 */

const SUPABASE_STORAGE_KEY = `sb-${getSupabaseProjectRef()}-auth-token`;
const SESSION_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const SESSION_CAPTURE_TIMEOUT_MS = 5_000;

let cachedSession: Session | null = null;
let inFlightSession: Promise<Session> | null = null;

function sessionExpiresAtMs(session: Session): number {
  return Number(session.expires_at ?? 0) * 1000;
}

function isSessionFresh(session: Session): boolean {
  const expiresAt = sessionExpiresAtMs(session);
  return Boolean(
    session.access_token &&
    session.refresh_token &&
    expiresAt > Date.now() + SESSION_REFRESH_MARGIN_MS,
  );
}

// Cache the current Supabase session between serial Playwright tests. The app
// refreshes and rotates the token on mount, so the fixture captures the updated
// sb-* value after each test and injects that latest token into the next fresh
// browser context instead of calling signInWithPassword dozens of times.
export async function getTestSession(): Promise<Session> {
  if (cachedSession && isSessionFresh(cachedSession)) return cachedSession;
  if (inFlightSession) return inFlightSession;

  inFlightSession = signInTestUser();
  try {
    cachedSession = await inFlightSession;
    return cachedSession;
  } finally {
    inFlightSession = null;
  }
}

async function signInTestUser(): Promise<Session> {
  const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_USER.email,
    password: TEST_USER.password,
  });

  if (error) {
    throw new Error(
      `Failed to sign in as test user ${TEST_USER.email}: ${error.message}\n` +
        `Verify TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.test.local.`,
    );
  }
  if (!data.session) {
    throw new Error(`signInWithPassword returned no session for ${TEST_USER.email}`);
  }

  return data.session;
}

export async function captureSession(page: Page): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const session = await Promise.race([
      page
        .evaluate((supabaseStorageKey) => {
          const rawSession = localStorage.getItem(supabaseStorageKey);
          if (!rawSession) return null;
          return JSON.parse(rawSession) as Session;
        }, SUPABASE_STORAGE_KEY)
        .catch(() => null),
      new Promise<null>((resolve) => {
        timeout = setTimeout(resolve, SESSION_CAPTURE_TIMEOUT_MS, null);
      }),
    ]);

    if (session && isSessionFresh(session)) cachedSession = session;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function resolveFixtureFailure(input: {
  useFailed: boolean;
  useError: unknown;
  testError: unknown;
  finalizationError: unknown;
}): { shouldThrow: boolean; error: unknown } {
  if (input.useFailed) return { shouldThrow: true, error: input.useError };
  if (input.testError || input.finalizationError === undefined) {
    return { shouldThrow: false, error: undefined };
  }
  return { shouldThrow: true, error: input.finalizationError };
}

export async function injectSession(page: Page, session: Session): Promise<void> {
  await page.addInitScript(
    ({ session, supabaseStorageKey }) => {
      const hasCompleteCustomSession = Boolean(
        localStorage.getItem('token') &&
        localStorage.getItem('refresh_token') &&
        localStorage.getItem('user'),
      );
      const hasSupabaseSession = Boolean(localStorage.getItem(supabaseStorageKey));

      // Only seed the initial session when auth storage is absent/incomplete.
      // This init script runs on every navigation/reload, and overwriting an
      // already-refreshed Supabase session can send hard reloads back through /auth.
      if (!hasCompleteCustomSession || !hasSupabaseSession) {
        localStorage.setItem('token', session.access_token);
        localStorage.setItem('refresh_token', session.refresh_token);
        localStorage.setItem('user', JSON.stringify(session.user));
        localStorage.setItem(supabaseStorageKey, JSON.stringify(session));
      }

      // Skip empty-library onboarding; the behavior is covered by unit tests separately.
      localStorage.setItem(`openread:empty-library-onboarding:${session.user.id}`, 'completed');
    },
    { session, supabaseStorageKey: SUPABASE_STORAGE_KEY },
  );
}

export async function clearSession(page: Page): Promise<void> {
  await page.evaluate(
    ({ supabaseStorageKey }) => {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      localStorage.removeItem(supabaseStorageKey);
    },
    { supabaseStorageKey: SUPABASE_STORAGE_KEY },
  );
}

async function proxyR2Downloads(page: Page): Promise<void> {
  if (process.env.AI_EVAL_SKIP_R2_PROXY === '1') return;

  await page.route(/r2\.cloudflarestorage\.com/, async (route) => {
    const url = route.request().url();
    const pathSha256 = hashContractEvidence(new URL(url).pathname);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      console.log(`[R2 proxy] Fetching: host=r2.cloudflarestorage.com, pathSha256=${pathSha256}`);
      const response = await fetch(url, { signal: controller.signal });
      console.log(
        `[R2 proxy] Status: ${response.status}, size: ${response.headers.get('content-length')}`,
      );
      const body = Buffer.from(await response.arrayBuffer());
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body,
      });
    } catch (error) {
      console.warn(
        `[R2 proxy] Falling back to browser fetch after proxy failure: ${String(error)}`,
      );
      await route.continue();
    } finally {
      clearTimeout(timeout);
    }
  });
}

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use, testInfo) => {
    const session = await getTestSession();
    await injectSession(page, session);
    await proxyR2Downloads(page);
    const audit = process.env.OPENREAD_E2E_CONTRACT_AUDIT === '1' ? startContractAudit(page) : null;
    let useFailed = false;
    let useError: unknown;
    let finalizationError: unknown;

    try {
      await use(page);
    } catch (error) {
      useFailed = true;
      useError = error;
    } finally {
      const finalizationStartedAt = Date.now();
      const sessionCaptureStartedAt = Date.now();
      await captureSession(page);
      const sessionCaptureMs = Date.now() - sessionCaptureStartedAt;

      if (audit) {
        audit.stop();
        try {
          await persistContractAudit(testInfo, audit, {
            finalizationStartedAt: new Date(finalizationStartedAt).toISOString(),
            sessionCaptureMs,
          });
        } catch (error) {
          finalizationError = error;
        }
        try {
          assertContractAudit(audit, {
            runtimeErrors: process.env.OPENREAD_E2E_CONTRACT_RUNTIME_ERRORS === '1',
          });
        } catch (error) {
          finalizationError ??= error;
        }
      }
    }

    const failure = resolveFixtureFailure({
      useFailed,
      useError,
      testError: testInfo.error,
      finalizationError,
    });
    if (failure.shouldThrow) throw failure.error;
  },
});

export { expect } from '@playwright/test';
