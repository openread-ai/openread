import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLiveAccountLifecycle } from './account-lifecycle/runtime.mjs';

const ALICE_EPUB = resolve(import.meta.dirname, 'fixtures/books/alice-in-wonderland.epub');
const BOOK_TITLE = "Alice's Adventures in Wonderland";
const BOOK_AUTHOR = 'Lewis Carroll';
const BOOK_LINK_NAME = `Open ${BOOK_TITLE} by ${BOOK_AUTHOR}`;
const errorMessage = (error) => (error instanceof Error ? error.message : String(error));
const isUserOwnedKey = (key, userId) =>
  key.startsWith(`users/${userId}/`) || key.startsWith(`${userId}/Openread/Books/`);
const isCanonicalBookKey = (key, userId) => key.startsWith(`users/${userId}/books/`);

if (process.env.OPENREAD_E2E_UPLOAD_LIFECYCLE_LIVE !== '1') {
  throw new Error(
    'Upload lifecycle is disabled; set OPENREAD_E2E_UPLOAD_LIFECYCLE_LIVE=1 for an explicitly authorized live run',
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

async function uploadThroughFilePicker(page) {
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

async function proveParsedMetadataAndContent(page) {
  const bookLink = page.getByRole('link', { name: BOOK_LINK_NAME, exact: true });
  await expect(bookLink).toBeVisible();
  await expect(
    page.getByRole('link', { name: new RegExp('alice-in-wonderland\\.epub', 'i') }),
  ).toHaveCount(0);
  await bookLink.click();
  await page.waitForURL(
    (url) => url.pathname === '/reader' && Boolean(url.searchParams.get('ids')),
    { timeout: 30_000 },
  );
  await expect(page.getByTestId('reader-content-ready')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible({
    timeout: 30_000,
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

test('Upload lifecycle: parses an EPUB and deletes all user-owned state', async ({
  page,
}, testInfo) => {
  test.setTimeout(420_000);
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  if (!existsSync(ALICE_EPUB))
    throw new Error(`Upload lifecycle fixture is missing: ${ALICE_EPUB}`);

  const runtime = createLiveAccountLifecycle();
  const account = runtime.lifecycle.prepare(
    `upload-${Date.now().toString(36)}-${testInfo.workerIndex}-${testInfo.retry}`,
  );
  let capturedKeys = [];
  let failure;

  try {
    await runtime.lifecycle.provisionPrepared(account);
    await signIn(page, account);
    await uploadThroughFilePicker(page);
    await proveParsedMetadataAndContent(page);

    await expect
      .poll(
        async () =>
          (await runtime.lifecycle.captureArtifacts(account.userId)).some(({ key }) =>
            key.toLowerCase().endsWith('.epub'),
          ),
        { timeout: 120_000 },
      )
      .toBe(true);
    await page.waitForLoadState('networkidle');

    const activeBookFiles = await runtime.queryActiveBookFiles(account.userId);
    expect(activeBookFiles).toHaveLength(1);
    expect(activeBookFiles[0]).toMatchObject({
      book_hash: expect.stringMatching(/^[0-9a-f]{32}$/),
      status: 'active',
      deleted_at: null,
    });
    expect(isCanonicalBookKey(activeBookFiles[0].file_key, account.userId)).toBe(true);

    const artifacts = await runtime.lifecycle.captureArtifacts(account.userId);
    capturedKeys = artifacts.map(({ key }) => key);
    expect(capturedKeys.some((key) => key.toLowerCase().endsWith('.epub'))).toBe(true);
    expect(capturedKeys.every((key) => isUserOwnedKey(key, account.userId))).toBe(true);

    const proof = await deleteThroughProduct(page, account, runtime.lifecycle);
    expect(proof.signInRejected).toBe(true);
    expect(proof.database).toHaveLength(25);
    expect(proof.database.every(({ count }) => count === 0)).toBe(true);
    expect(proof.r2PrefixEmpty).toBe(true);
    expect(proof.objects.map(({ key }) => key)).toEqual(expect.arrayContaining(capturedKeys));
  } catch (error) {
    failure = error;
  } finally {
    try {
      if (!page.isClosed()) await page.close({ runBeforeUnload: false });
    } catch (error) {
      failure = combineFailures(failure, error, 'Upload lifecycle could not close its page');
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
              `Upload lifecycle teardown observed residue: ${JSON.stringify(stateResidue(state))}`,
            );
          }
        },
      });
    } catch (error) {
      cleanupError = error;
      failure = combineFailures(failure, error, 'Upload lifecycle cleanup failed');
    }

    if (
      cleanupReport &&
      !failure &&
      (cleanupReport.outcome !== 'already-clean' || hasStateResidue(cleanupReport.stateAfter))
    ) {
      failure = new Error(
        `Upload lifecycle teardown was not already clean: ${JSON.stringify(cleanupReport)}`,
      );
    }
    const teardown = {
      event: 'upload-book-lifecycle-teardown',
      verdict: failure ? 'failed' : 'passed',
      capturedKeys,
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
    await testInfo.attach('upload-book-lifecycle-teardown', {
      body: Buffer.from(`${json}\n`, 'utf8'),
      contentType: 'application/json',
    });
    if (teardown.cleanup.outcome === 'already-clean') console.log(json);
    else console.error(json);
  }

  if (failure) throw failure;
});
