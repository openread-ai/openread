import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { attachScenarioEvidence } from '../../helpers/settings-contract';
import { LibraryPage } from '../../pages/LibraryPage';
import { ReaderPage } from '../../pages/ReaderPage';
import { selectFirstReaderText } from '../../helpers/select-reader-text';

async function openFirstBookInReader(page: Page): Promise<void> {
  const library = new LibraryPage(page);
  const reader = new ReaderPage(page);

  await library.goto();
  await library.expectBooksVisible();

  const preferredTitlePattern = new RegExp(
    process.env.AI_EVAL_TEXT_BOOK_TITLE_PATTERN ?? '1-Page Marketing',
    'i',
  );
  const search = page.getByTestId('search-input');
  if (await search.isVisible().catch(() => false)) {
    await search.fill(preferredTitlePattern.source.replace(/\\/g, ''));
    const preferredBook = page.getByRole('link', { name: preferredTitlePattern }).first();
    if (await preferredBook.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await preferredBook.click();
    } else {
      await search.fill('');
      await library.clickFirstBook();
    }
  } else {
    await library.clickFirstBook();
  }

  await reader.waitForReaderUrl();
  await expect(reader.inlineQuestionBar()).toBeVisible({ timeout: 45_000 });
}

test.describe('Chromium reader annotations', () => {
  test('selects reader iframe text and exposes annotation actions', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Desktop custom selection popup is validated on chromium; mobile-web has separate expected absence coverage.',
    );
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
      'Proofread',
    ]) {
      await expect(popup.getByRole('button', { name: label })).toBeVisible();
    }

    await expect(popup.getByRole('button', { name: 'Translate' })).toHaveCount(0);
    await expect(popup.getByRole('button', { name: 'Speak' })).toHaveCount(0);
    await attachScenarioEvidence(page, testInfo, 'AN-ACT-01-WD-selection-actions');
  });

  test('selection search action opens sidebar search with selected text', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Desktop custom selection search flow is validated on chromium; mobile-web has separate expected absence coverage.',
    );
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
    await attachScenarioEvidence(page, testInfo, 'AN-SRCH-01-WD-selection-search');
  });

  test('annotation action opens notes tab after AI chat was active', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Desktop annotation-to-notebook flow is validated on chromium; mobile-web has separate expected absence coverage.',
    );
    await openFirstBookInReader(page);

    await page.getByRole('button', { name: 'Notebook' }).click({ force: true });
    const notebook = page.locator('.notebook-container').first();
    await expect(notebook).toBeVisible({ timeout: 10_000 });
    await notebook.getByRole('button', { name: 'AI' }).click();
    await expect(notebook.getByText('AI Chat')).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press('Escape');
    await expect(notebook).toBeHidden({ timeout: 10_000 });

    await selectFirstReaderText(page);
    const popup = page.locator('.selection-popup').first();
    const annotateButton = popup.getByRole('button', { name: 'Annotate' });
    await expect(annotateButton).toBeVisible({ timeout: 10_000 });
    await annotateButton.click();

    await expect(notebook).toBeVisible({ timeout: 10_000 });
    await expect(notebook.getByText('Notebook')).toBeVisible({ timeout: 10_000 });
    await expect(notebook.getByLabel('Add your notes here...')).toBeVisible({ timeout: 10_000 });
    await attachScenarioEvidence(page, testInfo, 'AN-NB-01-WD-notebook-notes-tab');
  });

  test('creates, edits, and deletes a note from selected reader text', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Desktop note lifecycle is validated on chromium; mobile-web has separate expected absence coverage.',
    );
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

    await attachScenarioEvidence(page, testInfo, 'AN-CRUD-01-WD-note-created');

    await noteItem.hover();
    await noteItem.getByRole('button', { name: 'Delete' }).click();
    await expect(noteItem).toBeHidden({ timeout: 10_000 });
  });

  test('mobile-web keeps custom selection popup absent for native selection handling', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(
      !['mobile-chromium', 'mobile-webkit'].includes(testInfo.project.name),
      'Mobile-web expected absence coverage only.',
    );

    await openFirstBookInReader(page);
    await selectFirstReaderText(page, 36, { waitForPopup: false });

    await expect(page.locator('.selection-popup').first()).toBeHidden({ timeout: 5_000 });
    await attachScenarioEvidence(page, testInfo, 'AN-SEL-01-MW-selection-popup-expected-absence');
  });
});
