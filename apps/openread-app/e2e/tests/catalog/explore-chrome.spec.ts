import { createHash } from 'node:crypto';
import type { Locator, Page, Request, Response, TestInfo } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { ReaderPage } from '../../pages/ReaderPage';

const finalProofMode = process.env['OPENREAD_E2E_CATALOG_FINAL_PROOF'] === '1';
const configuredCatalogBookId = process.env['OPENREAD_E2E_CATALOG_BOOK_ID'];
const CATALOG_ADD_PREFLIGHT_BUDGET_MS = 300_000;
const CATALOG_ADD_ACCEPTANCE_BUDGET_MS = 30_000;
const CATALOG_ADD_TERMINAL_BUDGET_MS = 840_000;
const CATALOG_ADD_CLEANUP_VISIBILITY_MS = 120_000;
const CATALOG_ADD_CLEANUP_BUDGET_MS = 180_000;
const CATALOG_ADD_EVIDENCE_BUDGET_MS = 5_000;
const CATALOG_ADD_TEST_OVERHEAD_BUDGET_MS = 60_000;
const CATALOG_ADD_TEST_TIMEOUT_MS =
  CATALOG_ADD_PREFLIGHT_BUDGET_MS +
  CATALOG_ADD_ACCEPTANCE_BUDGET_MS +
  CATALOG_ADD_TERMINAL_BUDGET_MS +
  CATALOG_ADD_CLEANUP_BUDGET_MS +
  CATALOG_ADD_TEST_OVERHEAD_BUDGET_MS;

type SanitizedNetworkTarget = {
  origin: string;
  pathSha256: string;
};

type SanitizedNetworkRequest = SanitizedNetworkTarget & {
  method: string;
  resourceType: string;
};

function sanitizedNetworkTarget(rawUrl: string): SanitizedNetworkTarget {
  const url = new URL(rawUrl);
  return {
    origin: url.origin,
    pathSha256: createHash('sha256').update(url.pathname).digest('hex'),
  };
}

function sanitizedNetworkRequest(request: Request): SanitizedNetworkRequest {
  return {
    ...sanitizedNetworkTarget(request.url()),
    method: request.method(),
    resourceType: request.resourceType(),
  };
}

function isCatalogUpstreamHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'library.oapen.org' ||
    host.endsWith('.oapen.org') ||
    host === 'archive.org' ||
    host.endsWith('.archive.org') ||
    host === 'doabooks.org' ||
    host.endsWith('.doabooks.org')
  );
}

function isR2Host(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host.endsWith('.r2.cloudflarestorage.com') || host.endsWith('.r2.dev');
}

function sameNetworkTarget(
  request: SanitizedNetworkTarget,
  expected: SanitizedNetworkTarget,
): boolean {
  return request.origin === expected.origin && request.pathSha256 === expected.pathSha256;
}

function finalProofCatalogBookId(): string | null {
  if (!configuredCatalogBookId) {
    if (finalProofMode) throw new Error('Final proof requires OPENREAD_E2E_CATALOG_BOOK_ID');
    return null;
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      configuredCatalogBookId,
    )
  ) {
    throw new Error('OPENREAD_E2E_CATALOG_BOOK_ID must be a UUID');
  }
  return configuredCatalogBookId;
}

function blockOrFailFinalProof(testInfo: TestInfo, description: string): never {
  testInfo.annotations.push({ type: 'blocked', description });
  if (finalProofMode) throw new Error(description);
  test.skip(true, description);
  throw new Error(description);
}

async function firstCatalogCard(
  page: Page,
  catalogBookId = finalProofCatalogBookId(),
  visibilityTimeoutMs = 45_000,
): Promise<Locator> {
  const rails = page.getByTestId('explore-rails');
  await expect(rails).toBeVisible({ timeout: 30_000 });
  const card = catalogBookId
    ? rails.getByTestId(`card-tap-${catalogBookId}`).filter({ visible: true }).first()
    : rails.locator('[data-testid^="card-tap-"]').first();
  await expect(card).toBeVisible({ timeout: visibilityTimeoutMs });
  return card;
}

async function waitForTierConfig(page: Page): Promise<Response | null> {
  return page
    .waitForResponse((response) => new URL(response.url()).pathname.endsWith('/api/tier-config'), {
      timeout: 30_000,
    })
    .catch(() => null);
}

async function gotoExploreWithAddPrereqs(page: Page): Promise<Response | null> {
  const tierConfigReady = waitForTierConfig(page);
  await page.goto('/explore', { waitUntil: 'domcontentloaded' });
  const tierConfigResponse = await tierConfigReady;
  // React applies tier-config/library-limit state after the network response resolves.
  // Wait one render turn before exercising Add so the test does not click during
  // the fail-closed quota-loading window.
  await page.waitForTimeout(1_500);
  return tierConfigResponse;
}

