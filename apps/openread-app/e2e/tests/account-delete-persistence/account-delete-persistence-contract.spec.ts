import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import {
  buildContractAuditArtifact,
  hashContractEvidence,
  startContractAudit,
  type ContractAudit,
} from '../../helpers/contract-audit';
import {
  attachScenarioEvidenceArtifact,
  attachViewportEvidence,
} from '../../helpers/settings-contract';

const QA_TARGET = 'account-delete-persistence';
const AUTH_ENV = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const;
const ACCOUNT_A_ENV = [
  ...AUTH_ENV,
  'TEST_ACCOUNT_A_EMAIL',
  'TEST_ACCOUNT_A_PASSWORD',
  'TEST_ACCOUNT_A_SENTINEL_BOOK_TITLE',
] as const;
const ACCOUNT_B_ENV = [
  ...AUTH_ENV,
  'TEST_ACCOUNT_B_EMAIL',
  'TEST_ACCOUNT_B_PASSWORD',
  'TEST_ACCOUNT_B_SENTINEL_BOOK_TITLE',
] as const;
const BOOK_DELETE_ENV = [
  ...AUTH_ENV,
  'TEST_ACCOUNT_A_EMAIL',
  'TEST_ACCOUNT_A_PASSWORD',
  'TEST_DELETE_BOOK_TITLE',
  'TEST_DELETE_BOOK_HASH',
  'OPENREAD_QA_ALLOW_BOOK_DELETE',
  'OPENREAD_QA_SQL_VERIFICATION',
  'OPENREAD_QA_STORAGE_AUDIT',
] as const;

type EnvName = (typeof ACCOUNT_A_ENV | typeof ACCOUNT_B_ENV | typeof BOOK_DELETE_ENV)[number];

type QaAccount = {
  email: string;
  password: string;
  sentinelTitle: string;
};

function isTargetedQaRun() {
  return process.env.OPENREAD_QA_TARGET === QA_TARGET;
}

function envValue(name: EnvName): string {
  return process.env[name] ?? '';
}

function safeEvidenceName(value: string) {
  return value
    .replace(/[^A-Z0-9-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function requireEnv(testInfo: TestInfo, scenarioId: string, names: readonly EnvName[]) {
  const missing = [...new Set(names.filter((name) => !process.env[name]))];
  if (missing.length > 0) {
    await attachScenarioEvidenceArtifact(testInfo, `${safeEvidenceName(scenarioId)}-env-blocked`, {
      target: QA_TARGET,
      classification: 'env-blocked/no live QA fixture configured',
      scenarioId,
      missing,
      generatedAt: new Date().toISOString(),
      note: 'This is not product-defect evidence. Green evidence requires the listed live QA env/fixture values.',
    });
  }
  expect(
    missing,
    `${scenarioId} env-blocked: configure ${missing.join(', ')} before capturing live account/book-delete evidence.`,
  ).toEqual([]);
}

async function requireDeleteEnv(testInfo: TestInfo, scenarioId: string) {
  await requireEnv(testInfo, scenarioId, BOOK_DELETE_ENV);
  expect(
    envValue('OPENREAD_QA_ALLOW_BOOK_DELETE'),
    `${scenarioId} destructive delete is blocked until OPENREAD_QA_ALLOW_BOOK_DELETE=1 is set for a disposable book fixture.`,
  ).toBe('1');
  expect(
    envValue('OPENREAD_QA_SQL_VERIFICATION'),
    `${scenarioId} requires SQL verification for server-authoritative books.deleted_at evidence.`,
  ).toBe('1');
  expect(
    envValue('OPENREAD_QA_STORAGE_AUDIT'),
    `${scenarioId} requires storage/R2 audit evidence for owned-object cleanup.`,
  ).toBe('1');
}

function accountA(): QaAccount {
  return {
    email: envValue('TEST_ACCOUNT_A_EMAIL'),
    password: envValue('TEST_ACCOUNT_A_PASSWORD'),
    sentinelTitle: envValue('TEST_ACCOUNT_A_SENTINEL_BOOK_TITLE'),
  };
}

function accountB(): QaAccount {
  return {
    email: envValue('TEST_ACCOUNT_B_EMAIL'),
    password: envValue('TEST_ACCOUNT_B_PASSWORD'),
    sentinelTitle: envValue('TEST_ACCOUNT_B_SENTINEL_BOOK_TITLE'),
  };
}

async function signIn(email: string, password: string) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    envValue('NEXT_PUBLIC_SUPABASE_URL'),
    envValue('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Failed to sign in ${email}: ${error.message}`);
  if (!data.session) throw new Error(`No session returned for ${email}`);
  return data.session;
}

function supabaseStorageKey() {
  const ref = new URL(envValue('NEXT_PUBLIC_SUPABASE_URL')).hostname.split('.')[0];
  if (!ref) throw new Error('Could not derive Supabase project ref.');
  return `sb-${ref}-auth-token`;
}

async function newAuthenticatedPage(browser: Browser, account: QaAccount) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const session = await signIn(account.email, account.password);
  await page.addInitScript(
    ({ session, storageKey }) => {
      localStorage.setItem('token', session.access_token);
      localStorage.setItem('refresh_token', session.refresh_token);
      localStorage.setItem('user', JSON.stringify(session.user));
      localStorage.setItem(storageKey, JSON.stringify(session));
      localStorage.setItem(`openread:empty-library-onboarding:${session.user.id}`, 'completed');
    },
    { session, storageKey: supabaseStorageKey() },
  );
  return { context, page };
}

async function openLibraryAndExpectSentinel(page: Page, title: string) {
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'All Books' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: new RegExp(escapeRegExp(title), 'i') })).toBeVisible({
    timeout: 45_000,
  });
}

