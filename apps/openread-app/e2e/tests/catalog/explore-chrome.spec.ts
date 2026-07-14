import type { Locator, Page, Response, TestInfo } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { ReaderPage } from '../../pages/ReaderPage';

const finalProofMode = process.env['OPENREAD_E2E_CATALOG_FINAL_PROOF'] === '1';
const configuredCatalogBookId = process.env['OPENREAD_E2E_CATALOG_BOOK_ID'];

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

async function firstCatalogCard(page: Page): Promise<Locator> {
  await expect(page.getByTestId('explore-rails')).toBeVisible({ timeout: 30_000 });
  const catalogBookId = finalProofCatalogBookId();
  const card = catalogBookId
    ? page.getByTestId(`card-tap-${catalogBookId}`)
    : page.locator('[data-testid^="card-tap-"]').first();
  await expect(card).toBeVisible({ timeout: 45_000 });
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function libraryBookLinkByTitle(page: Page, title: string) {
  return page.getByRole('link', { name: new RegExp(`Open ${escapeRegex(title)} by`, 'i') }).first();
}

async function removeVisibleLibraryBook(page: Page, bookLink: Locator): Promise<void> {
  const href = (await bookLink.getAttribute('href')) ?? '';
  const removedLink = href
    ? page.locator(`a[href="${escapeCssAttributeValue(href)}"]`).first()
    : bookLink;
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
  await expect(removedLink).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText('Syncing your library...')).toBeHidden({ timeout: 30_000 });
  await syncPushPromise;
}

async function removeLibraryBooksByTitleIfPresent(
  page: Page,
  title: string,
  maxRemovals = 5,
): Promise<number> {
  let removed = 0;
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'All Books' })).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('search-input').fill(title);

  for (let attempt = 0; attempt < maxRemovals; attempt += 1) {
    const bookLink = libraryBookLinkByTitle(page, title);
    if (!(await bookLink.isVisible({ timeout: 5_000 }).catch(() => false))) break;
    await removeVisibleLibraryBook(page, bookLink);
    removed += 1;
  }

  return removed;
}

async function removeLibraryBooksUntilRoom(
  page: Page,
  targetVisibleCount = 2,
  maxRemovals = 50,
): Promise<number> {
  let removed = 0;
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'All Books' })).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('search-input').fill('');

  const bookLinks = page.locator('a[aria-label^="Open "]');
  for (let attempt = 0; attempt < maxRemovals; attempt += 1) {
    const visibleCount = await bookLinks.count();
    if (visibleCount < targetVisibleCount) break;

    const bookLink = bookLinks.first();
    if (!(await bookLink.isVisible({ timeout: 5_000 }).catch(() => false))) break;
    await removeVisibleLibraryBook(page, bookLink);
    removed += 1;
  }

  return removed;
}

async function removeLibraryBookByHashIfPresent(
  page: Page,
  bookHash: string,
  title?: string,
): Promise<Response | null> {
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'All Books' })).toBeVisible({ timeout: 30_000 });
  if (title) await page.getByTestId('search-input').fill(title);

  const bookLink = libraryBookLinkByHash(page, bookHash);
  if (!(await bookLink.isVisible({ timeout: 10_000 }).catch(() => false))) return null;

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