function skipIfTierConfigBlocked(tierConfigResponse: Response | null, testInfo: TestInfo): void {
  if (tierConfigResponse?.ok()) return;

  const status = tierConfigResponse?.status() ?? 'missing';
  const retryAfter = tierConfigResponse?.headers()['retry-after'] ?? 'absent';
  const rateLimitReset =
    tierConfigResponse?.headers()['ratelimit-reset'] ??
    tierConfigResponse?.headers()['x-ratelimit-reset'] ??
    'absent';
  blockOrFailFinalProof(
    testInfo,
    `Tier config unavailable before catalog Add smoke; status=${status}; retry-after=${retryAfter}; rate-limit-reset=${rateLimitReset}. Add is fail-closed without tier config.`,
  );
}

async function openFirstCatalogBook(page: Page): Promise<Locator> {
  const card = await firstCatalogCard(page);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/explore' && Boolean(url.searchParams.get('book')), {
      timeout: 15_000,
    }),
    card.click(),
  ]);

  const sheet = page.getByTestId('book-detail-sheet');
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByTestId('sheet-title')).toBeVisible();
  return sheet;
}

async function describeButtonTarget(button: Locator) {
  return button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const topElement = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return {
      text: element.textContent?.trim() ?? '',
      ariaLabel: element.getAttribute('aria-label'),
      testId: element.getAttribute('data-testid'),
      catalogBookId: element.getAttribute('data-catalog-book-id'),
      addMode: element.getAttribute('data-add-mode'),
      importState: element.getAttribute('data-import-state'),
      importReady: element.getAttribute('data-import-ready'),
      importBlockedReason: element.getAttribute('data-import-blocked-reason'),
      disabled: element instanceof HTMLButtonElement ? element.disabled : false,
      ariaDisabled: element.getAttribute('aria-disabled'),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      topElementTag: topElement?.tagName ?? null,
      topElementTestId: topElement?.getAttribute('data-testid') ?? null,
      topElementText: topElement?.textContent?.trim().slice(0, 80) ?? null,
    };
  });
}

function escapeCssAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function libraryBookLinkByHash(page: Page, bookHash: string) {
  const rawHash = escapeCssAttributeValue(bookHash);
  const encodedHash = escapeCssAttributeValue(encodeURIComponent(bookHash));
  return page.locator(`a[href*="${rawHash}"], a[href*="${encodedHash}"]`).first();
}

async function installE2ERateLimitIsolation(page: Page, testInfo: TestInfo) {
  if (process.env['OPENREAD_E2E_RATE_LIMIT_ISOLATION'] !== 'enabled') return;
  const secret = process.env['OPENREAD_E2E_RATE_LIMIT_SECRET'];
  if (!secret) return;

  const runId =
    process.env['OPENREAD_E2E_RATE_LIMIT_RUN_ID'] ??
    `lane3-${testInfo.workerIndex}-${Date.now().toString(36)}`;

  await page.route(/\/api\/catalog\/books\/[^/]+\/import(?:\?.*)?$/, (route) => {
    const headers = {
      ...route.request().headers(),
      'x-openread-e2e-rate-limit-run-id': runId,
      'x-openread-e2e-rate-limit-secret': secret,
    };
    return route.continue({ headers });
  });
}

function containsDeletion(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsDeletion);
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.op === 'delete' || record.tombstone) return true;
  return Object.values(record).some(containsDeletion);
}

function isPreAddDeletionRequest(request: Request): boolean {
  if (request.method() === 'DELETE') return true;
  const path = new URL(request.url()).pathname;
  if (request.method() !== 'POST' || !path.endsWith('/api/sync/push')) return false;
  try {
    return containsDeletion(request.postDataJSON());
  } catch {
    return false;
  }
}

function catalogAddBookHashFromRequest(request: Request, catalogBookId: string): string | null {
  const path = new URL(request.url()).pathname;
  return request.method() === 'POST' && path === `/api/catalog/books/${catalogBookId}/import`
    ? `catalog:${catalogBookId}`
    : null;
}

function assertNoPreAddDeletionRequests(requests: SanitizedNetworkRequest[]): void {
  expect(
    requests,
    'Catalog Add must not emit destructive traffic before its canonical request',
  ).toEqual([]);
}

async function finalProofImportButton(
  sheet: Locator,
  catalogBookId: string,
  visibilityTimeoutMs = 30_000,
): Promise<Locator> {
  if (
    await sheet
      .getByTestId('sheet-read-btn')
      .isVisible()
      .catch(() => false)
  ) {
    throw new Error('CATALOG_ADD_TARGET_COLLISION');
  }
  if (
    await sheet
      .getByTestId('sheet-importing')
      .isVisible()
      .catch(() => false)
  ) {
    throw new Error('CATALOG_ADD_ALREADY_IMPORTING');
  }

  const button = sheet.locator(
    `[data-testid="sheet-import-btn"][data-catalog-book-id="${escapeCssAttributeValue(
      catalogBookId,
    )}"]`,
  );
  await expect(button).toBeVisible({ timeout: visibilityTimeoutMs });
  const target = await describeButtonTarget(button);
  if (target.importState !== 'idle' || target.importReady !== 'true' || target.disabled) {
    throw new Error(`CATALOG_ADD_PREFLIGHT_BLOCKED:${target.importBlockedReason ?? 'unknown'}`);
  }
  return button;
}