async function expectSentinelAbsent(page: Page, title: string) {
  await expect(page.getByRole('link', { name: new RegExp(escapeRegExp(title), 'i') })).toHaveCount(
    0,
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function attachAudit(
  testInfo: TestInfo,
  name: string,
  audit: ContractAudit,
  extra: object = {},
) {
  await attachScenarioEvidenceArtifact(
    testInfo,
    name,
    buildContractAuditArtifact(audit, {
      target: QA_TARGET,
      generatedAt: new Date().toISOString(),
      guardrails: {
        mockedBrowserRoutes: false,
        localStorageOrIndexedDbProofAfterAuthBootstrap: false,
        hiddenAfterEachCleanup: false,
        manuallyCuratedEvidence: false,
      },
      ...extra,
    }),
  );
}

test.describe('Account/book-delete/persistence contract red baseline', () => {
  test.skip(
    !isTargetedQaRun(),
    `Run through the canonical QA target: node e2e/qa/cli.mjs platform-run --target ${QA_TARGET} --platform web-chromium`,
  );

  test('ACCT-001/ACCT-002/ACCT-003 captures env-blocked A/B account isolation baseline slot', async ({
    browser,
  }, testInfo) => {
    await requireEnv(testInfo, 'ACCT-001/ACCT-002/ACCT-003', [...ACCOUNT_A_ENV, ...ACCOUNT_B_ENV]);

    const accountAPage = await newAuthenticatedPage(browser, accountA());
    const auditA = startContractAudit(accountAPage.page);
    await openLibraryAndExpectSentinel(accountAPage.page, accountA().sentinelTitle);
    await attachViewportEvidence(
      accountAPage.page,
      testInfo,
      'ACCT-001-start-account-a-library-isolation',
    );
    auditA.stop();
    await accountAPage.context.close();

    const accountBPage = await newAuthenticatedPage(browser, accountB());
    const auditB = startContractAudit(accountBPage.page);
    await openLibraryAndExpectSentinel(accountBPage.page, accountB().sentinelTitle);
    await expectSentinelAbsent(accountBPage.page, accountA().sentinelTitle);
    await attachViewportEvidence(
      accountBPage.page,
      testInfo,
      'ACCT-001-terminal-account-b-library-isolation',
    );
    auditB.stop();
    await accountBPage.context.close();

    const accountAReturnPage = await newAuthenticatedPage(browser, accountA());
    await openLibraryAndExpectSentinel(accountAReturnPage.page, accountA().sentinelTitle);
    await expectSentinelAbsent(accountAReturnPage.page, accountB().sentinelTitle);
    await attachViewportEvidence(
      accountAReturnPage.page,
      testInfo,
      'ACCT-003-terminal-account-a-return-integrity',
    );
    await accountAReturnPage.context.close();

    await attachAudit(testInfo, 'ACCT-001-ACCT-002-ACCT-003-network-console-audit', auditA, {
      accountA: {
        emailSha256: hashContractEvidence(accountA().email),
        sentinelTitleSha256: hashContractEvidence(accountA().sentinelTitle),
      },
      accountB: {
        emailSha256: hashContractEvidence(accountB().email),
        sentinelTitleSha256: hashContractEvidence(accountB().sentinelTitle),
      },
      accountBAudit: auditB.snapshot(),
    });
  });

  test('DEL-001/DEL-002 captures env-blocked book delete server-storage baseline slot', async ({
    page,
  }, testInfo) => {
    await requireDeleteEnv(testInfo, 'DEL-001/DEL-002');
    const audit = startContractAudit(page);

    await attachScenarioEvidenceArtifact(testInfo, 'DEL-001-DEL-002-live-delete-preconditions', {
      target: QA_TARGET,
      classification: 'destructive-live-book-delete-enabled',
      bookTitle: envValue('TEST_DELETE_BOOK_TITLE'),
      bookHash: envValue('TEST_DELETE_BOOK_HASH'),
      requiredProof: [
        'UI removal from account A Library/Home',
        'server-authoritative books.deleted_at SQL/API proof',
        'files/R2 object removed or tombstoned with signed URLs redacted',
        'quota/storage reconciliation note',
      ],
    });
    audit.stop();
    await attachAudit(testInfo, 'DEL-001-DEL-002-network-console-audit', audit);

    expect(
      false,
      'DEL-001/DEL-002 baseline slot is intentionally red until destructive book-delete UI + SQL/R2 verification is implemented for the disposable fixture.',
    ).toBe(true);
  });

  test('DEL-003/DEL-004/DEL-005/DEL-006 captures env-blocked delete propagation persistence baseline slot', async ({}, testInfo) => {
    await requireDeleteEnv(testInfo, 'DEL-003/DEL-004/DEL-005/DEL-006');
    await attachScenarioEvidenceArtifact(
      testInfo,
      'DEL-003-DEL-004-DEL-005-DEL-006-follow-up-matrix',
      {
        target: QA_TARGET,
        requiredProof: [
          'two account-A sessions/devices observe tombstone propagation',
          'account B remains isolated during/after account A delete',
          'offline delete mutation survives reload/logout/account switch and drains under account A',
          'legacy/pre-namespace book key maps to the correct canonical row',
          'soft-deleted book does not resurrect during passive sync or account switch',
        ],
        classification: 'env-blocked/no multi-session offline legacy fixture configured',
      },
    );

    expect(
      false,
      'DEL-003..DEL-006 baseline slot is intentionally red until multi-session/offline/legacy fixtures and verification are provisioned.',
    ).toBe(true);
  });

  test('PAR-001/PAR-002 validates canonical platform target and fixture reset contract', async ({
    page,
  }, testInfo) => {
    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
    await attachViewportEvidence(page, testInfo, 'PAR-001-terminal-canonical-platform-target');
    await attachScenarioEvidenceArtifact(
      testInfo,
      'PAR-001-PAR-002-canonical-target-and-reset-contract',
      {
        target: QA_TARGET,
        canonicalRunner: 'apps/openread-app/e2e/qa/cli.mjs',
        canonicalContractSource:
          'apps/openread-app/e2e/qa/registry/everything-current-state-and-qa-baseline.md',
        targetGated: true,
        defaultCiGreen: true,
        setupResetRequired: [
          'account A/B fixture inventory before mutation',
          'disposable book identity and storage-key inventory before delete',
          'SQL/storage/outbox verification artifacts after mutation',
          'explicit cleanup or residue report; no hidden afterEach cleanup',
        ],
      },
    );
  });
});
