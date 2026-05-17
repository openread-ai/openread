import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { LibraryPage } from '../../pages/LibraryPage';
import { ReaderPage } from '../../pages/ReaderPage';

async function openLibrary(page: Page) {
  const library = new LibraryPage(page);
  await library.goto();
  await library.expectBooksVisible();
  return library;
}

const DISPOSABLE_IMPORT_TITLE = 'openread-e2e-upload';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function bookLinkByTitle(page: Page, title: string) {
  return page.getByRole('link', { name: new RegExp(`Open ${escapeRegex(title)} by`, 'i') }).first();
}

async function firstBookTitle(page: Page) {
  const label = await page.locator('a[href*="/reader?ids="]').first().getAttribute('aria-label');
  const title = label?.match(/^Open (.+) by /)?.[1]?.trim();
  if (!title) throw new Error(`Unable to derive first book title from aria-label: ${label}`);
  return title;
}

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

async function removeDisposableImportIfPresent(page: Page) {
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'All Books' })).toBeVisible({ timeout: 30_000 });

  const disposableLink = bookLinkByTitle(page, DISPOSABLE_IMPORT_TITLE);
  if (!(await disposableLink.isVisible({ timeout: 5_000 }).catch(() => false))) return;

  const card = page.locator('div.group').filter({ has: disposableLink }).first();
  await card.getByRole('button', { name: 'Book options' }).click();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  await page.getByRole('button', { name: 'Delete Permanently' }).click();
  await page.getByRole('button', { name: 'Yes, Delete Permanently' }).click();
  await expect(disposableLink).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText('Syncing your library...')).toBeHidden({ timeout: 30_000 });
}

async function revealHeader(page: Page) {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.move(Math.floor(viewport.width / 2), 12);
  const header = page.getByRole('group', { name: 'Header Bar' });
  await expect(header).toBeVisible({ timeout: 10_000 });
  return header;
}

test.describe('Chromium library', () => {
  test('shows populated library controls and book cards', async ({ authenticatedPage: page }) => {
    await openLibrary(page);

    await expect(page.getByRole('heading', { name: 'All Books' })).toBeVisible();
    await expect(page.getByTestId('search-input')).toBeVisible();
    await expect(page.getByTestId('import-button')).toBeVisible();
    await expect(page.getByTestId('sort-order-button')).toBeVisible();
    await expect(page.getByTestId('grid-size-toggle')).toBeVisible();

    const firstBook = page.locator('a[href*="/reader?ids="]').first();
    await expect(firstBook).toBeVisible();
    await expect(firstBook).toHaveAttribute('aria-label', /^Open .+ by .+/);
  });

  test('filters by search and restores after clearing', async ({ authenticatedPage: page }) => {
    await openLibrary(page);
    const title = await firstBookTitle(page);
    const firstBook = page.locator('a[href*="/reader?ids="]').first();

    await page.getByTestId('search-input').fill(title);
    await expect(firstBook).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('search-input').fill('zzzz-openread-no-results');
    await expect(page.getByText('No books match your search.')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('clear-search-button').click();
    await expect(firstBook).toBeVisible({ timeout: 10_000 });
  });

  test('library filter routes remain reachable from the sidebar', async ({
    authenticatedPage: page,
  }) => {
    await openLibrary(page);

    const sidebar = page.getByRole('navigation', { name: 'Platform Sidebar' });
    const libraryToggle = sidebar.getByRole('button', { name: 'Library' });
    if ((await libraryToggle.getAttribute('aria-expanded')) !== 'true') {
      await libraryToggle.click();
    }

    const libraryGroup = sidebar.getByRole('group', { name: 'Library' });
    await expect(libraryGroup).toBeVisible();

    await libraryGroup.getByRole('link', { name: 'Want to Read' }).click();
    await expect(page).toHaveURL(/\/library\/want-to-read\/?$/);
    await expect(page.getByRole('heading', { name: 'Want to Read' })).toBeVisible();

    await libraryGroup.getByRole('link', { name: 'Books' }).click();
    await expect(page).toHaveURL(/\/library\/books\/?$/);
    await expect(page.getByRole('heading', { name: 'Books' })).toBeVisible();

    await libraryGroup.getByRole('link', { name: 'PDFs' }).click();
    await expect(page).toHaveURL(/\/library\/pdfs\/?$/);
    await expect(page.getByRole('heading', { name: 'PDFs' })).toBeVisible();

    await libraryGroup.getByRole('link', { name: 'All' }).click();
    await expect(page).toHaveURL(/\/library\/?$/);
    await expect(page.getByRole('heading', { name: 'All Books' })).toBeVisible();
  });

  test('import button opens the browser file picker without selecting files', async ({
    authenticatedPage: page,
  }) => {
    await openLibrary(page);

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByTestId('import-button').click();
    const fileChooser = await fileChooserPromise;

    expect(fileChooser.isMultiple()).toBe(true);
    await fileChooser.setFiles([]);
  });

  test('imports a disposable text book with live sync and opens it in reader', async ({
    authenticatedPage: page,
  }) => {
    await removeDisposableImportIfPresent(page);

    try {
      await page.goto('/library', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'All Books' })).toBeVisible();
      await expect(page.getByTestId('import-button')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('a[href*="/reader?ids="]').first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText('Syncing your library...')).toBeHidden({ timeout: 30_000 });

      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.getByTestId('import-button').click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles('e2e/fixtures/books/openread-e2e-upload.txt');

      const importedBook = bookLinkByTitle(page, DISPOSABLE_IMPORT_TITLE);
      await expect(importedBook).toBeVisible({ timeout: 45_000 });

      await importedBook.click();
      const reader = new ReaderPage(page);
      await reader.waitForReaderUrl();
      await expect(reader.inlineQuestionBar()).toBeVisible({ timeout: 45_000 });
      await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible({
        timeout: 45_000,
      });
    } finally {
      await removeDisposableImportIfPresent(page);
    }
  });

  test('sort, order, grid, and group controls remain usable', async ({
    authenticatedPage: page,
  }) => {
    await openLibrary(page);

    const groupBySelect = page.getByRole('combobox').first();
    const sortSelect = page.getByRole('combobox').nth(1);

    await sortSelect.click();
    await page.getByRole('option', { name: 'Title' }).click();
    await expect(sortSelect).toContainText('Title');

    const orderButton = page.getByTestId('sort-order-button');
    const initialOrderTitle = await orderButton.getAttribute('title');
    await orderButton.click();
    await expect(orderButton).not.toHaveAttribute('title', initialOrderTitle ?? '');

    await page.getByTestId('grid-size-large').click();
    await expect(page.getByTestId('grid-size-large')).toHaveAttribute('data-active', 'true');
    await page.getByTestId('grid-size-small').click();
    await expect(page.getByTestId('grid-size-small')).toHaveAttribute('data-active', 'true');

    await groupBySelect.click();
    await page.getByRole('option', { name: 'Author' }).click();
    await expect(groupBySelect).toContainText('Author');
    await expect(page.getByText(/\d+ books?/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('opens a book and returns safely to library', async ({ authenticatedPage: page }) => {
    const library = await openLibrary(page);
    const reader = new ReaderPage(page);

    const bookLink = await firstNonDisposableBookLink(page);
    await bookLink.click();
    await reader.waitForReaderUrl();
    await expect(reader.inlineQuestionBar()).toBeVisible({ timeout: 45_000 });

    const header = await revealHeader(page);
    await header.getByRole('button', { name: 'Close' }).click();

    await page.waitForURL((url) => url.pathname === '/library', { timeout: 30_000 });
    await library.expectBooksVisible();
  });
});
