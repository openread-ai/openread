import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { LibraryPage } from '../../pages/LibraryPage';
import { ReaderPage } from '../../pages/ReaderPage';

const DISPOSABLE_IMPORT_TITLE = 'openread-e2e-upload';

async function firstNonDisposableBookLink(page: Page) {
  const links = page.locator('a[href*="/reader?ids="]');
  const count = await links.count();
  for (let index = 0; index < count; index++) {
    const link = links.nth(index);
    const label = await link.getAttribute('aria-label');
    if (label && !label.includes(DISPOSABLE_IMPORT_TITLE)) return link;
  }
  throw new Error('No non-disposable library book link found');
}

async function openFirstBookInReader(page: Page): Promise<void> {
  const library = new LibraryPage(page);
  const reader = new ReaderPage(page);

  await library.goto();
  await library.expectBooksVisible();
  const bookLink = await firstNonDisposableBookLink(page);
  await bookLink.click();

  await reader.waitForReaderUrl();
  await expect(reader.inlineQuestionBar()).toBeVisible({ timeout: 45_000 });
}

async function revealHeader(page: Page) {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.move(Math.floor(viewport.width / 2), 12);
  const header = page.getByRole('group', { name: 'Header Bar' });
  await expect(header).toBeVisible({ timeout: 10_000 });
  return header;
}

async function openViewMenu(page: Page) {
  const header = await revealHeader(page);
  await header.getByLabel('View Options').click();
  const viewMenu = page.locator('.view-menu').first();
  await expect(viewMenu).toBeVisible({ timeout: 10_000 });
  return viewMenu;
}

function isSyncRequest(url: string): boolean {
  return url.includes('/api/sync');
}

test.describe('Chromium live sync lane', () => {
  test('live sync leaves the library shell usable', async ({ authenticatedPage: page }) => {
    const syncResponses: number[] = [];
    page.on('response', (response) => {
      if (isSyncRequest(response.url())) syncResponses.push(response.status());
    });

    await page.goto('/library', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'All Books' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('import-button')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('a[href*="/reader?ids="]').first()).toBeVisible({ timeout: 60_000 });

    await expect
      .poll(() => syncResponses.some((status) => status >= 200 && status < 500), {
        timeout: 30_000,
      })
      .toBe(true);
  });

  test('reader sync menu action calls the live sync endpoint', async ({
    authenticatedPage: page,
  }) => {
    await openFirstBookInReader(page);

    const viewMenu = await openViewMenu(page);
    const syncItem = viewMenu.getByRole('menuitem', {
      name: /^(Never synced|Synced at .+|Sign in to Sync)$/,
    });
    await expect(syncItem).toBeVisible();

    const syncRequestPromise = page.waitForRequest(
      (request) => isSyncRequest(request.url()) && ['GET', 'POST'].includes(request.method()),
      { timeout: 30_000 },
    );
    await syncItem.click();
    await syncRequestPromise;

    await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible();
  });
});
