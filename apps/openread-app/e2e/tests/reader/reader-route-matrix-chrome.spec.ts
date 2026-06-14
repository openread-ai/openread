import { test, expect } from '../../fixtures';
import { attachScenarioEvidence } from '../../helpers/settings-contract';
import { LibraryPage } from '../../pages/LibraryPage';
import { ReaderPage } from '../../pages/ReaderPage';

const DISPOSABLE_IMPORT_TITLE = 'openread-e2e-upload';

async function readableReaderIds(page, minCount = 1): Promise<string[]> {
  const library = new LibraryPage(page);
  await library.goto();
  await library.expectBooksVisible();

  const links = page.locator('a[href*="/reader?ids="]');
  const count = await links.count();
  const ids: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index);
    const label = (await link.getAttribute('aria-label')) ?? '';
    if (label.includes(DISPOSABLE_IMPORT_TITLE)) continue;

    const href = await link.getAttribute('href');
    if (!href) continue;
    const url = new URL(href, page.url());
    const id = url.searchParams.get('ids') ?? url.pathname.split('/reader/')[1];
    if (id && !ids.includes(id)) ids.push(id);
    if (ids.length >= minCount) break;
  }

  expect(ids.length, `Expected at least ${minCount} readable seeded books`).toBeGreaterThanOrEqual(
    minCount,
  );
  return ids;
}

async function expectReaderReady(page, expectedGridCells = 1) {
  const reader = new ReaderPage(page);
  await reader.waitForReaderUrl();
  await expect(page.getByTestId('reader-content-ready')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByPlaceholder('Ask about this book...').first()).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.locator('[id^="gridcell-"]')).toHaveCount(expectedGridCells, {
    timeout: 45_000,
  });
}

test.describe('Chromium reader route matrix', () => {
  test('opens query-style reader URL with one book', async ({
    authenticatedPage: page,
  }, testInfo) => {
    const [bookId] = await readableReaderIds(page, 1);

    await page.goto(`/reader?ids=${encodeURIComponent(bookId)}`, { waitUntil: 'domcontentloaded' });

    await expectReaderReady(page, 1);
    await attachScenarioEvidence(page, testInfo, 'RR-QS-01-route-query-single');
  });

  test('opens path-style reader URL with one book', async ({
    authenticatedPage: page,
  }, testInfo) => {
    const [bookId] = await readableReaderIds(page, 1);

    await page.goto(`/reader/${bookId}`, { waitUntil: 'domcontentloaded' });

    await expectReaderReady(page, 1);
    await attachScenarioEvidence(page, testInfo, 'RR-PS-01-route-path-single');
  });

  test('preserves optional query params on path-style reader URL', async ({
    authenticatedPage: page,
  }, testInfo) => {
    const [bookId] = await readableReaderIds(page, 1);

    await page.goto(`/reader/${bookId}?qaRouteMatrix=1`, { waitUntil: 'domcontentloaded' });

    await expectReaderReady(page, 1);
    expect(new URL(page.url()).searchParams.get('qaRouteMatrix')).toBe('1');
    await attachScenarioEvidence(page, testInfo, 'RR-QP-01-route-query-params');
  });

  test('opens encoded query multi-book URL and path multi-book URL', async ({
    authenticatedPage: page,
  }, testInfo) => {
    const [firstId, secondId] = await readableReaderIds(page, 2);

    await page.goto(`/reader?ids=${encodeURIComponent(`${firstId}+${secondId}`)}`, {
      waitUntil: 'domcontentloaded',
    });
    await expectReaderReady(page, 2);
    await attachScenarioEvidence(page, testInfo, 'RR-MB-01-route-query-multibook');

    await page.goto(`/reader/${firstId}+${secondId}`, { waitUntil: 'domcontentloaded' });
    await expectReaderReady(page, 2);
    await attachScenarioEvidence(page, testInfo, 'RR-MB-01-route-path-multibook');
  });

  test('opens duplicate encoded query IDs as separate reader cells', async ({
    authenticatedPage: page,
  }, testInfo) => {
    const [bookId] = await readableReaderIds(page, 1);

    await page.goto(`/reader?ids=${encodeURIComponent(`${bookId}+${bookId}`)}`, {
      waitUntil: 'domcontentloaded',
    });

    await expectReaderReady(page, 2);
    await attachScenarioEvidence(page, testInfo, 'RR-DUP-01-route-duplicate-ids');
  });

  test('documents current no-id reader route watch item', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.goto('/reader', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('reader-content-ready')).toBeHidden({ timeout: 5_000 });
    await attachScenarioEvidence(page, testInfo, 'RR-NOID-01-route-no-id-watch-item');
  });
});
