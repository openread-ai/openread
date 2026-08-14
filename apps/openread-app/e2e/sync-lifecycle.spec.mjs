import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLiveAccountLifecycle } from './account-lifecycle/runtime.mjs';

const ALICE_EPUB = resolve(import.meta.dirname, 'fixtures/books/alice-in-wonderland.epub');
const BOOK_TITLE = "Alice's Adventures in Wonderland";
const BOOK_AUTHOR = 'Lewis Carroll';
const BOOK_LINK_NAME = `Open ${BOOK_TITLE} by ${BOOK_AUTHOR}`;
const PROGRESS_AUTOSAVE_DELAY_MS = 5_000;
const PROGRESS_AUTOSAVE_THROTTLE_MS = 10_000;
const PROGRESS_AUTOSAVE_WORST_CASE_MS = PROGRESS_AUTOSAVE_THROTTLE_MS + PROGRESS_AUTOSAVE_DELAY_MS;
const DURABILITY_SETTLE_MS = PROGRESS_AUTOSAVE_WORST_CASE_MS + 2_000;
const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

if (process.env.OPENREAD_E2E_SYNC_LIFECYCLE_LIVE !== '1') {
  throw new Error(
    'Sync lifecycle is disabled; set OPENREAD_E2E_SYNC_LIFECYCLE_LIVE=1 for an explicitly authorized live run',
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
  await page.waitForURL((url) => ['/get-started', '/home'].includes(url.pathname), {
    timeout: 30_000,
  });
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

async function openBook(page) {
  await page.getByRole('link', { name: BOOK_LINK_NAME, exact: true }).click();
  await page.waitForURL(
    (url) => url.pathname === '/reader' && Boolean(url.searchParams.get('ids')),
    { timeout: 60_000 },
  );
  await expect(page.getByTestId('reader-content-ready')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible({
    timeout: 60_000,
  });
}

async function revealReaderBar(page, position) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Sync lifecycle requires a fixed Chromium viewport');
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

async function closeBook(page) {
  const header = await revealReaderBar(page, 'top');
  const close = header.getByRole('button', { name: /Back to Library|Close/ }).first();
  await expect(close).toBeVisible({ timeout: 10_000 });
  await close.click({ timeout: 10_000 });
  await page.waitForURL((url) => url.pathname === '/library', { timeout: 30_000 });
  await expect(page.getByRole('link', { name: BOOK_LINK_NAME, exact: true })).toBeVisible();
}

async function renderedPageHash(page) {
  const bookContent = page.getByRole('document', { name: 'Book Content' });
  await expect(bookContent).toBeVisible();
  // The Book Content element spans the reader cell, so an element screenshot also
  // composites overlapping header/footer siblings. Hash only the fixed region
  // between those chrome boundaries; the capture still happens on every check.
  const clip = await bookContent.evaluate((element) => {
    const content = element.getBoundingClientRect();
    const cell = element.parentElement;
    const header = cell?.querySelector('[role="group"][aria-label="Header Bar"]');
    const footer = cell?.querySelector('[role="group"][aria-label="Footer Bar"]');
    if (!header || !footer) throw new Error('Reader content chrome boundaries are unavailable');

    const top = Math.max(content.top, header.getBoundingClientRect().bottom);
    const bottom = Math.min(content.bottom, footer.getBoundingClientRect().top);
    if (content.width <= 0 || bottom <= top) {
      throw new Error('Reader content capture region is empty');
    }

    return { x: content.left, y: top, width: content.width, height: bottom - top };
  });
  const screenshot = await page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    clip,
  });
  return createHash('sha256').update(screenshot).digest('hex');
}

async function visibleReaderPosition(page) {
  const footer = await revealReaderBar(page, 'bottom');
  const progressLabel = footer.locator('[aria-label^="Reading Progress:"]');
  const pageLabel = page.locator('[aria-label^="On "]').filter({ visible: true }).first();
  await expect(progressLabel).toBeVisible();
  await expect(pageLabel).toBeVisible();
  return {
    progressLabel: await progressLabel.getAttribute('aria-label'),
    pageLabel: await pageLabel.getAttribute('aria-label'),
    renderedPageHash: await renderedPageHash(page),
  };
}

async function waitForBookInFreshContext(page) {
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  const bookLink = page.getByRole('link', { name: BOOK_LINK_NAME, exact: true });
  await expect(bookLink).toBeVisible({ timeout: 120_000 });
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

test('Sync lifecycle: resumes the rendered reading position in a separate context', async ({
  browser,
}, testInfo) => {
  test.setTimeout(420_000);
  if (!existsSync(ALICE_EPUB)) throw new Error(`Sync lifecycle fixture is missing: ${ALICE_EPUB}`);

  const runtime = createLiveAccountLifecycle();
  const account = runtime.lifecycle.prepare(
    `sync-${Date.now().toString(36)}-${testInfo.workerIndex}-${testInfo.retry}`,
  );
  let contextA;
  let contextB;
  let advancedPosition;
  let failure;

  try {
    await runtime.lifecycle.provisionPrepared(account);

    contextA = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const pageA = await contextA.newPage();
    pageA.setDefaultTimeout(15_000);
    pageA.setDefaultNavigationTimeout(30_000);
    await signIn(pageA, account);
    await uploadThroughFilePicker(pageA);
    await openBook(pageA);

    const initialPosition = await visibleReaderPosition(pageA);
    const footerA = await revealReaderBar(pageA, 'bottom');
    let previousPageLabel = initialPosition.pageLabel;
    for (let turn = 0; turn < 3; turn += 1) {
      await footerA.getByRole('button', { name: 'Next Page', exact: true }).click();
      await expect
        .poll(() => visibleReaderPosition(pageA).then(({ pageLabel }) => pageLabel))
        .not.toBe(previousPageLabel);
      previousPageLabel = (await visibleReaderPosition(pageA)).pageLabel;
    }

    const beforeDurabilityWindow = await visibleReaderPosition(pageA);
    expect(beforeDurabilityWindow.pageLabel).not.toBe(initialPosition.pageLabel);
    expect(beforeDurabilityWindow.renderedPageHash).not.toBe(initialPosition.renderedPageHash);

    // useProgressAutoSave has a 10-second trailing throttle around a 5-second
    // delayed save. Wait beyond the 15-second worst case from the last position
    // change, without intervening user action, before closing context A.
    await pageA.waitForTimeout(DURABILITY_SETTLE_MS);
    advancedPosition = await visibleReaderPosition(pageA);
    expect(advancedPosition.pageLabel).toBe(beforeDurabilityWindow.pageLabel);
    expect(advancedPosition.progressLabel).toBe(beforeDurabilityWindow.progressLabel);
    expect(advancedPosition.renderedPageHash).toBe(beforeDurabilityWindow.renderedPageHash);

    await closeBook(pageA);
    await contextA.close();
    contextA = undefined;

    contextB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const pageB = await contextB.newPage();
    pageB.setDefaultTimeout(15_000);
    pageB.setDefaultNavigationTimeout(30_000);
    await signIn(pageB, account);
    await waitForBookInFreshContext(pageB);
    await openBook(pageB);

    await expect
      .poll(
        async () => {
          const position = await visibleReaderPosition(pageB);
          return {
            pageLabel: position.pageLabel,
            progressLabel: position.progressLabel,
            renderedPageHash: position.renderedPageHash,
          };
        },
        { timeout: 60_000 },
      )
      .toEqual({
        pageLabel: advancedPosition.pageLabel,
        progressLabel: advancedPosition.progressLabel,
        renderedPageHash: advancedPosition.renderedPageHash,
      });

    const proof = await deleteThroughProduct(pageB, account, runtime.lifecycle);
    expect(proof.signInRejected).toBe(true);
    expect(proof.database).toHaveLength(25);
    expect(proof.database.every(({ count }) => count === 0)).toBe(true);
    expect(proof.r2PrefixEmpty).toBe(true);
  } catch (error) {
    failure = error;
  } finally {
    for (const context of [contextA, contextB]) {
      try {
        if (context) await context.close();
      } catch (error) {
        failure = combineFailures(
          failure,
          error,
          'Sync lifecycle could not close a browser context',
        );
      }
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
              `Sync lifecycle teardown observed residue: ${JSON.stringify(stateResidue(state))}`,
            );
          }
        },
      });
    } catch (error) {
      cleanupError = error;
      failure = combineFailures(failure, error, 'Sync lifecycle cleanup failed');
    }

    if (
      cleanupReport &&
      !failure &&
      (cleanupReport.outcome !== 'already-clean' || hasStateResidue(cleanupReport.stateAfter))
    ) {
      failure = new Error(
        `Sync lifecycle teardown was not already clean: ${JSON.stringify(cleanupReport)}`,
      );
    }
    const teardown = {
      event: 'sync-lifecycle-teardown',
      verdict: failure ? 'failed' : 'passed',
      autosaveDelayMs: PROGRESS_AUTOSAVE_DELAY_MS,
      autosaveThrottleMs: PROGRESS_AUTOSAVE_THROTTLE_MS,
      autosaveWorstCaseMs: PROGRESS_AUTOSAVE_WORST_CASE_MS,
      advancedPosition,
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
    await testInfo.attach('sync-lifecycle-teardown', {
      body: Buffer.from(`${json}\n`, 'utf8'),
      contentType: 'application/json',
    });
    if (teardown.cleanup.outcome === 'already-clean') console.log(json);
    else console.error(json);
  }

  if (failure) throw failure;
});
