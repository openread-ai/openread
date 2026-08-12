import { expect, test } from '@playwright/test';
import { createLiveAccountLifecycle } from './account-lifecycle/runtime.mjs';

const CATALOG_BOOK_ID = '477d4044-19c3-453c-98dd-652f98669d23';
const CATALOG_TITLE = 'The Story of the Amulet';
const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

if (process.env.OPENREAD_E2E_CATALOG_LIFECYCLE_LIVE !== '1') {
  throw new Error(
    'Catalog import lifecycle is disabled; set OPENREAD_E2E_CATALOG_LIFECYCLE_LIVE=1 for an explicitly authorized live run',
  );
}

const stateResidue = (state) => ({
  auth: state.auth,
  database: state.database
    .filter(({ count }) => count > 0)
    .map(({ table, count }) => ({ table, count })),
  objects: state.objects,
});
const hasStateResidue = (state) =>
  state.auth.exists || state.database.some(({ count }) => count > 0) || state.objects.length > 0;
const combineFailures = (primary, secondary, message) =>
  primary ? new AggregateError([primary, secondary], message) : secondary;

async function signIn(page, account) {
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/get-started', { timeout: 30_000 });
}

async function importCatalogBook(page) {
  await page.goto('/explore', { waitUntil: 'domcontentloaded' });
  const search = page.getByPlaceholder('Books, authors, subjects...');
  await expect(search).toBeVisible({ timeout: 30_000 });
  await search.fill(CATALOG_TITLE);
  await expect(page.getByTestId('search-results-grid')).toBeVisible({ timeout: 60_000 });
  const card = page.getByTestId(`card-tap-${CATALOG_BOOK_ID}`).filter({ visible: true }).first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.click();

  const sheet = page.getByTestId('book-detail-sheet');
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await expect(sheet.getByTestId('sheet-title')).toHaveText(CATALOG_TITLE, { timeout: 30_000 });
  const importButton = sheet.getByTestId('sheet-import-btn');
  await expect(importButton).toBeVisible({ timeout: 30_000 });
  const importPath = `/api/catalog/books/${CATALOG_BOOK_ID}/import`;
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === importPath,
    { timeout: 30_000 },
  );
  await importButton.click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.catalogBookId).toBe(CATALOG_BOOK_ID);
  await expect(sheet.getByTestId('sheet-read-btn')).toBeVisible({ timeout: 120_000 });
}

async function proveLibraryCoverAndContent(page) {
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'All Books' })).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('search-input').fill(CATALOG_TITLE);
  const bookLink = page.getByRole('link', { name: new RegExp(`^Open ${CATALOG_TITLE} by `) });
  await expect(bookLink).toBeVisible({ timeout: 90_000 });

  const card = page.locator('div.group').filter({ has: bookLink }).first();
  const cover = card.locator('img.cover-image').first();
  await expect(cover).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => cover.evaluate((image) => image.complete && image.naturalWidth > 0), {
      timeout: 30_000,
    })
    .toBe(true);
  await expect(card.locator('.book-cover-container').locator('span')).toHaveCount(0);

  await bookLink.click();
  await page.waitForURL((url) => url.pathname === '/reader', { timeout: 60_000 });
  await expect(page.getByTestId('reader-content-ready')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible({
    timeout: 60_000,
  });
}

async function deleteThroughProduct(page, account, lifecycle) {
  return lifecycle.finalize(account, async () => {
    await page.goto('/settings/account', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Delete Account', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        new URL(response.url()).pathname.endsWith('/user/delete'),
      { timeout: 60_000 },
    );
    await dialog.getByRole('button', { name: 'Delete Account', exact: true }).click();
    expect((await responsePromise).status()).toBe(200);
    await page.waitForURL((url) => url.pathname === '/auth', { timeout: 30_000 });
  });
}

