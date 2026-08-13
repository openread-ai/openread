import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLiveAccountLifecycle } from './account-lifecycle/runtime.mjs';

const ALICE_EPUB = resolve(import.meta.dirname, 'fixtures/books/alice-in-wonderland.epub');
const BOOK_TITLE = "Alice's Adventures in Wonderland";
const BOOK_AUTHOR = 'Lewis Carroll';
const BOOK_LINK_NAME = `Open ${BOOK_TITLE} by ${BOOK_AUTHOR}`;
const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

if (process.env.OPENREAD_E2E_EXPORT_DELETE_LIFECYCLE_LIVE !== '1') {
  throw new Error(
    'Export/delete lifecycle is disabled; set OPENREAD_E2E_EXPORT_DELETE_LIFECYCLE_LIVE=1 for an explicitly authorized live run',
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
  await expect(page.getByTestId('empty-library-start-screen')).toHaveAttribute(
    'data-variant',
    'onboarding',
  );
}

async function importAlice(page) {
  const importButton = page.getByTestId('empty-library-import-btn');
  await expect(importButton).toBeEnabled();
  const chooserPromise = page.waitForEvent('filechooser');
  await importButton.click();
  const chooser = await chooserPromise;
  await Promise.all([
    expect(page.getByText('1 book imported successfully', { exact: true })).toBeVisible({
      timeout: 30_000,
    }),
    chooser.setFiles(ALICE_EPUB),
  ]);
  await expect(page.getByRole('link', { name: BOOK_LINK_NAME, exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

async function openSettings(page) {
  const sidebar = page.getByRole('navigation', { name: 'Platform Sidebar' });
  await sidebar.getByRole('button', { name: 'Profile menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/settings/account');
}

async function downloadAndValidateExport(page, account) {
  await page.getByRole('link', { name: 'Preferences', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/settings/preferences');
  const exportButton = page.getByRole('button', { name: 'Download My Data', exact: true });
  await expect(exportButton).toBeVisible();

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await exportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^openread-export-\d{4}-\d{2}-\d{2}\.json$/);

  const stream = await download.createReadStream();
  if (!stream) throw new Error('Export download did not expose a readable stream');
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));

  expect(exported.user).toMatchObject({ id: account.userId, email: account.email });
  expect(exported.books).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ user_id: account.userId, title: BOOK_TITLE }),
    ]),
  );
  expect(exported.files).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ user_id: account.userId, file_type: 'book' }),
    ]),
  );
  expect(Array.isArray(exported.platformTokens)).toBe(true);
  for (const token of exported.platformTokens) {
    expect(token.keyPrefix).toBe('orsk-***');
    expect(token).not.toHaveProperty('token_hash');
  }
}

async function deleteThroughProduct(page, account, lifecycle, browser, baseURL) {
  return lifecycle.finalize(account, async () => {
    await page.getByRole('link', { name: 'Account', exact: true }).click();
    await page.waitForURL((url) => url.pathname === '/settings/account');
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
    await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
    await page.goto('/library', { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => url.pathname === '/auth', { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'All Books', exact: true })).toBeHidden();
    await expect(page.getByText(BOOK_TITLE, { exact: true })).toBeHidden();

    const coldContext = await browser.newContext({ baseURL });
    try {
      const coldPage = await coldContext.newPage();
      await coldPage.goto('/library', { waitUntil: 'domcontentloaded' });
      await coldPage.waitForURL((url) => url.pathname === '/auth', { timeout: 30_000 });
      await expect(
        coldPage.getByRole('heading', { name: 'Welcome back', exact: true }),
      ).toBeVisible();
      await coldPage.getByLabel('Email', { exact: true }).fill(account.email);
      await coldPage.getByLabel('Password', { exact: true }).fill(account.password);
      await coldPage.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(coldPage.getByRole('alert')).toBeVisible({ timeout: 30_000 });
      await expect(coldPage).toHaveURL((url) => url.pathname === '/auth');
      await expect(coldPage.getByRole('heading', { name: 'All Books', exact: true })).toBeHidden();
    } finally {
      await coldContext.close();
    }
  });
}

test('Export/delete lifecycle: downloads cloud data and revokes warm and cold access', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(420_000);
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  if (!existsSync(ALICE_EPUB)) {
    throw new Error(`Export/delete lifecycle fixture is missing: ${ALICE_EPUB}`);
  }

  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== 'string') throw new Error('Export/delete lifecycle requires a base URL');

  const runtime = createLiveAccountLifecycle();
  const account = runtime.lifecycle.prepare(
    `export-delete-${Date.now().toString(36)}-${testInfo.workerIndex}-${testInfo.retry}`,
  );
  let failure;

  try {
    await runtime.lifecycle.provisionPrepared(account);
    await signIn(page, account);
    await importAlice(page);

    await expect
      .poll(() => runtime.queryActiveBookFiles(account.userId).then((files) => files.length), {
        timeout: 120_000,
      })
      .toBe(1);

    await openSettings(page);
    await downloadAndValidateExport(page, account);

    const proof = await deleteThroughProduct(page, account, runtime.lifecycle, browser, baseURL);
    expect(proof.signInRejected).toBe(true);
    expect(proof.database).toHaveLength(25);
    expect(proof.database.every(({ count }) => count === 0)).toBe(true);
    expect(proof.r2PrefixEmpty).toBe(true);
  } catch (error) {
    failure = error;
  } finally {
    try {
      if (!page.isClosed()) await page.close({ runBeforeUnload: false });
    } catch (error) {
      failure = combineFailures(failure, error, 'Export/delete lifecycle could not close its page');
    }

    const observedStates = [];
    let cleanupReport;
    let cleanupError;
    try {
      cleanupReport = await runtime.lifecycle.cleanupPreparedAccount(account, {
        onInventory: async (state) => {
          observedStates.push(stateResidue(state));
          if (!failure && hasStateResidue(state)) {
            failure = new Error(
              `Export/delete lifecycle teardown observed residue: ${JSON.stringify(stateResidue(state))}`,
            );
          }
        },
      });
    } catch (error) {
      cleanupError = error;
      failure = combineFailures(failure, error, 'Export/delete lifecycle cleanup failed');
    }

    if (
      cleanupReport &&
      !failure &&
      (cleanupReport.outcome !== 'already-clean' || hasStateResidue(cleanupReport.stateAfter))
    ) {
      failure = new Error(
        `Export/delete lifecycle teardown was not already clean: ${JSON.stringify(cleanupReport)}`,
      );
    }

    const teardown = {
      event: 'export-delete-lifecycle-teardown',
      verdict: failure ? 'failed' : 'passed',
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
    await testInfo.attach('export-delete-lifecycle-teardown', {
      body: Buffer.from(`${json}\n`, 'utf8'),
      contentType: 'application/json',
    });
    if (teardown.cleanup.outcome === 'already-clean') console.log(json);
    else console.error(json);
  }

  if (failure) throw failure;
});
