import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLiveAccountLifecycle } from './account-lifecycle/runtime.mjs';

const ALICE_EPUB = resolve(import.meta.dirname, 'fixtures/books/alice-in-wonderland.epub');
const BOOK_TITLE = "Alice's Adventures in Wonderland";
const BOOK_AUTHOR = 'Lewis Carroll';
const BOOK_LINK_NAME = `Open ${BOOK_TITLE} by ${BOOK_AUTHOR}`;
const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

if (process.env.OPENREAD_E2E_READER_LIFECYCLE_LIVE !== '1') {
  throw new Error(
    'Reader lifecycle is disabled; set OPENREAD_E2E_READER_LIFECYCLE_LIVE=1 for an explicitly authorized live run',
  );
}

async function revealReaderBar(page, position) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Reader lifecycle requires a fixed Chromium viewport');
  await page.mouse.move(
    Math.floor(viewport.width / 2),
    position === 'top' ? 12 : viewport.height - 8,
  );
  const bar = page.getByRole('group', {
    name: position === 'top' ? 'Header Bar' : 'Footer Bar',
  });
  await expect(bar).toBeVisible({ timeout: 10_000 });
  return bar;
}

async function openBook(page) {
  await page.getByRole('link', { name: BOOK_LINK_NAME, exact: true }).click();
  await page.waitForURL(
    (url) => url.pathname === '/reader' && Boolean(url.searchParams.get('ids')),
  );
  await expect(page.getByTestId('reader-content-ready')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible({
    timeout: 15_000,
  });
}

async function closeBook(page) {
  const header = await revealReaderBar(page, 'top');
  const close = header.getByRole('button', { name: /Back to Library|Close/ }).first();
  await expect(close).toBeVisible({ timeout: 10_000 });
  await close.click({ timeout: 10_000 });
  await page.waitForURL((url) => url.pathname === '/library');
  await expect(page.getByRole('link', { name: BOOK_LINK_NAME, exact: true })).toBeVisible();
}

async function readerProgress(page) {
  const footer = await revealReaderBar(page, 'bottom');
  const slider = footer.getByRole('slider', { name: 'Jump to Location', exact: true });
  const label = footer.locator('[aria-label^="Reading Progress:"]');
  await expect(slider).toBeVisible();
  await expect(label).toBeVisible();
  return {
    footer,
    slider,
    value: Number(await slider.inputValue()),
    label: await label.getAttribute('aria-label'),
  };
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

test('Reader lifecycle: provisioned account imports, resumes, and deletes cleanly', async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  if (!existsSync(ALICE_EPUB))
    throw new Error(`Reader lifecycle fixture is missing: ${ALICE_EPUB}`);

  const runtime = createLiveAccountLifecycle();
  const runId = `reader-${Date.now().toString(36)}-${testInfo.workerIndex}-${testInfo.retry}`;
  let account;
  let failure;

  try {
    account = runtime.lifecycle.prepare(runId);
    await test.step('provision a marked disposable account', () =>
      runtime.lifecycle.provisionPrepared(account));

    await test.step('sign in through the product UI and reach the final empty state', async () => {
      await page.goto('/auth');
      await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
      await page.getByLabel('Email', { exact: true }).fill(account.email);
      await page.getByLabel('Password', { exact: true }).fill(account.password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();

      await page.waitForURL((url) => url.pathname === '/get-started', { timeout: 30_000 });
      const emptyState = page.getByTestId('empty-library-start-screen');
      await expect(emptyState).toHaveAttribute('data-variant', 'onboarding');
      await expect(page.getByTestId('empty-library-heading')).toHaveText('Welcome to OpenRead');
    });

    await test.step('import Alice through the real file picker', async () => {
      const importButton = page.getByTestId('empty-library-import-btn');
      await expect(importButton).toBeEnabled();
      const chooserPromise = page.waitForEvent('filechooser');
      await importButton.click();
      const chooser = await chooserPromise;
      await Promise.all([
        expect(page.getByText('1 book imported successfully', { exact: true })).toBeVisible({
          timeout: 15_000,
        }),
        chooser.setFiles(ALICE_EPUB),
      ]);
      await expect(page.getByRole('link', { name: BOOK_LINK_NAME, exact: true })).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('open the imported book and advance its visible position', async () => {
      await openBook(page);
      const before = await readerProgress(page);
      await before.footer.getByRole('button', { name: 'Next Page', exact: true }).click();
      await expect
        .poll(() => before.slider.inputValue().then(Number), { timeout: 5_000 })
        .toBeGreaterThan(before.value);
    });

    const advanced = await test.step('capture the advanced machine-readable UI position', () =>
      readerProgress(page));

    await test.step('close, hard reload, reopen, and prove durable restored position', async () => {
      await closeBook(page);

      // The close handler starts saveConfig but does not await it before routing.
      // Do not treat route arrival as save completion and do not reach into storage:
      // a hard reload followed by the same range value and progress label proves
      // durable user-visible restoration, not byte equality of the stored CFI.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('link', { name: BOOK_LINK_NAME, exact: true })).toBeVisible();
      await openBook(page);
      const restored = await readerProgress(page);
      expect(restored.value).toBe(advanced.value);
      expect(restored.label).toBe(advanced.label);
    });

    await test.step('delete the imported book through the product UI', async () => {
      await closeBook(page);
      const bookLink = page.getByRole('link', { name: BOOK_LINK_NAME, exact: true });
      await page
        .getByRole('button', { name: `Book options for ${BOOK_TITLE}`, exact: true })
        .click();
      await page.getByRole('menuitem', { name: 'Remove', exact: true }).click();
      await page.getByRole('button', { name: 'Delete Permanently', exact: true }).click();
      await page.getByRole('button', { name: 'Yes, Delete Permanently', exact: true }).click();
      await expect(bookLink).toBeHidden({ timeout: 30_000 });
      await expect(page.getByText('Syncing your library...')).toBeHidden({ timeout: 30_000 });
    });

    const deletionProof =
      await test.step('delete the account through the product UI and independently verify absence', () =>
        runtime.lifecycle.finalize(account, async () => {
          const sidebar = page.getByRole('navigation', { name: 'Platform Sidebar' });
          await sidebar.getByRole('button', { name: 'Profile menu', exact: true }).click();
          await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
          await page.waitForURL((url) => url.pathname === '/settings/account');

          await page.getByRole('button', { name: 'Delete Account', exact: true }).click();
          const dialog = page.getByRole('alertdialog');
          await expect(dialog).toBeVisible();
          const deleteResponsePromise = page.waitForResponse(
            (response) =>
              response.request().method() === 'DELETE' &&
              new URL(response.url()).pathname.endsWith('/user/delete'),
            { timeout: 30_000 },
          );
          await dialog.getByRole('button', { name: 'Delete Account', exact: true }).click();
          const deleteResponse = await deleteResponsePromise;
          expect(deleteResponse.status()).toBe(200);

          await page.waitForURL((url) => url.pathname === '/auth', { timeout: 15_000 });
          await expect(
            page.getByRole('heading', { name: 'Welcome back', exact: true }),
          ).toBeVisible();
          await page.goto('/library');
          await page.waitForURL((url) => url.pathname === '/auth', { timeout: 15_000 });
          await expect(page.getByRole('heading', { name: 'All Books', exact: true })).toBeHidden();
        }));

    expect(deletionProof.signInRejected).toBe(true);
    expect(deletionProof.r2PrefixEmpty).toBe(true);
    expect(deletionProof.database.length).toBeGreaterThan(0);
    expect(deletionProof.database.every(({ count }) => count === 0)).toBe(true);
  } catch (error) {
    failure = error;
  } finally {
    if (account) {
      const observedStates = [];
      let cleanupReport;
      let cleanupError;

      try {
        if (!page.isClosed()) await page.close({ runBeforeUnload: false });
      } catch (closeError) {
        failure = combineFailures(
          failure,
          closeError,
          `Reader lifecycle failed and the test writer could not be closed (${errorMessage(closeError)})`,
        );
      }

      try {
        cleanupReport = await runtime.lifecycle.cleanupPreparedAccount(account, {
          onInventory: async (state) => {
            observedStates.push(stateResidue(state));
            if (!failure && hasStateResidue(state)) {
              failure = new Error(
                `Reader lifecycle teardown observed residue before cleanup: ${JSON.stringify(stateResidue(state))}`,
              );
            }
          },
        });
      } catch (error) {
        cleanupError = error;
        failure = combineFailures(
          failure,
          error,
          `Reader lifecycle failed (${errorMessage(failure)}) and account cleanup also failed (${errorMessage(error)})`,
        );
      }

      if (
        cleanupReport &&
        !failure &&
        (cleanupReport.outcome !== 'already-clean' || hasStateResidue(cleanupReport.stateAfter))
      ) {
        failure = new Error(
          `Reader lifecycle teardown was not already clean: ${JSON.stringify({
            outcome: cleanupReport.outcome,
            stateAfter: stateResidue(cleanupReport.stateAfter),
          })}`,
        );
      }

      const cleanupEvidence = cleanupReport
        ? {
            outcome: cleanupReport.outcome,
            authority: cleanupReport.authority,
            userId: cleanupReport.userId,
            removedAccount: cleanupReport.removedAccount,
            removedObjects: cleanupReport.removedObjects,
            stateAfter: stateResidue(cleanupReport.stateAfter),
          }
        : {
            outcome: 'cleanup-failed',
            error: errorMessage(cleanupError),
          };
      const teardownEvidence = {
        event: 'reader-lifecycle-teardown',
        verdict: failure ? 'failed' : 'passed',
        observedStates,
        cleanup: cleanupEvidence,
      };
      const teardownJson = JSON.stringify(teardownEvidence, null, 2);
      try {
        await testInfo.attach('reader-lifecycle-teardown', {
          body: Buffer.from(`${teardownJson}\n`, 'utf8'),
          contentType: 'application/json',
        });
      } catch (evidenceError) {
        failure = combineFailures(
          failure,
          evidenceError,
          `Reader lifecycle teardown evidence could not be attached (${errorMessage(evidenceError)})`,
        );
      }
      if (cleanupEvidence.outcome === 'already-clean') console.log(teardownJson);
      else console.error(teardownJson);
    }
  }

  if (failure) throw failure;
});
