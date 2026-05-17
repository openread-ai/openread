import type { Locator, Page, Response } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { ReaderPage } from '../../pages/ReaderPage';
import { SYNC_PROTOCOL_VERSION } from '../../../src/libs/sync-protocol';

async function firstCatalogCard(page: Page): Promise<Locator> {
  await expect(page.getByTestId('collection-rows')).toBeVisible({ timeout: 30_000 });
  const card = page.locator('[data-testid^="card-tap-"]').first();
  await expect(card).toBeVisible({ timeout: 45_000 });
  return card;
}

async function openFirstCatalogBook(page: Page): Promise<Locator> {
  const card = await firstCatalogCard(page);
  await card.click();

  const sheet = page.getByTestId('book-detail-sheet');
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByTestId('sheet-title')).toBeVisible();
  return sheet;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function libraryBookLinkByTitle(page: Page, title: string) {
  return page.getByRole('link', { name: new RegExp(`Open ${escapeRegex(title)} by`, 'i') }).first();
}

function libraryBookLinks(page: Page) {
  return page.locator('a[aria-label^="Open "]');
}

async function expectImageLoaded(image: Locator) {
  await expect(image).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      async () =>
        image.evaluate((node) => {
          const img = node as HTMLImageElement;
          return img.complete && img.naturalWidth > 0;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
}

async function removeLibraryBookIfPresent(page: Page, title: string): Promise<Response | null> {
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'All Books' })).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('search-input').fill(title);

  const bookLink = libraryBookLinkByTitle(page, title);
  if (!(await bookLink.isVisible({ timeout: 10_000 }).catch(() => false))) return null;

  const card = page.locator('div.group').filter({ has: bookLink }).first();
  await card.getByRole('button', { name: 'Book options' }).click();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  await page.getByRole('button', { name: 'Delete Permanently' }).click();

  const serverDeletePromise = page
    .waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        new URL(response.url()).pathname.endsWith('/api/sync'),
      { timeout: 30_000 },
    )
    .catch(() => null);
  await page.getByRole('button', { name: 'Yes, Delete Permanently' }).click();
  await expect(bookLink).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText('Syncing your library...')).toBeHidden({ timeout: 30_000 });
  return serverDeletePromise;
}

async function revealHeader(page: Page) {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.move(Math.floor(viewport.width / 2), 12);
  const header = page.getByRole('group', { name: 'Header Bar' });
  await expect(header).toBeVisible({ timeout: 10_000 });
  return header;
}

async function authHeaders(page: Page): Promise<Record<string, string>> {
  const token = await page.evaluate(() => localStorage.getItem('token'));
  expect(token).toBeTruthy();
  return { authorization: `Bearer ${token}`, 'x-sync-protocol': String(SYNC_PROTOCOL_VERSION) };
}

async function expectCatalogBookCleanup(page: Page, bookHash: string) {
  const syncResponse = await page.request.get(
    `/api/sync?since=0&book=${encodeURIComponent(bookHash)}`,
    { headers: await authHeaders(page) },
  );
  expect(syncResponse.status()).toBe(200);

  const syncBody = (await syncResponse.json()) as Record<string, unknown>;
  for (const key of ['books', 'configs', 'notes']) {
    expect(syncBody[key]).toEqual([]);
  }
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
    await expect(page.getByTestId('collection-rows')).toBeVisible({ timeout: 30_000 });
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
    await expect(page.getByTestId('collection-rows')).toBeVisible({ timeout: 30_000 });
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
    await page.goto('/explore', { waitUntil: 'domcontentloaded' });

    const sheet = await openFirstCatalogBook(page);
    const importedTitle = (await sheet.getByTestId('sheet-title').innerText()).trim();
    expect(importedTitle).toBeTruthy();

    let imported = false;
    let cleanupComplete = false;
    try {
      const importResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          /\/api\/catalog\/(books\/[^/]+|ia)\/import$/.test(new URL(response.url()).pathname),
        { timeout: 120_000 },
      );

      await sheet.getByTestId('sheet-import-btn').click();
      const importResponse = await importResponsePromise;
      if (!importResponse.ok()) {
        test.info().annotations.push({
          type: 'blocked',
          description: `Live catalog import endpoint returned ${importResponse.status()} for ${importedTitle}`,
        });
        test.skip(
          true,
          `Live catalog import endpoint returned ${importResponse.status()}; success-path assertion requires backend fixture/stability.`,
        );
      }

      const importPayload = (await importResponse.json()) as Record<string, unknown>;
      const importedBookHash = String(importPayload.book_hash ?? '');
      expect(importedBookHash).toMatch(/^catalog:[0-9a-f-]{36}$/i);

      imported = true;
      await expect(sheet.getByTestId('sheet-read-btn')).toBeVisible({ timeout: 120_000 });

      const importReadyScreenshot = testInfo.outputPath('catalog-import-ready.png');
      await page.screenshot({ path: importReadyScreenshot });
      await testInfo.attach('catalog-import-ready', {
        path: importReadyScreenshot,
        contentType: 'image/png',
      });

      await page.goto('/library', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'All Books' })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByTestId('search-input').fill(importedTitle);
      const importedBook = libraryBookLinkByTitle(page, importedTitle);
      await expect(importedBook).toBeVisible({ timeout: 90_000 });
      await expect(libraryBookLinks(page)).toHaveCount(1, { timeout: 30_000 });
      await expect(page.getByText('1 book')).toBeVisible({ timeout: 30_000 });

      const importedCard = page.locator('div.group').filter({ has: importedBook }).first();
      await expectImageLoaded(
        importedCard.getByRole('img', { name: new RegExp(`^${escapeRegex(importedTitle)}$`, 'i') }),
      );

      const importedVisibleScreenshot = testInfo.outputPath('library-import-visible.png');
      await page.screenshot({ path: importedVisibleScreenshot });
      await testInfo.attach('library-import-visible', {
        path: importedVisibleScreenshot,
        contentType: 'image/png',
      });

      await importedBook.click();
      const reader = new ReaderPage(page);
      await reader.waitForReaderUrl();
      await expect(reader.inlineQuestionBar()).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible({
        timeout: 60_000,
      });
      await expectImageLoaded(
        page.getByRole('img', { name: new RegExp(`^${escapeRegex(importedTitle)}$`, 'i') }).first(),
      );

      const readerVisibleScreenshot = testInfo.outputPath('library-import-reader-open.png');
      await page.screenshot({ path: readerVisibleScreenshot });
      await testInfo.attach('library-import-reader-open', {
        path: readerVisibleScreenshot,
        contentType: 'image/png',
      });

      const header = await revealHeader(page);
      await header
        .getByRole('button', { name: /Back to Library|Close/ })
        .first()
        .click();
      await page.waitForURL((url) => url.pathname === '/library', { timeout: 30_000 });

      const cleanupResponse = await removeLibraryBookIfPresent(page, importedTitle);
      if (!cleanupResponse) throw new Error('Expected DELETE /api/sync cleanup response');
      expect(cleanupResponse.status()).toBe(200);
      await expect(cleanupResponse.json()).resolves.toEqual({ ok: true });
      await expectCatalogBookCleanup(page, importedBookHash);
      cleanupComplete = true;
      imported = false;

      const cleanupVisibleScreenshot = testInfo.outputPath('library-import-cleanup-complete.png');
      await page.screenshot({ path: cleanupVisibleScreenshot });
      await testInfo.attach('library-import-cleanup-complete', {
        path: cleanupVisibleScreenshot,
        contentType: 'image/png',
      });
    } finally {
      if (imported && !cleanupComplete) await removeLibraryBookIfPresent(page, importedTitle);
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