async function waitForCatalogAddTerminal(
  page: Page,
  addRequestId: string,
  timeoutMs: number,
): Promise<'ready' | 'failed' | 'timed_out'> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await page.request
      .get(`/api/catalog/add-requests/${encodeURIComponent(addRequestId)}`, {
        failOnStatusCode: false,
      })
      .catch(() => null);
    if (response?.ok()) {
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (payload?.state === 'ready' || payload?.state === 'failed') return payload.state;
    }
    await page.waitForTimeout(Math.min(2_000, Math.max(0, deadline - Date.now())));
  }
  return 'timed_out';
}

async function removeLibraryBookByHashIfPresent(
  page: Page,
  bookHash: string,
  title?: string,
  visibilityTimeoutMs = 10_000,
): Promise<Response | null> {
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'All Books' })).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('search-input').fill(title ?? '');

  const bookLink = libraryBookLinkByHash(page, bookHash);
  const becameVisible = await bookLink
    .waitFor({ state: 'visible', timeout: visibilityTimeoutMs })
    .then(() => true)
    .catch(() => false);
  if (!becameVisible) return null;

  const card = page.locator('div.group').filter({ has: bookLink }).first();
  await card.getByRole('button', { name: 'Book options' }).click();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  await page.getByRole('button', { name: 'Delete Permanently' }).click();

  const syncPushPromise = page
    .waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/api/sync/push'),
      { timeout: 30_000 },
    )
    .catch(() => null);
  await page.getByRole('button', { name: 'Yes, Delete Permanently' }).click();
  await expect(bookLink).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText('Syncing your library...')).toBeHidden({ timeout: 30_000 });
  return syncPushPromise;
}

async function revealHeader(page: Page) {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.move(Math.floor(viewport.width / 2), 12);
  const header = page.getByRole('group', { name: 'Header Bar' });
  await expect(header).toBeVisible({ timeout: 10_000 });
  return header;
}

async function expectCatalogBookCleanup(syncResponse: Response | null, bookHash: string) {
  expect(syncResponse, 'DELETE should enqueue a canonical sync push').not.toBeNull();
  expect(syncResponse!.status()).toBe(200);

  const syncBody = (await syncResponse!.json()) as { accepted?: Array<Record<string, unknown>> };
  expect(syncBody.accepted ?? []).toContainEqual(
    expect.objectContaining({ entity: 'book', entityId: bookHash }),
  );
}

async function teardownAcceptedCatalogAdd(
  page: Page,
  addRequestId: string | null,
  terminalDeadline: number,
  bookHash: string,
): Promise<void> {
  const remainingTerminalMs = Math.max(0, terminalDeadline - Date.now());
  const terminalState = addRequestId
    ? await waitForCatalogAddTerminal(page, addRequestId, remainingTerminalMs)
    : null;
  const cleanupResponse = await removeLibraryBookByHashIfPresent(
    page,
    bookHash,
    undefined,
    addRequestId ? CATALOG_ADD_CLEANUP_VISIBILITY_MS : Math.max(1, remainingTerminalMs),
  );

  if (terminalState === 'failed') {
    if (!cleanupResponse) return;
    await expectCatalogBookCleanup(cleanupResponse, bookHash);
    throw new Error('CATALOG_ADD_FAILED_WITH_OWNERSHIP');
  }
  if (!cleanupResponse) throw new Error('CATALOG_ADD_CLEANUP_UNPROVEN');

  await expectCatalogBookCleanup(cleanupResponse, bookHash);
  if (terminalState === 'timed_out') {
    throw new Error('CATALOG_ADD_TERMINAL_TIMEOUT_AFTER_CLEANUP');
  }
}

async function attachRedactedPageScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({
    path: screenshotPath,
    mask: [page.getByRole('button', { name: 'Profile menu' })],
  });
  await testInfo.attach(name, {
    path: screenshotPath,
    contentType: 'image/png',
  });
}

function sanitizedFinalizationError(error: unknown) {
  const rawName = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  const name = /^(Error|TimeoutError)$/.test(rawName) ? rawName : 'Error';
  const code =
    message.length <= 96 && /^CATALOG_ADD_[A-Z0-9_]+$/.test(message)
      ? message
      : 'CATALOG_ADD_FINALIZATION_ERROR';
  return { name, code };
}

