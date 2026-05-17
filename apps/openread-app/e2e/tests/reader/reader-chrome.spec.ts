import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { LibraryPage } from '../../pages/LibraryPage';
import { ReaderPage } from '../../pages/ReaderPage';

async function openFirstBookInReader(page: Page): Promise<void> {
  const library = new LibraryPage(page);
  const reader = new ReaderPage(page);

  await library.goto();
  await library.expectBooksVisible();
  await library.clickFirstBook();

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

async function revealFooter(page: Page) {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.move(Math.floor(viewport.width / 2), viewport.height - 8);
  const footer = page.getByRole('group', { name: 'Footer Bar' });
  await expect(footer).toBeVisible({ timeout: 10_000 });
  return footer;
}

async function openViewMenu(page: Page) {
  const header = await revealHeader(page);
  await header.getByLabel('View Options').click();
  const viewMenu = page.locator('.view-menu').first();
  await expect(viewMenu).toBeVisible({ timeout: 10_000 });
  await expect(header).toBeVisible();
  return viewMenu;
}

async function openPanelFromHeader(page: Page, buttonLabel: string, panelSelector: string) {
  const panel = page.locator(panelSelector).first();
  if (await isVisibleSoon(panel, 500)) return panel;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const header = await revealHeader(page);
    await header.getByLabel(buttonLabel).click();
    if (await isVisibleSoon(panel, 2_500)) return panel;
  }

  await expect(panel).toBeVisible({ timeout: 10_000 });
  return panel;
}