test('Catalog lifecycle: imports a real covered book and deletes all owned state', async ({
  page,
}, testInfo) => {
  test.setTimeout(420_000);
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  const runtime = createLiveAccountLifecycle();
  const account = runtime.lifecycle.prepare(
    `catalog-${Date.now().toString(36)}-${testInfo.workerIndex}-${testInfo.retry}`,
  );
  let capturedKeys = [];
  let sharedCatalogKey;
  let failure;

  try {
    await runtime.lifecycle.provisionPrepared(account);
    await signIn(page, account);
    await importCatalogBook(page);
    await proveLibraryCoverAndContent(page);

    const importedBook = await runtime.queryImportedBook(account.userId, CATALOG_BOOK_ID);
    expect(importedBook).toBeTruthy();
    sharedCatalogKey = importedBook.storage_path;
    expect(sharedCatalogKey).toMatch(/^catalog\/books\//);
    expect(await runtime.headObject(sharedCatalogKey)).toMatchObject({ exists: true });

    const artifacts = await runtime.lifecycle.captureArtifacts(account.userId);
    capturedKeys = artifacts.map(({ key }) => key);

    const proof = await deleteThroughProduct(page, account, runtime.lifecycle);
    expect(proof.signInRejected).toBe(true);
    expect(proof.database).toHaveLength(25);
    expect(proof.database.every(({ count }) => count === 0)).toBe(true);
    expect(proof.r2PrefixEmpty).toBe(true);
    expect(proof.objects).toEqual(
      expect.arrayContaining(
        capturedKeys.map((key) => expect.objectContaining({ key, exists: false })),
      ),
    );
    expect(await runtime.queryImportedBook(account.userId, CATALOG_BOOK_ID)).toBeNull();
    expect(await runtime.headObject(sharedCatalogKey)).toMatchObject({ exists: true });
  } catch (error) {
    failure = error;
  } finally {
    try {
      if (!page.isClosed()) await page.close({ runBeforeUnload: false });
    } catch (error) {
      failure = combineFailures(failure, error, 'Catalog lifecycle could not close its page');
    }

    let cleanupReport;
    let cleanupError;
    const observedStates = [];
    try {
      cleanupReport = await runtime.lifecycle.cleanupPreparedAccount(account, {
        onInventory: async (state) => {
          observedStates.push(stateResidue(state));
          if (!failure && hasStateResidue(state)) {
            failure = new Error(
              `Catalog lifecycle teardown observed residue: ${JSON.stringify(stateResidue(state))}`,
            );
          }
        },
      });
    } catch (error) {
      cleanupError = error;
      failure = combineFailures(failure, error, 'Catalog lifecycle cleanup failed');
    }

    if (
      cleanupReport &&
      !failure &&
      (cleanupReport.outcome !== 'already-clean' || hasStateResidue(cleanupReport.stateAfter))
    ) {
      failure = new Error(
        `Catalog lifecycle teardown was not already clean: ${JSON.stringify(cleanupReport)}`,
      );
    }
    const teardown = {
      event: 'catalog-import-lifecycle-teardown',
      verdict: failure ? 'failed' : 'passed',
      capturedKeys,
      sharedCatalogKey,
      observedStates,
      cleanup: cleanupReport
        ? {
            outcome: cleanupReport.outcome,
            authority: cleanupReport.authority,
            userId: cleanupReport.userId,
            removedAccount: cleanupReport.removedAccount,
            removedObjects: cleanupReport.removedObjects,
            stateAfter: stateResidue(cleanupReport.stateAfter),
          }
        : { outcome: 'cleanup-failed', error: errorMessage(cleanupError) },
    };
    const json = JSON.stringify(teardown, null, 2);
    await testInfo.attach('catalog-import-lifecycle-teardown', {
      body: Buffer.from(`${json}\n`, 'utf8'),
      contentType: 'application/json',
    });
    if (teardown.cleanup.outcome === 'already-clean') console.log(json);
    else console.error(json);
  }

  if (failure) throw failure;
});
