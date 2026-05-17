/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixture, not React — `use` is a teardown callback. */
import { test as base, type Page } from '@playwright/test';
import { createClient, type Session } from '@supabase/supabase-js';
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
  try {
    const session = await page.evaluate((supabaseStorageKey) => {
      const rawSession = localStorage.getItem(supabaseStorageKey);
      if (!rawSession) return null;
      return JSON.parse(rawSession) as Session;
    }, SUPABASE_STORAGE_KEY);

    if (session && isSessionFresh(session)) cachedSession = session;
  } catch {
    // Ignore teardown races after failed tests; the next test can sign in again.
  }
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

      // Skip welcome/onboarding/sample import flows — they block clicks or add
      // background mutations/noise that are covered by unit tests separately.
      localStorage.setItem('has_seen_welcome', 'true');
      localStorage.setItem('openread_onboarding_completed', new Date().toISOString());
      localStorage.setItem('sample_book_attempted', new Date().toISOString());
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
  await page.route(/r2\.cloudflarestorage\.com/, async (route) => {
    const url = route.request().url();
    console.log(`[R2 proxy] Fetching: ${url.slice(0, 80)}...`);
    const response = await fetch(url);
    console.log(
      `[R2 proxy] Status: ${response.status}, size: ${response.headers.get('content-length')}`,
    );
    const body = Buffer.from(await response.arrayBuffer());
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    });
  });
}

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    const session = await getTestSession();
    await injectSession(page, session);
    await proxyR2Downloads(page);
    try {
      await use(page);
    } finally {
      await captureSession(page);
    }
  },
});

export { expect } from '@playwright/test';
