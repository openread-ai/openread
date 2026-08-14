import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLiveAccountLifecycle } from './account-lifecycle/runtime.mjs';

const ALICE_EPUB = resolve(import.meta.dirname, 'fixtures/books/alice-in-wonderland.epub');
const BOOK_TITLE = "Alice's Adventures in Wonderland";
const BOOK_AUTHOR = 'Lewis Carroll';
const BOOK_LINK_NAME = `Open ${BOOK_TITLE} by ${BOOK_AUTHOR}`;
const HIGHLIGHT_TEXT = 'The Project Gutenberg eBook of';
const NOTES_SYNC_DEFERRAL_MS = 5_000;
const DURABILITY_WAIT_MS = NOTES_SYNC_DEFERRAL_MS + 1_000;
const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

if (process.env.OPENREAD_E2E_ANNOTATION_LIFECYCLE_LIVE !== '1') {
  throw new Error(
    'Annotation lifecycle is disabled; set OPENREAD_E2E_ANNOTATION_LIFECYCLE_LIVE=1 for an explicitly authorized live run',
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
  const bookLink = page.getByRole('link', { name: BOOK_LINK_NAME, exact: true });
  await expect(bookLink).toBeVisible({ timeout: 30_000 });
  await bookLink.click();
  await page.waitForURL((url) => url.pathname === '/reader', { timeout: 30_000 });
  await expect(page.getByTestId('reader-content-ready')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible({
    timeout: 30_000,
  });
}

async function selectKnownText(page, text) {
  await page.waitForSelector('iframe', { state: 'attached', timeout: 45_000 });
  const popup = page.locator('.selection-popup').first();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    for (const frame of page.frames().filter((candidate) => candidate !== page.mainFrame())) {
      const selected = await frame
        .evaluate((knownText) => {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let node = walker.nextNode();
          while (node) {
            const value = node.textContent ?? '';
            const start = value.indexOf(knownText);
            if (start >= 0) {
              const range = document.createRange();
              range.setStart(node, start);
              range.setEnd(node, start + knownText.length);
              const rect = range.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) return false;
              const selection = window.getSelection();
              selection?.removeAllRanges();
              selection?.addRange(range);
              const target = node.parentElement ?? document.body;
              document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
              target.dispatchEvent(
                new PointerEvent('pointerup', {
                  bubbles: true,
                  cancelable: true,
                  pointerType: 'mouse',
                  isPrimary: true,
                  button: 0,
                  buttons: 0,
                  clientX: rect.left + rect.width / 2,
                  clientY: rect.top + rect.height / 2,
                }),
              );
              target.dispatchEvent(
                new MouseEvent('mouseup', {
                  bubbles: true,
                  cancelable: true,
                  button: 0,
                  buttons: 0,
                  clientX: rect.left + rect.width / 2,
                  clientY: rect.top + rect.height / 2,
                }),
              );
              return selection?.toString() === knownText;
            }
            node = walker.nextNode();
          }
          return false;
        }, text)
        .catch(() => false);
      if (!selected) continue;
      await expect(popup).toBeVisible({ timeout: 10_000 });
      await popup.getByRole('button', { name: 'Highlight', exact: true }).click();
      return;
    }
    await page.waitForTimeout(500);
  }

  throw new Error(`Annotation lifecycle could not select rendered text: ${text}`);
}

