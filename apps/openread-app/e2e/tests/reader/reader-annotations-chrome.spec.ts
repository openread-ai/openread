import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { attachScenarioEvidence } from '../../helpers/settings-contract';
import { LibraryPage } from '../../pages/LibraryPage';
import { ReaderPage } from '../../pages/ReaderPage';
import { selectFirstReaderText } from '../../helpers/select-reader-text';

const TEST_TIER_CONFIG = {
  tiers: {
    free: {
      ai_messages_per_window: 100,
      ai_window_hours: 168,
      ai_rate_limit: 5,
      ai_rate_window_hours: 5,
      ai_fallback_model: null,
      storage_gb: 1,
      library_limit: 10,
      can_tts: false,
      can_sync: true,
      can_translate: false,
      can_byok: false,
      can_boost: false,
      early_access: false,
      ai_model_tier: 'basic',
      ai_models: ['openai/gpt-oss-20b'],
      display_price_cents: 0,
      display_annual_price_cents: 0,
      display_name: 'Free',
    },
    reader: {
      ai_messages_per_window: 500,
      ai_window_hours: 168,
      ai_rate_limit: 50,
      ai_rate_window_hours: 5,
      ai_fallback_model: 'openai/gpt-oss-20b',
      storage_gb: 10,
      library_limit: null,
      can_tts: false,
      can_sync: true,
      can_translate: false,
      can_byok: true,
      can_boost: false,
      early_access: false,
      ai_model_tier: 'standard',
      ai_models: ['openai/gpt-oss-120b', 'google/gemini-2.5-flash-lite'],
      display_price_cents: 999,
      display_annual_price_cents: 9999,
      display_name: 'Reader',
    },
    pro: {
      ai_messages_per_window: 1000,
      ai_window_hours: 168,
      ai_rate_limit: 100,
      ai_rate_window_hours: 5,
      ai_fallback_model: 'openai/gpt-oss-120b',
      storage_gb: 50,
      library_limit: null,
      can_tts: false,
      can_sync: true,
      can_translate: false,
      can_byok: true,
      can_boost: false,
      early_access: true,
      ai_model_tier: 'premium',
      ai_models: ['anthropic/claude-haiku-4.5', 'openai/gpt-4.1-mini'],
      display_price_cents: 1999,
      display_annual_price_cents: 19999,
      display_name: 'Pro',
    },
  },
  regional_pricing: {},
  storage_addons: [],
  boosts: [],
  featureAliases: {},
  planCardDisplayPolicy: { free: [], reader: [], pro: [] },
  ai_budget_ceiling: 12000,
  max_agent_steps: 12,
  cost_rates: { ai_per_message: { free: 0.001, reader: 0.002, pro: 0.004 } },
};

const ANNOTATION_FIXTURE = {
  filePath: 'e2e/fixtures/books/openread-e2e-upload.txt',
  title: 'openread-e2e-upload',
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function bookLinkByTitle(page: Page, title: string) {
  return page.getByRole('link', { name: new RegExp(`Open ${escapeRegex(title)} by`, 'i') }).first();
}

async function allowFixtureImport(page: Page) {
  await page.route('**/api/tier-config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEST_TIER_CONFIG),
    });
  });
}

async function importAnnotationFixture(page: Page) {
  const importButton = page.getByTestId('import-button');
  await expect(importButton).toBeEnabled({ timeout: 30_000 });

  const fileChooserPromise = page.waitForEvent('filechooser');
  await importButton.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(ANNOTATION_FIXTURE.filePath);

  const link = bookLinkByTitle(page, ANNOTATION_FIXTURE.title);
  await expect(link).toBeVisible({ timeout: 60_000 });
  await link.click();
}

async function openFirstBookInReader(page: Page): Promise<void> {
  const library = new LibraryPage(page);
  const reader = new ReaderPage(page);

  await allowFixtureImport(page);
  await library.goto();
  await library.expectLoaded();

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
      if (
        await library
          .firstBookLink()
          .isVisible({ timeout: 1_000 })
          .catch(() => false)
      ) {
        await library.firstBookLink().click();
      } else {
        await importAnnotationFixture(page);
      }
    }
  } else if (
    await library
      .firstBookLink()
      .isVisible({ timeout: 1_000 })
      .catch(() => false)
  ) {
    await library.firstBookLink().click();
  } else {
    await importAnnotationFixture(page);
  }

  await reader.waitForReaderUrl();
  const inlineQuestionBar = reader.inlineQuestionBar();
  if (await inlineQuestionBar.isVisible({ timeout: 10_000 }).catch(() => false)) return;

  await expect(page.getByTestId('reader-content-ready')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible({
    timeout: 60_000,
  });
}

test.describe('Chromium reader annotations', () => {
  test('selects reader iframe text and exposes annotation actions', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Desktop custom selection popup is validated on chromium; mobile-web has separate responsive popup coverage.',
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

  test('mobile-web exposes the custom selection popup with Highlight for supported text', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(
      !['mobile-chromium', 'mobile-webkit'].includes(testInfo.project.name),
      'Mobile-web responsive selection popup coverage only.',
    );

    await openFirstBookInReader(page);
    await selectFirstReaderText(page, 36);

    const popup = page.locator('.selection-popup').first();
    await expect(popup).toBeVisible({ timeout: 10_000 });
    await expect(popup.getByRole('button', { name: 'Highlight' })).toBeVisible();
    await attachScenarioEvidence(page, testInfo, 'AN-SEL-01-MW-selection-popup-highlight');
  });
});