test.describe('Chromium Explore catalog', () => {
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

  test('imports a live catalog book, opens it from library, and cleans it up', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const browserOapenRequests: string[] = [];
    if (finalProofMode) {
      page.on('request', (request) => {
        if (new URL(request.url()).hostname.toLowerCase() === 'library.oapen.org') {
          browserOapenRequests.push(request.url());
        }
      });
    }
    await installE2ERateLimitIsolation(page, testInfo);
    skipIfTierConfigBlocked(await gotoExploreWithAddPrereqs(page), testInfo);

    let sheet = await openFirstCatalogBook(page);
    const importedTitle = (await sheet.getByTestId('sheet-title').innerText()).trim();
    expect(importedTitle).toBeTruthy();

    await removeLibraryBooksByTitleIfPresent(page, importedTitle);
    await removeLibraryBooksUntilRoom(page);
    skipIfTierConfigBlocked(await gotoExploreWithAddPrereqs(page), testInfo);
    sheet = await openFirstCatalogBook(page);
    const finalImportedTitle = (await sheet.getByTestId('sheet-title').innerText()).trim();
    const selectedCatalogBookId = new URL(page.url()).searchParams.get('book') ?? '';
    expect(selectedCatalogBookId).toMatch(/^[0-9a-f-]{36}$/i);
    if (finalProofMode) expect(selectedCatalogBookId).toBe(finalProofCatalogBookId());
    const importButton = sheet.locator(
      `[data-testid="sheet-import-btn"][data-catalog-book-id="${escapeCssAttributeValue(
        selectedCatalogBookId,
      )}"][data-import-state="idle"]`,
    );
    await expect(importButton).toBeVisible({ timeout: 30_000 });
    await expect(importButton).toHaveAttribute('data-add-mode', 'server');

    const preClickButtonTarget = await describeButtonTarget(importButton);
    if (preClickButtonTarget.importReady !== 'true' || preClickButtonTarget.disabled) {
      blockOrFailFinalProof(
        testInfo,
        `Catalog Add guard not ready before click. button=${JSON.stringify(preClickButtonTarget)}`,
      );
    }

    let imported = false;
    let cleanupComplete = false;
    let importedBookHash = '';
    try {
      const legacyImportRequests: string[] = [];
      const importIntentRequests: string[] = [];
      page.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        if (
          request.method() === 'POST' &&
          (/\/api\/catalog\/books\/[^/]+\/import$/.test(path) ||
            path.endsWith('/api/catalog/ia/import'))
        ) {
          legacyImportRequests.push(path);
        }
        if (request.method() === 'POST' && /\/api\/catalog\/books\/[^/]+\/import$/.test(path)) {
          importIntentRequests.push(path);
        }
      });

      const importResponsePromise = page
        .waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            /\/api\/catalog\/books\/[^/]+\/import$/.test(new URL(response.url()).pathname),
          { timeout: 30_000 },
        )
        .then((response) => ({ kind: 'response' as const, response }))
        .catch(() => ({ kind: 'no_response' as const }));
      const blockedToastPromise = page
        .getByRole('alert')
        .filter({ hasText: /Library full|Upgrade|Sign in|not authenticated/i })
        .textContent({ timeout: 30_000 })
        .then((message) => ({ kind: 'blocked' as const, message: message?.trim() ?? '' }));

      await importButton.scrollIntoViewIfNeeded();
      const buttonTarget = await describeButtonTarget(importButton);
      await importButton.click();
      const importOutcome = await Promise.race([importResponsePromise, blockedToastPromise]);
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

      const importPayload = (await importResponse.json()) as Record<string, unknown>;
      expect(importPayload.catalogBookId).toBe(selectedCatalogBookId);
      expect(importPayload.addRequestId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(importPayload.state).toMatch(/^(preparing|ready)$/);
      expect(legacyImportRequests).toEqual([]);
      importedBookHash = `catalog:${selectedCatalogBookId}`;
      expect(importedBookHash).toMatch(/^catalog:[0-9a-f-]{36}$/i);

      imported = true;

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

      await importedBook.click();
      const reader = new ReaderPage(page);
      await reader.waitForReaderUrl();
      await expect(reader.inlineQuestionBar()).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible({
        timeout: 60_000,
      });
      if (finalProofMode) expect(browserOapenRequests).toEqual([]);
      await attachRedactedPageScreenshot(page, testInfo, 'library-import-reader-open');

      const header = await revealHeader(page);
      await header
        .getByRole('button', { name: /Back to Library|Close/ })
        .first()
        .click();
      await page.waitForURL((url) => url.pathname === '/library', { timeout: 30_000 });

      const cleanupResponse = await removeLibraryBookByHashIfPresent(page, importedBookHash);
      await expectCatalogBookCleanup(cleanupResponse, importedBookHash);
      cleanupComplete = true;
      imported = false;

      await attachRedactedPageScreenshot(page, testInfo, 'library-import-cleanup-complete');
    } finally {
      if (imported && !cleanupComplete && importedBookHash) {
        await removeLibraryBookByHashIfPresent(page, importedBookHash, finalImportedTitle);
      }
    }
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