async function renderedHighlightForText(page, text) {
  for (const frame of page.frames().filter((candidate) => candidate !== page.mainFrame())) {
    const textFound = await frame
      .evaluate((knownText) => document.body?.innerText.includes(knownText) ?? false, text)
      .catch(() => false);
    if (!textFound) continue;

    const iframe = await frame.frameElement();
    const result = await iframe
      .evaluate((element, knownText) => {
        const root = element.getRootNode();
        if (!(root instanceof ShadowRoot)) return null;

        const overlays = [...root.querySelectorAll('g[fill]')]
          .flatMap((group) =>
            [...group.querySelectorAll('rect, path, polygon')].map((shape) => ({
              fill: group.getAttribute('fill'),
              shape: shape.tagName,
              x: shape.getAttribute('x'),
              y: shape.getAttribute('y'),
              width: shape.getAttribute('width'),
              height: shape.getAttribute('height'),
              d: shape.getAttribute('d'),
            })),
          )
          .filter(({ fill, width, height, d }) =>
            Boolean(fill && (d || (Number(width) > 0 && Number(height) > 0))),
          );
        return { text: knownText, overlays };
      }, text)
      .catch(() => null);
    if (result?.text === text && result.overlays.length > 0) return result;
  }
  return null;
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

test('Annotation lifecycle: rendered highlight survives reload and account deletion removes it', async ({
  page,
}, testInfo) => {
  test.setTimeout(420_000);
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  if (!existsSync(ALICE_EPUB)) throw new Error(`Annotation fixture is missing: ${ALICE_EPUB}`);

  const runtime = createLiveAccountLifecycle();
  const account = runtime.lifecycle.prepare(
    `annotation-${Date.now().toString(36)}-${testInfo.workerIndex}-${testInfo.retry}`,
  );
  let failure;

  try {
    await runtime.lifecycle.provisionPrepared(account);
    await signIn(page, account);
    await importAlice(page);

    await test.step('create and observe a rendered highlight on known text', async () => {
      await selectKnownText(page, HIGHLIGHT_TEXT);
      await expect.poll(() => renderedHighlightForText(page, HIGHLIGHT_TEXT)).not.toBeNull();
    });

    await test.step('wait past the 5-second notes sync throttle', async () => {
      await page.waitForTimeout(DURABILITY_WAIT_MS);
      const durableState = await runtime.lifecycle.inspectAccountState(account.userId);
      expect(durableState.database.find(({ table }) => table === 'book_notes')?.count).toBe(1);
    });

    await test.step('reload and prove the same text remains visibly highlighted', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('reader-content-ready')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible({
        timeout: 30_000,
      });
      await expect
        .poll(() => renderedHighlightForText(page, HIGHLIGHT_TEXT), { timeout: 30_000 })
        .not.toBeNull();
    });

    const proof = await deleteThroughProduct(page, account, runtime.lifecycle);
    expect(proof.signInRejected).toBe(true);
    expect(proof.database).toHaveLength(25);
    expect(proof.database.find(({ table }) => table === 'book_notes')?.count).toBe(0);
    expect(proof.database.every(({ count }) => count === 0)).toBe(true);
    expect(proof.r2PrefixEmpty).toBe(true);
  } catch (error) {
    failure = error;
  } finally {
    try {
      if (!page.isClosed()) await page.close({ runBeforeUnload: false });
    } catch (error) {
      failure = combineFailures(failure, error, 'Annotation lifecycle could not close its page');
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
              `Annotation lifecycle teardown observed residue: ${JSON.stringify(stateResidue(state))}`,
            );
          }
        },
      });
    } catch (error) {
      cleanupError = error;
      failure = combineFailures(failure, error, 'Annotation lifecycle cleanup failed');
    }

    if (
      cleanupReport &&
      !failure &&
      (cleanupReport.outcome !== 'already-clean' || hasStateResidue(cleanupReport.stateAfter))
    ) {
      failure = new Error(
        `Annotation lifecycle teardown was not already clean: ${JSON.stringify(cleanupReport)}`,
      );
    }
    const teardown = {
      event: 'annotation-lifecycle-teardown',
      verdict: failure ? 'failed' : 'passed',
      persistenceDeferralMs: NOTES_SYNC_DEFERRAL_MS,
      durabilityWaitMs: DURABILITY_WAIT_MS,
      highlightedText: HIGHLIGHT_TEXT,
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
    await testInfo.attach('annotation-lifecycle-teardown', {
      body: Buffer.from(`${json}\n`, 'utf8'),
      contentType: 'application/json',
    });
    if (teardown.cleanup.outcome === 'already-clean') console.log(json);
    else console.error(json);
  }

  if (failure) throw failure;
});