async function runWithBudget(
  action: () => Promise<void>,
  timeoutMs: number,
  onTimeout?: () => Promise<void>,
): Promise<void> {
  const budgetMs = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : 0;
  if (budgetMs === 0) {
    if (onTimeout) void onTimeout().catch(() => undefined);
    throw new Error('CATALOG_ADD_FINALIZATION_BUDGET_EXCEEDED');
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      action(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('CATALOG_ADD_FINALIZATION_BUDGET_EXCEEDED'));
          if (onTimeout) void onTimeout().catch(() => undefined);
        }, budgetMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function finalizeCatalogProof(input: {
  primaryError: unknown;
  attachEvidence: () => Promise<void>;
  evidenceBudgetMs: number;
  cleanup?: () => Promise<void>;
  cleanupDeadline: number;
  onCleanupTimeout?: () => Promise<void>;
  attachFinalizationError?: (error: ReturnType<typeof sanitizedFinalizationError>) => Promise<void>;
}): Promise<void> {
  let finalizationError: unknown = null;
  try {
    await runWithBudget(input.attachEvidence, input.evidenceBudgetMs);
  } catch (error) {
    finalizationError = error;
  }

  if (input.cleanup) {
    try {
      await runWithBudget(
        input.cleanup,
        input.cleanupDeadline - Date.now(),
        input.onCleanupTimeout,
      );
    } catch (error) {
      finalizationError ??= error;
    }
  }

  if (finalizationError && input.attachFinalizationError) {
    try {
      await runWithBudget(
        () => input.attachFinalizationError!(sanitizedFinalizationError(finalizationError)),
        input.evidenceBudgetMs,
      );
    } catch {
      // The primary/finalization error remains authoritative when evidence I/O stalls.
    }
  }
  if (input.primaryError) throw input.primaryError;
  if (finalizationError) throw finalizationError;
}

test.describe('Chromium Explore catalog', () => {
  test.describe.configure({
    timeout: finalProofMode ? CATALOG_ADD_TEST_TIMEOUT_MS : 180_000,
  });
  test('target card selection narrows valid duplicate rail instances deterministically', async ({
    page,
  }) => {
    const catalogBookId = '11111111-1111-4111-8111-111111111111';
    await page.setContent(`
      <div data-testid="explore-rails">
        <section data-testid="collection-row-trending" hidden>
          <button data-testid="card-tap-${catalogBookId}">Trending target</button>
        </section>
        <section data-testid="collection-row-recently-added">
          <button data-testid="card-tap-${catalogBookId}">Recently added target</button>
        </section>
        <section data-testid="collection-row-open-textbooks">
          <button data-testid="card-tap-${catalogBookId}">Open textbooks target</button>
        </section>
      </div>
    `);

    await expect(page.getByTestId(`card-tap-${catalogBookId}`)).toHaveCount(3);
    await expect(page.getByText('Trending target')).toBeHidden();
    await expect(await firstCatalogCard(page, catalogBookId, 500)).toHaveText(
      'Recently added target',
    );
  });

  test('target card selection fails closed when the exact target is missing', async ({ page }) => {
    const catalogBookId = '11111111-1111-4111-8111-111111111111';
    await page.setContent(`
      <div data-testid="explore-rails">
        <button data-testid="card-tap-22222222-2222-4222-8222-222222222222">
          Different catalog book
        </button>
      </div>
    `);

    await expect(firstCatalogCard(page, catalogBookId, 100)).rejects.toThrow();
  });

  test('available final-proof admission preserves unrelated library references', async ({
    page,
  }) => {
    const catalogBookId = '11111111-1111-4111-8111-111111111111';
    const preAddDeletions: SanitizedNetworkRequest[] = [];
    page.on('request', (request) => {
      if (isPreAddDeletionRequest(request)) preAddDeletions.push(sanitizedNetworkRequest(request));
    });
    await page.setContent(`
      <a data-testid="unrelated-library-reference">Unrelated book</a>
      <div data-testid="book-detail-sheet">
        <button
          data-testid="sheet-import-btn"
          data-catalog-book-id="${catalogBookId}"
          data-import-state="idle"
          data-import-ready="true"
          data-add-mode="server"
        >Add to Library</button>
      </div>
    `);

    const button = await finalProofImportButton(
      page.getByTestId('book-detail-sheet'),
      catalogBookId,
      500,
    );

    await expect(button).toHaveText('Add to Library');
    await expect(page.getByTestId('unrelated-library-reference')).toBeVisible();
    expect(preAddDeletions).toEqual([]);
  });

  test('unavailable final-proof admission fails before Add without deletion', async ({ page }) => {
    const catalogBookId = '11111111-1111-4111-8111-111111111111';
    const preAddDeletions: SanitizedNetworkRequest[] = [];
    page.on('request', (request) => {
      if (isPreAddDeletionRequest(request)) preAddDeletions.push(sanitizedNetworkRequest(request));
    });
    await page.setContent(`
      <a data-testid="unrelated-library-reference">Unrelated book</a>
      <div data-testid="book-detail-sheet">
        <button
          data-testid="sheet-import-btn"
          data-catalog-book-id="${catalogBookId}"
          data-import-state="idle"
          data-import-ready="false"
          data-import-blocked-reason="library_full"
          disabled
        >Add to Library</button>
      </div>
    `);

    await expect(
      finalProofImportButton(page.getByTestId('book-detail-sheet'), catalogBookId, 500),
    ).rejects.toThrow('CATALOG_ADD_PREFLIGHT_BLOCKED:library_full');
    await expect(page.getByTestId('unrelated-library-reference')).toBeVisible();
    expect(preAddDeletions).toEqual([]);
  });

  test('target collision fails before Add without deleting the existing reference', async ({
    page,
  }) => {
    const catalogBookId = '11111111-1111-4111-8111-111111111111';
    const preAddDeletions: SanitizedNetworkRequest[] = [];
    page.on('request', (request) => {
      if (isPreAddDeletionRequest(request)) preAddDeletions.push(sanitizedNetworkRequest(request));
    });
    await page.setContent(`
      <a data-testid="unrelated-library-reference">Unrelated book</a>
      <div data-testid="book-detail-sheet">
        <button data-testid="sheet-read-btn">Start Reading</button>
      </div>
    `);

    await expect(
      finalProofImportButton(page.getByTestId('book-detail-sheet'), catalogBookId, 500),
    ).rejects.toThrow('CATALOG_ADD_TARGET_COLLISION');
    await expect(page.getByTestId('unrelated-library-reference')).toBeVisible();
    expect(preAddDeletions).toEqual([]);
  });

  test('pre-acceptance destructive traffic fails proof with exact-hash cleanup armed', async ({
    page,
  }) => {
    const catalogBookId = '11111111-1111-4111-8111-111111111111';
    const preAddDeletions: SanitizedNetworkRequest[] = [];
    let cleanupBookHash = '';
    let cleanedBookHash = '';
    let primaryError: unknown = null;

    page.on('request', (request) => {
      if (!cleanupBookHash && isPreAddDeletionRequest(request)) {
        preAddDeletions.push(sanitizedNetworkRequest(request));
      }
      cleanupBookHash ||= catalogAddBookHashFromRequest(request, catalogBookId) ?? '';
    });
    await page.route('**/api/**', (route) => route.abort());
    await page.setContent(`
      <base href="http://openread.test/">
      <button id="add" onclick="
        fetch('/api/library/books/unrelated', { method: 'DELETE' })
          .finally(() => fetch('/api/catalog/books/${catalogBookId}/import', { method: 'POST' }));
      ">Add</button>
    `);

    await page.locator('#add').click();
    await expect.poll(() => cleanupBookHash).toBe(`catalog:${catalogBookId}`);
    try {
      assertNoPreAddDeletionRequests(preAddDeletions);
    } catch (error) {
      primaryError = error;
    }
    expect(primaryError).toBeInstanceOf(Error);

    await expect(
      finalizeCatalogProof({
        primaryError,
        attachEvidence: async () => undefined,
        evidenceBudgetMs: 100,
        cleanup: async () => {
          cleanedBookHash = cleanupBookHash;
        },
        cleanupDeadline: Date.now() + 500,
      }),
    ).rejects.toBe(primaryError);
    expect(cleanedBookHash).toBe(`catalog:${catalogBookId}`);
  });

  test('forced final-proof failure preserves primary error and bounded evidence', async ({
    page,
  }, testInfo) => {
    const primaryError = new Error('FORCED_PRIMARY_FAILURE');
    let cleanupTimedOut = false;
    const startedAt = Date.now();

    await expect(
      finalizeCatalogProof({
        primaryError,
        attachEvidence: () =>
          testInfo.attach('catalog-network-evidence', {
            body: Buffer.from(JSON.stringify({ schemaVersion: 1, requests: [] })),
            contentType: 'application/json',
          }),
        evidenceBudgetMs: 50,
        cleanup: () => new Promise<void>(() => undefined),
        cleanupDeadline: Date.now() + 50,
        onCleanupTimeout: async () => {
          cleanupTimedOut = true;
        },
        attachFinalizationError: (error) =>
          testInfo.attach('catalog-finalization-evidence', {
            body: Buffer.from(JSON.stringify(error)),
            contentType: 'application/json',
          }),
      }),
    ).rejects.toBe(primaryError);

    expect(cleanupTimedOut).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(testInfo.attachments.map((attachment) => attachment.name)).toEqual(
      expect.arrayContaining(['catalog-network-evidence', 'catalog-finalization-evidence']),
    );
    await expect(page.locator('body')).toBeVisible();
  });

  test('evidence attachment hangs cannot mask the primary error or skip cleanup', async ({
    page,
  }) => {
    const primaryError = new Error('FORCED_PRIMARY_FAILURE');
    let cleanupAttempted = false;
    const startedAt = Date.now();

    await expect(
      finalizeCatalogProof({
        primaryError,
        attachEvidence: () => new Promise<void>(() => undefined),
        evidenceBudgetMs: 25,
        cleanup: async () => {
          cleanupAttempted = true;
        },
        cleanupDeadline: Date.now() + 500,
        attachFinalizationError: () => new Promise<void>(() => undefined),
      }),
    ).rejects.toBe(primaryError);

    expect(cleanupAttempted).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(
      sanitizedFinalizationError(
        Object.assign(new Error('SECRET_TOKEN_ABC123'), { name: 'SECRET_NAME_ABC123' }),
      ),
    ).toEqual({ name: 'Error', code: 'CATALOG_ADD_FINALIZATION_ERROR' });
    expect(sanitizedFinalizationError(new Error('CATALOG_ADD_CLEANUP_UNPROVEN'))).toEqual({
      name: 'Error',
      code: 'CATALOG_ADD_CLEANUP_UNPROVEN',
    });
    await expect(page.locator('body')).toBeVisible();
  });

  test('sidebar Explore route is primary and active from Home', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/home', { waitUntil: 'domcontentloaded' });

    const sidebar = page.getByRole('navigation', { name: 'Platform Sidebar' });
    const exploreLink = sidebar.getByRole('link', { name: 'Explore' });
    await expect(exploreLink).toBeVisible({ timeout: 30_000 });

    await exploreLink.click();
    await expect(page).toHaveURL(/\/explore\/?$/);
    await expect(exploreLink).toHaveClass(/bg-base-300/);
    await expect(page.getByPlaceholder('Books, authors, subjects...')).toBeVisible({
      timeout: 30_000,
    });
  });

  test('direct Explore page loads live catalog discovery controls', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/explore', { waitUntil: 'domcontentloaded' });

    await expect(page.getByPlaceholder('Books, authors, subjects...')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('category-pills')).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Book categories' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Computer Science' })).toBeVisible();
    await expect(page.getByTestId('explore-rails')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid^="card-tap-"]').first()).toBeVisible({
      timeout: 45_000,
    });
  });

  test('explore search accepts query and can clear it', async ({ authenticatedPage: page }) => {
    await page.goto('/explore', { waitUntil: 'domcontentloaded' });

    const search = page.getByPlaceholder('Books, authors, subjects...');
    await expect(search).toBeVisible({ timeout: 30_000 });
    await search.fill('python');
    await expect(search).toHaveValue('python');
    await expect(page.getByTestId('search-results-grid')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid^="card-tap-"]').first()).toBeVisible({
      timeout: 45_000,
    });

    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(search).toHaveValue('');
    await expect(page.getByTestId('explore-rails')).toBeVisible({ timeout: 30_000 });
  });

  test('category and subcategory filters expose selected states', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/explore', { waitUntil: 'domcontentloaded' });

    const categoryTabs = page.getByRole('tablist', { name: 'Book categories' });
    await expect(categoryTabs).toBeVisible({ timeout: 30_000 });

    await categoryTabs.getByRole('tab', { name: 'All' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(categoryTabs.getByRole('tab', { name: 'Engineering' })).toBeFocused();

    const computerScienceTab = categoryTabs.getByRole('tab', {
      name: 'Computer Science',
      exact: true,
    });
    await computerScienceTab.click();
    await expect(computerScienceTab).toHaveAttribute('aria-selected', 'true');

    const subcategoryTabs = page.getByTestId('subcategory-pills');
    await expect(subcategoryTabs).toBeVisible({ timeout: 10_000 });
    await expect(
      subcategoryTabs.getByRole('tab', { name: 'All Computer Science', exact: true }),
    ).toBeVisible();

    const pythonTab = subcategoryTabs.getByRole('tab', { name: 'Python', exact: true });
    await pythonTab.click();
    await expect(pythonTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('search-results-grid')).toBeVisible({ timeout: 30_000 });
  });

  test.describe('live catalog import lifecycle', () => {
    test.describe.configure({ timeout: CATALOG_ADD_TEST_TIMEOUT_MS });

    test('imports a live catalog book, opens it from library, and cleans it up', async ({
      authenticatedPage: page,
    }, testInfo) => {
      const preflightDeadline = Date.now() + CATALOG_ADD_PREFLIGHT_BUDGET_MS;
      const upstreamRequests: SanitizedNetworkRequest[] = [];
      const readerR2Requests: SanitizedNetworkRequest[] = [];
      const privateStagingRequests: SanitizedNetworkRequest[] = [];
      const preAddDeletionRequests: SanitizedNetworkRequest[] = [];
      let addRequestObserved = false;
      let selectedCatalogBookId = '';
      let captureReaderNetwork = false;
      let expectedOwnedDownload: SanitizedNetworkTarget | null = null;
      let acceptedImportStatus: number | null = null;
      let acceptedImportState: string | null = null;
      let acceptedAddRequestId: string | null = null;
      let acceptedAddTerminalDeadline: number | null = null;
      page.on('request', (request) => {
        if (!addRequestObserved && isPreAddDeletionRequest(request)) {
          preAddDeletionRequests.push(sanitizedNetworkRequest(request));
        }
        if (finalProofMode) {
          const url = new URL(request.url());
          const evidence = sanitizedNetworkRequest(request);
          if (isCatalogUpstreamHost(url.hostname)) upstreamRequests.push(evidence);
          if (
            url.pathname.includes('/temp/catalog-materialization/') ||
            url.pathname.toLowerCase().includes('/temp%2fcatalog-materialization%2f')
          ) {
            privateStagingRequests.push(evidence);
          }
          if (captureReaderNetwork && isR2Host(url.hostname)) readerR2Requests.push(evidence);
        }
      });
      let importedBookHash = '';
      let finalImportedTitle = '';
      let primaryError: unknown = null;
      try {
        await installE2ERateLimitIsolation(page, testInfo);
        skipIfTierConfigBlocked(await gotoExploreWithAddPrereqs(page), testInfo);

        const sheet = await openFirstCatalogBook(page);
        finalImportedTitle = (await sheet.getByTestId('sheet-title').innerText()).trim();
        expect(finalImportedTitle).toBeTruthy();
        selectedCatalogBookId = new URL(page.url()).searchParams.get('book') ?? '';
        expect(selectedCatalogBookId).toMatch(/^[0-9a-f-]{36}$/i);
        if (finalProofMode) expect(selectedCatalogBookId).toBe(finalProofCatalogBookId());
        expect(preAddDeletionRequests).toEqual([]);
        const importButton = await finalProofImportButton(sheet, selectedCatalogBookId);
        await expect(importButton).toHaveAttribute('data-add-mode', 'server');

        const legacyImportRequests: string[] = [];
        const importIntentRequests: string[] = [];
        page.on('request', (request) => {
          const path = new URL(request.url()).pathname;
          if (request.method() === 'POST' && path.endsWith('/api/catalog/ia/import')) {
            legacyImportRequests.push(path);
          }
          const emittedBookHash = catalogAddBookHashFromRequest(request, selectedCatalogBookId);
          if (emittedBookHash) {
            importIntentRequests.push(path);
            if (!addRequestObserved) {
              addRequestObserved = true;
              importedBookHash = emittedBookHash;
              acceptedAddTerminalDeadline = Date.now() + CATALOG_ADD_TERMINAL_BUDGET_MS;
            }
          }
        });

        await importButton.scrollIntoViewIfNeeded();
        const buttonTarget = await describeButtonTarget(importButton);
        if (Date.now() > preflightDeadline) {
          throw new Error('CATALOG_ADD_PREFLIGHT_BUDGET_EXCEEDED');
        }

        const importResponsePromise = page
          .waitForResponse(
            (response) =>
              catalogAddBookHashFromRequest(response.request(), selectedCatalogBookId) !== null,
            { timeout: CATALOG_ADD_ACCEPTANCE_BUDGET_MS },
          )
          .then((response) => ({ kind: 'response' as const, response }))
          .catch(() => ({ kind: 'no_response' as const }));
        const blockedToastPromise = page
          .getByRole('alert')
          .filter({ hasText: /Library full|Upgrade|Sign in|not authenticated/i })
          .textContent({ timeout: CATALOG_ADD_ACCEPTANCE_BUDGET_MS })
          .then((message) => ({ kind: 'blocked' as const, message: message?.trim() ?? '' }));

        assertNoPreAddDeletionRequests(preAddDeletionRequests);
        await importButton.click();
        const importOutcome = await Promise.race([importResponsePromise, blockedToastPromise]);
        assertNoPreAddDeletionRequests(preAddDeletionRequests);
        if (importOutcome.kind === 'blocked') {
          blockOrFailFinalProof(
            testInfo,
            `Catalog Add blocked before import: ${importOutcome.message}`,
          );
        }
        if (importOutcome.kind === 'no_response') {
          blockOrFailFinalProof(
            testInfo,
            `Catalog Add did not emit import within 30s after click. button=${JSON.stringify(buttonTarget)}; importIntentRequests=${importIntentRequests.length}`,
          );
        }
        const importResponse = importOutcome.response;
        if (!importResponse.ok()) {
          const retryAfter = importResponse.headers()['retry-after'] ?? 'absent';
          const rateLimitReset =
            importResponse.headers()['ratelimit-reset'] ??
            importResponse.headers()['x-ratelimit-reset'] ??
            'absent';
          blockOrFailFinalProof(
            testInfo,
            `Live catalog import endpoint returned ${importResponse.status()} for ${finalImportedTitle}; retry-after=${retryAfter}; rate-limit-reset=${rateLimitReset}; success-path assertion requires backend fixture/stability.`,
          );
        }

        acceptedImportStatus = importResponse.status();
        expect(addRequestObserved).toBe(true);
        expect(acceptedAddTerminalDeadline).not.toBeNull();

        const importPayload = (await importResponse.json()) as Record<string, unknown>;
        expect(importPayload.catalogBookId).toBe(selectedCatalogBookId);
        acceptedAddRequestId =
          typeof importPayload.addRequestId === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            importPayload.addRequestId,
          )
            ? importPayload.addRequestId
            : null;
        expect(acceptedAddRequestId).not.toBeNull();
        acceptedImportState = String(importPayload.state);
        expect(acceptedImportState).toMatch(/^(preparing|ready)$/);
        expect(acceptedImportStatus).toBe(acceptedImportState === 'preparing' ? 202 : 200);
        expect(importIntentRequests).toEqual([
          `/api/catalog/books/${selectedCatalogBookId}/import`,
        ]);
        expect(legacyImportRequests).toEqual([]);
        expect(importedBookHash).toMatch(/^catalog:[0-9a-f-]{36}$/i);

        // The import response only proves the backend accepted the Add request.
        // For cached catalog books, the canonical product success signal is the sheet
        // transitioning to ready after `useCatalogImport` pulls books and observes the
        // returned `bookHash` in the Library store. Do not navigate away before that
        // signal, or the harness can race the post-intent Library sync.
        await expect(sheet.getByTestId('sheet-read-btn')).toBeVisible({ timeout: 90_000 });

        await page.goto('/library', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('heading', { name: 'All Books' })).toBeVisible({
          timeout: 30_000,
        });
        await page.getByTestId('search-input').fill(finalImportedTitle);
        const importedBook = libraryBookLinkByHash(page, importedBookHash);
        await expect(importedBook).toBeVisible({ timeout: 90_000 });

        const importedCard = page.locator('div.group').filter({ has: importedBook }).first();
        await expect(importedCard).toBeVisible({ timeout: 30_000 });

        await attachRedactedPageScreenshot(page, testInfo, 'library-import-visible');

        const downloadResponsePromise = finalProofMode
          ? page.waitForResponse(
              (response) =>
                response.request().method() === 'POST' &&
                new URL(response.url()).pathname.endsWith('/api/catalog/books/download-url'),
              { timeout: 60_000 },
            )
          : null;
        captureReaderNetwork = finalProofMode;
        await importedBook.click();
        if (downloadResponsePromise) {
          const downloadResponse = await downloadResponsePromise;
          expect(downloadResponse.status()).toBe(200);
          const downloadPayload = (await downloadResponse.json()) as Record<string, unknown>;
          expect(downloadPayload.status).toBe('ready');
          expect(typeof downloadPayload.downloadUrl).toBe('string');
          expectedOwnedDownload = sanitizedNetworkTarget(String(downloadPayload.downloadUrl));
        }

        const reader = new ReaderPage(page);
        await reader.waitForReaderUrl();
        await expect(reader.inlineQuestionBar()).toBeVisible({ timeout: 60_000 });
        await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible({
          timeout: 60_000,
        });
        if (finalProofMode) {
          expect(upstreamRequests).toEqual([]);
          expect(privateStagingRequests).toEqual([]);
          expect(expectedOwnedDownload).not.toBeNull();
          expect(readerR2Requests.length).toBeGreaterThan(0);
          expect(
            readerR2Requests.every(
              (request) =>
                expectedOwnedDownload && sameNetworkTarget(request, expectedOwnedDownload),
            ),
          ).toBe(true);
        }
        captureReaderNetwork = false;
        await attachRedactedPageScreenshot(page, testInfo, 'library-import-reader-open');

        const header = await revealHeader(page);
        await header
          .getByRole('button', { name: /Back to Library|Close/ })
          .first()
          .click();
        await page.waitForURL((url) => url.pathname === '/library', { timeout: 30_000 });

        const cleanupResponse = await removeLibraryBookByHashIfPresent(page, importedBookHash);
        await expectCatalogBookCleanup(cleanupResponse, importedBookHash);
        addRequestObserved = false;

        await attachRedactedPageScreenshot(page, testInfo, 'library-import-cleanup-complete');
      } catch (error) {
        primaryError = error;
      }

      captureReaderNetwork = false;
      await finalizeCatalogProof({
        primaryError,
        attachEvidence: async () => {
          if (!finalProofMode) return;
          await testInfo.attach('catalog-network-evidence', {
            body: Buffer.from(
              JSON.stringify(
                {
                  schemaVersion: 1,
                  import: {
                    status: acceptedImportStatus,
                    state: acceptedImportState,
                  },
                  selectedBookHash: importedBookHash || null,
                  policy: 'api-authorized-owned-download-origin-path',
                  expectedOwnedDownload,
                  preAddDeletionRequests,
                  upstreamRequests,
                  privateStagingRequests,
                  readerR2Requests,
                },
                null,
                2,
              ),
            ),
            contentType: 'application/json',
          });
        },
        evidenceBudgetMs: CATALOG_ADD_EVIDENCE_BUDGET_MS,
        cleanup:
          addRequestObserved && importedBookHash
            ? async () => {
                if (!acceptedAddTerminalDeadline) {
                  throw new Error('CATALOG_ADD_TERMINAL_DEADLINE_MISSING');
                }
                await teardownAcceptedCatalogAdd(
                  page,
                  acceptedAddRequestId,
                  acceptedAddTerminalDeadline,
                  importedBookHash,
                );
              }
            : undefined,
        cleanupDeadline:
          (acceptedAddTerminalDeadline ?? Date.now()) + CATALOG_ADD_CLEANUP_BUDGET_MS,
        onCleanupTimeout: async () => {
          if (!page.isClosed()) await page.close({ runBeforeUnload: false }).catch(() => undefined);
        },
        attachFinalizationError: finalProofMode
          ? (error) =>
              testInfo.attach('catalog-finalization-evidence', {
                body: Buffer.from(JSON.stringify(error, null, 2)),
                contentType: 'application/json',
              })
          : undefined,
      });
    });
  });

  test('detail sheet opens from a live catalog card and closes with Escape', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/explore', { waitUntil: 'domcontentloaded' });

    const sheet = await openFirstCatalogBook(page);
    await expect(page).toHaveURL(/\/explore\?book=.+/);

    await expect(sheet.getByTestId('sheet-title')).not.toHaveText('');
    await expect(sheet.getByTestId('sheet-author')).not.toHaveText('');
    await expect(sheet.getByTestId('metadata-format')).toBeVisible();
    await expect(sheet.getByTestId('metadata-source')).toBeVisible();
    await expect(sheet.getByTestId('sheet-actions')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/explore\/?$/);
  });
});
