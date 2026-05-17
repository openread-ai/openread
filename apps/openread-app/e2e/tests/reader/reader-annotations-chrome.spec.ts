import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { LibraryPage } from '../../pages/LibraryPage';
import { ReaderPage } from '../../pages/ReaderPage';
import { selectFirstReaderText } from '../../helpers/select-reader-text';

async function openFirstBookInReader(page: Page): Promise<void> {
  const library = new LibraryPage(page);
  const reader = new ReaderPage(page);

  await library.goto();
  await library.expectBooksVisible();
  await library.clickFirstBook();

  await reader.waitForReaderUrl();
  await expect(reader.inlineQuestionBar()).toBeVisible({ timeout: 45_000 });
}

test.describe('Chromium reader annotations', () => {
  test('selects reader iframe text and exposes annotation actions', async ({
    authenticatedPage: page,
  }) => {
    await openFirstBookInReader(page);
    await selectFirstReaderText(page);

    const popup = page.locator('.selection-popup').first();
    await expect(popup).toBeVisible({ timeout: 10_000 });

    for (const label of [
      'Copy',
      'Highlight',
      'Annotate',
      'Search',
      'Dictionary',
      'Wikipedia',
      'Translate',
      'Speak',
      'Proofread',
    ]) {
      await expect(popup.getByRole('button', { name: label })).toBeVisible();
    }
  });

  test('selection search action opens sidebar search with selected text', async ({
    authenticatedPage: page,
  }) => {
    await openFirstBookInReader(page);
    await selectFirstReaderText(page);

    const popup = page.locator('.selection-popup').first();
    const searchButton = popup.getByRole('button', { name: 'Search' });
    await expect(searchButton).toBeVisible({ timeout: 10_000 });
    await searchButton.click();

    const sidebar = page.locator('.sidebar-container').first();
    await expect(sidebar).toBeVisible({ timeout: 10_000 });
    const search = sidebar.getByPlaceholder('Search...');
    await expect(search).toBeVisible({ timeout: 10_000 });
    await expect(search).not.toHaveValue('');
  });

  test('creates, edits, and deletes a note from selected reader text', async ({
    authenticatedPage: page,
  }) => {
    await openFirstBookInReader(page);
    await selectFirstReaderText(page);

    const popup = page.locator('.selection-popup').first();
    const annotateButton = popup.getByRole('button', { name: 'Annotate' });
    await expect(annotateButton).toBeVisible({ timeout: 10_000 });
    await annotateButton.click();

    const notebook = page.locator('.notebook-container').first();
    await expect(notebook).toBeVisible({ timeout: 10_000 });

    const noteText = `Chromium annotation note ${Date.now()}`;
    const updatedNoteText = `${noteText} updated`;
    await notebook.getByLabel('Add your notes here...').fill(noteText);
    await notebook.getByRole('button', { name: 'Save' }).click();

    let noteItem = notebook.locator('.booknote-item').filter({ hasText: noteText }).first();
    await expect(noteItem).toBeVisible({ timeout: 10_000 });

    await noteItem.hover();
    await noteItem.getByRole('button', { name: 'Edit' }).click();
    await notebook.getByLabel('Add your notes here...').fill(updatedNoteText);
    await notebook.getByRole('button', { name: 'Save' }).click();

    noteItem = notebook.locator('.booknote-item').filter({ hasText: updatedNoteText }).first();
    await expect(noteItem).toBeVisible({ timeout: 10_000 });

    await noteItem.hover();
    await noteItem.getByRole('button', { name: 'Delete' }).click();
    await expect(noteItem).toBeHidden({ timeout: 10_000 });
  });
});
