import { expect, test } from '@playwright/test';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLiveAccountLifecycle } from './account-lifecycle/runtime.mjs';
import {
  parseVisibleStorageSnapshot,
  redactLifecycleNetworkValue,
  redactLifecycleResponseBody,
} from './storage-lifecycle-values.mjs';

const ALICE_EPUB = resolve(import.meta.dirname, 'fixtures/books/alice-in-wonderland.epub');
const BOOK_TITLE = "Alice's Adventures in Wonderland";
const BOOK_AUTHOR = 'Lewis Carroll';
const BOOK_LINK_NAME = `Open ${BOOK_TITLE} by ${BOOK_AUTHOR}`;
const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

if (process.env.OPENREAD_E2E_STORAGE_LIFECYCLE_LIVE !== '1') {
  throw new Error(
    'Storage lifecycle is disabled; set OPENREAD_E2E_STORAGE_LIFECYCLE_LIVE=1 for an explicitly authorized live run',
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

const isLifecycleResponse = (response) => {
  const pathname = new URL(response.url()).pathname;
  return (
    /\/(?:api\/)?files(?:\/|$)/.test(pathname) ||
    /\/(?:api\/)?sync(?:\/|$)/.test(pathname) ||
    /\/(?:api\/)?user\/delete$/.test(pathname)
  );
};

function observeLifecycleResponses(page) {
  const entries = [];
  const pending = [];

  const onResponse = (response) => {
    if (!isLifecycleResponse(response)) return;
    const capture = (async () => {
      const request = response.request();
      const url = new URL(response.url());
      let body = '';
      let bodyError;
      try {
        body = redactLifecycleResponseBody(await response.text());
      } catch (error) {
        bodyError = errorMessage(error);
      }
      entries.push({
        capturedAt: new Date().toISOString(),
        method: request.method(),
        origin: url.origin,
        pathname: url.pathname,
        status: response.status(),
        headers: redactLifecycleNetworkValue(await response.allHeaders()),
        body,
        ...(bodyError ? { bodyError } : {}),
      });
    })();
    pending.push(capture);
  };

  page.on('response', onResponse);
  return {
    entries,
    async finish() {
      page.off('response', onResponse);
      const results = await Promise.allSettled(pending);
      const failures = results
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason);
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Storage lifecycle response evidence capture failed');
      }
      return entries;
    },
  };
}

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

async function readVisibleStorage(page) {
  const title = page.getByText('Cloud Storage', { exact: true });
  await expect(title).toBeVisible({ timeout: 30_000 });
  const card = title.locator('xpath=../..');
  const providerError = card.getByText('Failed to load storage information', { exact: true });
  const unavailable = card.getByText('Storage usage is unavailable until your plan loads.', {
    exact: true,
  });
  if (await providerError.isVisible()) {
    throw new Error('Storage lifecycle provider-config blocker: Cloud Storage failed to load');
  }
  if (await unavailable.isVisible()) {
    throw new Error('Storage lifecycle provider-config blocker: Cloud Storage is unavailable');
  }

  const usage = card.getByText(/^.+\s+of\s+.+\s+used$/);
  try {
    await expect(usage).toBeVisible({ timeout: 30_000 });
  } catch (error) {
    const visibleState = (await card.textContent())?.replace(/\s+/g, ' ').trim();
    throw new Error(
      `Storage lifecycle provider-config blocker: no visible quota success state (${visibleState ?? 'empty card'})`,
      { cause: error },
    );
  }
  const percentage = card.getByText(/^\d+%$/);
  await expect(percentage).toBeVisible();
  return parseVisibleStorageSnapshot(await usage.innerText(), await percentage.innerText());
}

async function waitForVisibleStorage(page, predicate, label) {
  let observed;
  await expect
    .poll(
      async () => {
        await page.reload({ waitUntil: 'domcontentloaded' });
        observed = await readVisibleStorage(page);
        return predicate(observed);
      },
      {
        message: label,
        timeout: 120_000,
        intervals: [1_000, 2_000, 5_000],
      },
    )
    .toBe(true);
  return observed;
}