async function isVisibleSoon(locator: Locator, timeout: number) {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

async function seedSavedRsvpPosition(page: Page) {
  const readerUrl = new URL(page.url());
  const bookId = readerUrl.searchParams.get('ids') ?? readerUrl.pathname.split('/reader/')[1];
  if (!bookId) throw new Error(`Unable to derive reader book id from ${page.url()}`);

  await page.evaluate((id) => {
    localStorage.setItem(
      `openread_rsvp_pos_${id}`,
      JSON.stringify({ cfi: 'epubcfi(/6/2)', wordText: 'Resume' }),
    );
  }, bookId);
}

test.describe('Chromium reader chrome', () => {
  test('renders book content and inline question bar', async ({ authenticatedPage: page }) => {
    await openFirstBookInReader(page);

    await expect(page.getByTestId('reader-content-ready')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByPlaceholder('Ask about this book...').first()).toBeVisible();
  });

  test('supports captured reader deep links and reload', async ({ authenticatedPage: page }) => {
    const library = new LibraryPage(page);
    const reader = new ReaderPage(page);

    await library.goto();
    await library.expectBooksVisible();

    const firstBook = await library.firstReadableBookLink();
    await expect(firstBook).toBeVisible({ timeout: 30_000 });
    const href = await firstBook.getAttribute('href');
    if (!href) throw new Error('Expected first library book to expose a reader href.');

    const readerUrl = new URL(href, page.url());
    const ids = readerUrl.searchParams.get('ids') ?? readerUrl.pathname.split('/reader/')[1];
    if (!ids) throw new Error(`Unable to derive reader ids from href: ${href}`);

    await firstBook.click();
    await reader.waitForReaderUrl();
    await expect(reader.inlineQuestionBar()).toBeVisible({ timeout: 45_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await reader.waitForReaderUrl();
    await expect(reader.inlineQuestionBar()).toBeVisible({ timeout: 45_000 });

    await page.goto(`/reader/${ids}`, { waitUntil: 'domcontentloaded' });
    await reader.waitForReaderUrl();
    await expect(reader.inlineQuestionBar()).toBeVisible({ timeout: 45_000 });
  });

  test('reveals header and keeps View Options usable', async ({ authenticatedPage: page }) => {
    await openFirstBookInReader(page);

    const header = await revealHeader(page);
    await expect(header.getByLabel(/Add Bookmark|Remove Bookmark/)).toBeVisible();
    await expect(header.getByLabel(/Translation/)).toBeVisible();
    await expect(header.getByLabel('Font & Layout')).toBeVisible();
    await expect(header.getByLabel('Notebook')).toBeVisible();
    await expect(header.getByLabel('View Options')).toBeVisible();

    const viewMenu = await openViewMenu(page);
    await expect(viewMenu.getByText('Font & Layout')).toBeVisible();
    await expect(viewMenu.getByText('Scrolled Mode')).toBeVisible();
    await expect(viewMenu.getByText('Paragraph Mode')).toBeVisible();
    await expect(viewMenu.getByText('Speed Reading Mode')).toBeVisible();
    await expect(
      viewMenu.getByRole('menuitem', { name: /^(Auto Mode|Light Mode|Dark Mode)$/ }),
    ).toBeVisible();
    await expect(viewMenu.getByText('Invert Image In Dark Mode')).toBeVisible();
    await expect(
      viewMenu.getByRole('menuitem', { name: /^(Never synced|Synced at .+|Sign in to Sync)$/ }),
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(viewMenu).toBeHidden({ timeout: 5_000 });
  });

  test('bookmark control toggles and restores the current location', async ({
    authenticatedPage: page,
  }) => {
    await openFirstBookInReader(page);

    const header = await revealHeader(page);
    const bookmarkButton = header.getByLabel(/Add Bookmark|Remove Bookmark/);
    const initialLabel = (await bookmarkButton.getAttribute('aria-label')) ?? 'Add Bookmark';
    const toggledLabel = initialLabel.includes('Add') ? 'Remove Bookmark' : 'Add Bookmark';

    await bookmarkButton.click();
    await expect(header.getByLabel(toggledLabel)).toBeVisible({ timeout: 10_000 });

    await header.getByLabel(toggledLabel).click();
    await expect(header.getByLabel(initialLabel)).toBeVisible({ timeout: 10_000 });
  });

  test('opens Font & Layout settings and closes it with Escape', async ({
    authenticatedPage: page,
  }) => {
    await openFirstBookInReader(page);

    const header = await revealHeader(page);
    await header.getByLabel('Font & Layout').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole('group', { name: /Settings Panels/ })).toBeVisible();
    await expect(dialog.getByRole('group', { name: /Settings$/ })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });

  test('reader settings dialog exposes nested panels and menu actions', async ({
    authenticatedPage: page,
  }) => {
    await openFirstBookInReader(page);

    const header = await revealHeader(page);
    await header.getByLabel('Font & Layout').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const settingsPanels = dialog.getByRole('group', { name: /Settings Panels/ });
    await expect(settingsPanels).toBeVisible();

    for (const panel of ['Font', 'Layout', 'Color', 'Behavior', 'Language', 'Custom']) {
      await settingsPanels.getByRole('button', { name: panel, exact: true }).click();
      await expect(
        dialog.getByRole('group', { name: new RegExp(`${panel} - Settings`) }),
      ).toBeVisible();
    }

    await dialog.getByLabel('Settings Menu').click();
    await expect(page.getByRole('menuitem', { name: 'Global Settings' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Reset Settings|Reset/ })).toBeVisible();

    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });

  test('quick action menu exposes selectable annotation shortcuts when enabled', async ({
    authenticatedPage: page,
  }) => {
    await openFirstBookInReader(page);

    const header = await revealHeader(page);
    const quickAction = header.getByLabel(/Quick Action|Selection/);
    if (!(await isVisibleSoon(quickAction, 1_000))) {
      test.skip(true, 'Quick actions are disabled for this reader fixture/settings state.');
    }

    await quickAction.click();
    const menu = page.locator('.annotation-quick-action-menu').first();
    await expect(menu).toBeVisible({ timeout: 10_000 });
    for (const label of [
      'Instant Highlight',
      'Instant Search',
      'Instant Dictionary',
      'Instant Wikipedia',
      'Instant Translate',
      'Instant Speak',
    ]) {
      await expect(menu.getByRole('menuitem', { name: label })).toBeVisible();
    }

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden({ timeout: 5_000 });
  });

  test('safe View Options actions are wired or explicitly disabled', async ({
    authenticatedPage: page,
  }) => {
    await openFirstBookInReader(page);

    let viewMenu = await openViewMenu(page);
    const scrolledMode = viewMenu.getByRole('menuitem', { name: /Scrolled Mode/ });
    if (await scrolledMode.isDisabled()) {
      await expect(scrolledMode).toBeDisabled();
    } else {
      await scrolledMode.click();
      await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible();
      await scrolledMode.click();
    }

    const themeMode = viewMenu.getByRole('menuitem', {
      name: /^(Auto Mode|Light Mode|Dark Mode)$/,
    });
    await themeMode.click();
    await expect(
      viewMenu.getByRole('menuitem', { name: /^(Auto Mode|Light Mode|Dark Mode)$/ }),
    ).toBeVisible();
    await viewMenu.getByRole('menuitem', { name: /^(Auto Mode|Light Mode|Dark Mode)$/ }).click();
    await viewMenu.getByRole('menuitem', { name: /^(Auto Mode|Light Mode|Dark Mode)$/ }).click();

    await page.keyboard.press('Escape');
    await expect(viewMenu).toBeHidden({ timeout: 5_000 });

    viewMenu = await openViewMenu(page);
    const paragraphMode = viewMenu.getByRole('menuitem', { name: /Paragraph Mode/ });
    if (await paragraphMode.isDisabled()) {
      await expect(paragraphMode).toBeDisabled();
    } else {
      await paragraphMode.click();
      const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
      await page.mouse.move(Math.floor(viewport.width / 2), viewport.height - 40);
      await expect(page.getByRole('button', { name: 'Previous Paragraph' })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole('button', { name: 'Exit Paragraph Mode' }).click();
      await expect(page.getByRole('button', { name: 'Previous Paragraph' })).toBeHidden({
        timeout: 10_000,
      });
    }
  });

  test('speed reading start flow opens or is explicitly unavailable', async ({
    authenticatedPage: page,
  }) => {
    await openFirstBookInReader(page);
    await seedSavedRsvpPosition(page);

    const viewMenu = await openViewMenu(page);
    const speedReading = viewMenu.getByRole('menuitem', { name: /Speed Reading Mode/ });
    if (await speedReading.isDisabled()) {
      await expect(speedReading).toBeDisabled();
      return;
    }

    await speedReading.click();
    const dialog = page.getByRole('dialog', { name: /Start RSVP Reading/ });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText('Choose where to start reading')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });

  test('reveals footer with navigation and progress controls', async ({
    authenticatedPage: page,
  }) => {
    await openFirstBookInReader(page);

    const footer = await revealFooter(page);
    await expect(footer.getByRole('button', { name: 'Previous Section' }).first()).toBeVisible();
    await expect(footer.getByRole('button', { name: 'Previous Page' }).first()).toBeVisible();
    await expect(footer.getByRole('button', { name: 'Go Back' }).first()).toBeVisible();
    await expect(footer.getByRole('button', { name: 'Go Forward' }).first()).toBeVisible();
    await expect(footer.getByRole('button', { name: 'Speak' }).first()).toBeVisible();
    await expect(footer.getByRole('button', { name: 'Next Page' }).first()).toBeVisible();
    await expect(footer.getByRole('button', { name: 'Next Section' }).first()).toBeVisible();
    await expect(footer.getByLabel('Jump to Location').first()).toBeVisible();
    await expect(footer.getByLabel(/Reading Progress:/).first()).toBeVisible();

    await footer.getByRole('button', { name: 'Next Page' }).first().click();
    await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible();
  });

  test('opens sidebar search and tab controls from reader chrome', async ({
    authenticatedPage: page,
  }) => {
    await openFirstBookInReader(page);

    const sidebar = await openPanelFromHeader(page, 'Toggle Sidebar', '.sidebar-container');
    await expect(sidebar).toHaveAttribute('aria-label', 'Sidebar');
    await expect(sidebar.getByRole('button', { name: 'TOC' })).toBeVisible();
    await expect(sidebar.getByRole('treeitem').first()).toBeVisible({ timeout: 10_000 });
    await expect(sidebar.getByRole('button', { name: 'Annotate' })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Bookmark' })).toBeVisible();

    await sidebar.getByRole('button', { name: 'Annotate' }).click();
    await expect(sidebar.getByRole('button', { name: 'Annotate' })).toBeVisible();
    await sidebar.getByRole('button', { name: 'Bookmark' }).click();
    await expect(sidebar.getByRole('button', { name: 'Bookmark' })).toBeVisible();
    await sidebar.getByRole('button', { name: 'TOC' }).click();

    await sidebar.getByLabel('Book Menu').click();
    const bookMenu = page.locator('.book-menu').first();
    await expect(bookMenu).toBeVisible({ timeout: 10_000 });
    await expect(bookMenu.getByText('Parallel Read')).toBeVisible();
    await expect(bookMenu.getByRole('menuitem', { name: 'Export Annotations' })).toBeVisible();
    await expect(bookMenu.getByRole('menuitem', { name: 'Sort TOC by Page' })).toBeVisible();
    await expect(bookMenu.getByRole('menuitem', { name: /Reload Page/ })).toBeVisible();
    await page.keyboard.press('Escape');

    await sidebar.getByTitle('Show Search Bar').click();
    const search = sidebar.getByPlaceholder('Search...');
    await expect(search).toBeVisible();

    await sidebar.getByLabel('Search Options').click();
    const searchOptions = page.locator('.search-options').first();
    await expect(searchOptions).toBeVisible({ timeout: 10_000 });
    for (const label of [
      'Book',
      'Chapter',
      'Match Case',
      'Match Whole Words',
      'Match Diacritics',
    ]) {
      await expect(searchOptions.getByRole('button', { name: label })).toBeVisible();
    }
    await page.keyboard.press('Escape');

    await search.fill('a');
    await expect(search).toHaveValue('a');
    await sidebar.getByLabel('Clear search').click();
    await expect(search).toHaveValue('');

    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(search).toBeHidden({ timeout: 10_000 });
  });

  test('TOC item activation keeps reader content available', async ({
    authenticatedPage: page,
  }) => {
    await openFirstBookInReader(page);

    const sidebar = await openPanelFromHeader(page, 'Toggle Sidebar', '.sidebar-container');
    const firstTocItem = sidebar.getByRole('treeitem').first();
    await expect(firstTocItem).toBeVisible({ timeout: 10_000 });
    await firstTocItem.click();
    await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible();
  });

  test('opens notebook panels from reader chrome', async ({ authenticatedPage: page }) => {
    await openFirstBookInReader(page);

    await openPanelFromHeader(page, 'Toggle Sidebar', '.sidebar-container');
    const notebook = await openPanelFromHeader(page, 'Notebook', '.notebook-container');
    await expect(notebook).toHaveAttribute('aria-label', 'Notebook');
    await expect(notebook.getByRole('button', { name: 'Notes' })).toBeVisible();
    await expect(notebook.getByRole('button', { name: 'AI' })).toBeVisible();

    await notebook.getByRole('button', { name: 'Notes' }).click();
    await expect(notebook.getByText('Notebook').first()).toBeVisible();
    await notebook.getByRole('button', { name: 'AI' }).click();
    await expect(notebook.getByText('AI Chat').first()).toBeVisible();
  });
});