async function uploadThroughFilePicker(page) {
  await page.goto('/get-started', { waitUntil: 'domcontentloaded' });
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

async function deleteBookThroughProduct(page) {
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  const bookLink = page.getByRole('link', { name: BOOK_LINK_NAME, exact: true });
  await expect(bookLink).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: `Book options for ${BOOK_TITLE}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Permanently', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, Delete Permanently', exact: true }).click();
  await expect(bookLink).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText('Syncing your library...')).toBeHidden({ timeout: 30_000 });
}

async function deleteAccountThroughProduct(page, account, lifecycle) {
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

test('Storage lifecycle: visible quota rises after upload and returns after UI deletion', async ({
  page,
}, testInfo) => {
  test.setTimeout(420_000);
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  if (!existsSync(ALICE_EPUB)) {
    throw new Error(`Storage lifecycle fixture is missing: ${ALICE_EPUB}`);
  }

  const runtime = createLiveAccountLifecycle();
  const account = runtime.lifecycle.prepare(
    `storage-${Date.now().toString(36)}-${testInfo.workerIndex}-${testInfo.retry}`,
  );
  const network = observeLifecycleResponses(page);
  const observations = {};
  let deletionProof;
  let failure;

  try {
    await test.step('provision a marked disposable account and sign in', async () => {
      await runtime.lifecycle.provisionPrepared(account);
      await signIn(page, account);
    });

    observations.baseline =
      await test.step('observe the visible empty Cloud Storage baseline', async () => {
        await page.goto('/settings/account', { waitUntil: 'domcontentloaded' });
        const baseline = await readVisibleStorage(page);
        expect(baseline.usedBytes).toBe(0);
        expect(baseline.totalBytes).toBeGreaterThan(statSync(ALICE_EPUB).size);
        // The card does not render available bytes. Do not synthesize a return target:
        // every lifecycle comparison below uses independently observed display values.
        return baseline;
      });

    await test.step('upload Alice through the real browser file chooser', () =>
      uploadThroughFilePicker(page));

    observations.afterUpload =
      await test.step('observe visible Cloud Storage usage increase after upload', async () => {
        await page.goto('/settings/account', { waitUntil: 'domcontentloaded' });
        const afterUpload = await waitForVisibleStorage(
          page,
          (snapshot) =>
            snapshot.usedBytes > observations.baseline.usedBytes &&
            snapshot.totalText === observations.baseline.totalText,
          'Visible Cloud Storage usage did not increase after the user upload',
        );
        expect(afterUpload.usageText).not.toBe(observations.baseline.usageText);
        expect(afterUpload.percentage).toBeGreaterThanOrEqual(observations.baseline.percentage);
        return afterUpload;
      });

    await test.step('permanently delete Alice through the library UI', () =>
      deleteBookThroughProduct(page));

    observations.afterDelete =
      await test.step('observe Cloud Storage return to the independently recorded baseline', async () => {
        await page.goto('/settings/account', { waitUntil: 'domcontentloaded' });
        const afterDelete = await waitForVisibleStorage(
          page,
          (snapshot) =>
            snapshot.usageText === observations.baseline.usageText &&
            snapshot.percentageText === observations.baseline.percentageText,
          'Visible Cloud Storage usage did not return to its observed baseline after UI deletion',
        );
        expect(afterDelete.totalText).toBe(observations.baseline.totalText);
        expect(afterDelete.usageText).toBe(observations.baseline.usageText);
        expect(afterDelete.percentageText).toBe(observations.baseline.percentageText);
        return afterDelete;
      });

    deletionProof =
      await test.step('delete the account through the product UI and independently verify absence', () =>
        deleteAccountThroughProduct(page, account, runtime.lifecycle));
    expect(deletionProof.signInRejected).toBe(true);
    expect(deletionProof.database).toHaveLength(25);
    expect(deletionProof.database.every(({ count }) => count === 0)).toBe(true);
    expect(deletionProof.r2PrefixEmpty).toBe(true);
  } catch (error) {
    failure = error;
  } finally {
    let networkEvidence = [];
    try {
      networkEvidence = await network.finish();
      await testInfo.attach('storage-lifecycle-network', {
        body: Buffer.from(`${JSON.stringify(networkEvidence, null, 2)}\n`, 'utf8'),
        contentType: 'application/json',
      });
      await testInfo.attach('storage-lifecycle-observations', {
        body: Buffer.from(`${JSON.stringify(observations, null, 2)}\n`, 'utf8'),
        contentType: 'application/json',
      });
    } catch (error) {
      failure = combineFailures(failure, error, 'Storage lifecycle evidence capture failed');
    }

    try {
      if (!page.isClosed()) await page.close({ runBeforeUnload: false });
    } catch (error) {
      failure = combineFailures(failure, error, 'Storage lifecycle could not close its page');
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
              `Storage lifecycle teardown observed residue: ${JSON.stringify(stateResidue(state))}`,
            );
          }
        },
      });
    } catch (error) {
      cleanupError = error;
      failure = combineFailures(failure, error, 'Storage lifecycle cleanup failed');
    }

    if (
      cleanupReport &&
      !failure &&
      (cleanupReport.outcome !== 'already-clean' || hasStateResidue(cleanupReport.stateAfter))
    ) {
      failure = new Error(
        `Storage lifecycle teardown was not already clean: ${JSON.stringify(cleanupReport)}`,
      );
    }

    const teardown = {
      event: 'storage-lifecycle-teardown',
      verdict: failure ? 'failed' : 'passed',
      observations,
      capturedResponseCount: networkEvidence.length,
      deletionProof: deletionProof
        ? {
            signInRejected: deletionProof.signInRejected,
            databaseRows: deletionProof.database.length,
            databaseEmpty: deletionProof.database.every(({ count }) => count === 0),
            r2PrefixEmpty: deletionProof.r2PrefixEmpty,
          }
        : null,
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
    try {
      await testInfo.attach('storage-lifecycle-teardown', {
        body: Buffer.from(`${json}\n`, 'utf8'),
        contentType: 'application/json',
      });
    } catch (error) {
      failure = combineFailures(failure, error, 'Storage lifecycle teardown evidence failed');
    }
    if (teardown.cleanup.outcome === 'already-clean') console.log(json);
    else console.error(json);
  }

  if (failure) throw failure;
});
