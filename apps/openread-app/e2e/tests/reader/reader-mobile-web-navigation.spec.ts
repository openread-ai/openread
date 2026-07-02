import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { LibraryPage } from '../../pages/LibraryPage';
import { ReaderPage } from '../../pages/ReaderPage';

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

const FIXTURES = {
  reflowable: {
    filePath: 'e2e/fixtures/books/openread-e2e-mobile-reflowable-long.txt',
    title: 'openread-e2e-mobile-reflowable-long',
  },
  fixed: {
    filePath: 'e2e/fixtures/books/openread-e2e-mobile-fixed.pdf',
    title: 'openread-e2e-mobile-fixed',
  },
};

const MOCK_AI_RESPONSE_TEXT = 'Mobile Read AI answer.';
const MOCK_AI_NDJSON = `${JSON.stringify({
  type: 'text',
  text: MOCK_AI_RESPONSE_TEXT,
})}\n`;

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

function isMobileProject(testInfo: TestInfo) {
  return testInfo.project.name.startsWith('mobile-');
}

async function openFixtureInReader(page: Page, fixture: (typeof FIXTURES)[keyof typeof FIXTURES]) {
  const library = new LibraryPage(page);
  const reader = new ReaderPage(page);

  await allowFixtureImport(page);
  await library.goto();
  await library.expectLoaded();

  let link = bookLinkByTitle(page, fixture.title);
  if (!(await link.isVisible({ timeout: 1_000 }).catch(() => false))) {
    const importButton = page.getByTestId('import-button');
    await expect(importButton).toBeEnabled({ timeout: 30_000 });

    const fileChooserPromise = page.waitForEvent('filechooser');
    await importButton.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(fixture.filePath);

    link = bookLinkByTitle(page, fixture.title);
    await expect(link).toBeVisible({ timeout: 60_000 });
  }

  const readerHref = await link.getAttribute('href');
  if (!readerHref) throw new Error(`Fixture ${fixture.title} has no reader link href`);
  await page.goto(readerHref, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await reader.waitForReaderUrl();
  await expect(page.getByTestId('reader-content-ready')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible({
    timeout: 60_000,
  });
}

async function getReaderMetrics(page: Page) {
  return page.evaluate(() => {
    const view = document.querySelector('foliate-view') as
      | (HTMLElement & { lastLocation?: { cfi?: string } })
      | null;
    const renderer = view?.shadowRoot?.querySelector(
      'foliate-paginator, foliate-fxl',
    ) as HTMLElement | null;
    const container = renderer?.shadowRoot?.getElementById('container') as HTMLElement | null;
    return {
      cfi: view?.lastLocation?.cfi ?? '',
      scrollTop: container?.scrollTop ?? 0,
      scrollHeight: container?.scrollHeight ?? 0,
      clientHeight: container?.clientHeight ?? 0,
      rendererTag: renderer?.tagName.toLowerCase() ?? '',
      marginTop: renderer?.getAttribute('margin-top') ?? '',
      marginBottom: renderer?.getAttribute('margin-bottom') ?? '',
      letterboxBackground: renderer ? getComputedStyle(renderer).backgroundColor : '',
    };
  });
}

async function simulateMobileTouch(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: start.x, y: start.y }],
    });
    for (let step = 1; step <= 6; step += 1) {
      const ratio = step / 6;
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: start.x + (end.x - start.x) * ratio,
            y: start.y + (end.y - start.y) * ratio,
          },
        ],
      });
    }
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await client.detach();
  }
}

async function dragBookContent(
  page: Page,
  start: { xRatio: number; yRatio: number },
  end: { xRatio: number; yRatio: number },
) {
  const box = await page.getByRole('document', { name: 'Book Content' }).boundingBox();
  if (!box) throw new Error('Book Content bounding box not found');
  await simulateMobileTouch(
    page,
    { x: box.x + box.width * start.xRatio, y: box.y + box.height * start.yRatio },
    { x: box.x + box.width * end.xRatio, y: box.y + box.height * end.yRatio },
  );
}

async function revealMobileHeader(page: Page) {
  const viewport = page.viewportSize() ?? { width: 390, height: 844 };
  const header = page.getByRole('group', { name: 'Header Bar' });
  if (!(await header.isVisible().catch(() => false))) {
    const sectionInfo = page.locator('.sectioninfo').first();
    if (await sectionInfo.isVisible().catch(() => false)) {
      await sectionInfo.click();
    } else {
      await page.touchscreen.tap(Math.floor(viewport.width / 2), Math.floor(viewport.height / 2));
    }
  }
  await expect(header).toBeVisible({ timeout: 10_000 });
  return header;
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: 'image/png' });

  const evidenceDir = process.env.OPENREAD_E2E_EVIDENCE_DIR;
  if (evidenceDir) {
    await mkdir(evidenceDir, { recursive: true });
    await copyFile(path, join(evidenceDir, `${name}.png`));
  }
}

async function closeMobileSheet(page: Page) {
  const sheet = page.locator('.fixed.inset-0.z-40').first();
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await sheet
    .locator('.absolute.inset-0')
    .first()
    .click({ position: { x: 8, y: 8 } });
  await expect(sheet).toBeHidden({ timeout: 10_000 });
}

async function mockAgenticChat(page: Page, options: { delayMs?: number } = {}) {
  let requestCount = 0;

  await page.route('**/api/ai/agentic-chat', async (route) => {
    requestCount += 1;
    if (options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body: MOCK_AI_NDJSON,
    });
  });

  return () => requestCount;
}

test.describe('Mobile web reader navigation regression', () => {
  test('touch scroll advances reflowable content and keeps header/menu contract', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(!isMobileProject(testInfo), 'Mobile web regression proof only.');

    await openFixtureInReader(page, FIXTURES.reflowable);
    const before = await getReaderMetrics(page);

    await dragBookContent(page, { xRatio: 0.5, yRatio: 0.75 }, { xRatio: 0.5, yRatio: 0.25 });

    await expect
      .poll(async () => (await getReaderMetrics(page)).scrollTop, {
        message: 'mobile web touch scroll should move the scrolled renderer container',
      })
      .toBeGreaterThan(before.scrollTop + 100);

    await revealMobileHeader(page);
    await expect(page.getByLabel('More Options')).toHaveCount(0);
    await page.getByTestId('mobile-reader-menu-button').press('Enter');
    const viewMenu = page.locator('.view-menu').first();
    await expect(viewMenu).toBeVisible({ timeout: 10_000 });
    await expect(viewMenu.getByText('Continuous', { exact: true }).first()).toBeHidden();
    await expect(viewMenu.getByText('Paragraph Mode', { exact: true }).first()).toBeHidden();
  });

  test('mobile web reader header title opens lightweight book info popover', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(!isMobileProject(testInfo), 'Mobile web header popover proof only.');

    await openFixtureInReader(page, FIXTURES.reflowable);
    await revealMobileHeader(page);

    const titleButton = page.getByRole('button', {
      name: `Show book information for ${FIXTURES.reflowable.title}`,
    });
    await expect(titleButton).toBeVisible({ timeout: 10_000 });
    await expect(titleButton).toHaveClass(/justify-start/);
    await attachScreenshot(page, testInfo, 'mobile-web-reader-header-title-left-aligned');

    await titleButton.click();
    const popover = page.getByTestId('mobile-reader-book-info-popover');
    await expect(popover).toBeVisible({ timeout: 10_000 });
    await expect(popover).toHaveClass(/left-1\/2/);
    await expect(popover).toHaveClass(/-translate-x-1\/2/);
    await expect(popover).toHaveClass(/top-\[calc\(env\(safe-area-inset-top\)\+3\.0625rem\)\]/);
    const headerGapPx = await page.evaluate(() => {
      const header = document.querySelector('.header-bar')?.getBoundingClientRect();
      const bookInfoPopover = document
        .querySelector('[data-testid="mobile-reader-book-info-popover"]')
        ?.getBoundingClientRect();
      if (!header || !bookInfoPopover) return null;
      return Math.round(bookInfoPopover.top - header.bottom);
    });
    expect(headerGapPx).toBeGreaterThanOrEqual(0);
    expect(headerGapPx).toBeLessThanOrEqual(8);
    await expect(popover.getByRole('heading', { name: FIXTURES.reflowable.title })).toBeVisible();
    await expect(popover.getByText('Progress', { exact: true })).toHaveCount(0);
    await expect(popover.getByText('Location', { exact: true })).toHaveCount(0);
    await expect(popover.getByText('Format', { exact: true })).toHaveCount(0);
    await expect(popover.getByText('Source', { exact: true })).toHaveCount(0);
    await attachScreenshot(page, testInfo, 'mobile-web-reader-header-title-info-popover-centered');

    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
  });

  test('mobile web standalone reader menu exposes current-book destinations and opens shared sheets', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(!isMobileProject(testInfo), 'Mobile web destination proof only.');

    await openFixtureInReader(page, FIXTURES.reflowable);

    const openMenu = async () => {
      await revealMobileHeader(page);
      await expect(page.getByTestId('mobile-reader-theme-mode-button')).toBeVisible();
      await expect(page.getByRole('button', { name: 'AI Chat' })).toHaveCount(0);
      await expect(page.getByLabel('More Options')).toHaveCount(0);
      await page.getByTestId('mobile-reader-menu-button').press('Enter');
      const viewMenu = page.locator('.view-menu').first();
      await expect(viewMenu).toBeVisible({ timeout: 10_000 });
      return viewMenu;
    };

    let viewMenu = await openMenu();
    const menuContent = page.getByTestId('mobile-reader-menu-content');
    await expect(menuContent).toHaveClass(/fixed/);
    await expect(menuContent).toHaveClass(/left-1\/2/);
    await expect(menuContent).toHaveClass(/-translate-x-1\/2/);
    await expect(menuContent).toHaveClass(/w-\[calc\(100vw-2rem\)\]/);
    await expect(menuContent).toHaveClass(/max-w-md/);

    const menuPlacement = await page.evaluate(() => {
      const dock = document
        .querySelector('[data-testid="mobile-reader-dock"]')
        ?.getBoundingClientRect();
      const menuButton = document
        .querySelector('[data-testid="mobile-reader-menu-button"]')
        ?.getBoundingClientRect();
      const menuOverlay = document
        .querySelector('[data-testid="mobile-reader-menu-content"]')
        ?.getBoundingClientRect();
      if (!dock || !menuButton || !menuOverlay) return null;
      return {
        centerDelta: Math.round(
          Math.abs(menuOverlay.left + menuOverlay.width / 2 - window.innerWidth / 2),
        ),
        dockWidthDelta: Math.round(Math.abs(menuOverlay.width - dock.width)),
        gap: Math.round(menuButton.top - menuOverlay.bottom),
      };
    });
    expect(menuPlacement).not.toBeNull();
    expect(menuPlacement?.centerDelta).toBeLessThanOrEqual(1);
    expect(menuPlacement?.dockWidthDelta).toBeLessThanOrEqual(1);
    expect(menuPlacement?.gap).toBeGreaterThanOrEqual(6);
    expect(menuPlacement?.gap).toBeLessThanOrEqual(8);

    const menuHeightContract = await page.evaluate(() => {
      const header = document.querySelector('.header-bar')?.getBoundingClientRect();
      const menuOverlay = document
        .querySelector('[data-testid="mobile-reader-menu-content"]')
        ?.getBoundingClientRect();
      const viewMenuElement = document.querySelector('.view-menu');
      if (!header || !menuOverlay || !viewMenuElement) return null;
      const styles = window.getComputedStyle(viewMenuElement);
      return {
        clientHeight: viewMenuElement.clientHeight,
        expectedMaxHeight: Math.floor(
          Math.min(window.innerHeight * 0.8, menuOverlay.bottom - header.bottom),
        ),
        maxHeight: Math.round(Number.parseFloat(styles.maxHeight)),
        overflowY: styles.overflowY,
      };
    });
    expect(menuHeightContract).not.toBeNull();
    expect(menuHeightContract?.maxHeight).toBeLessThanOrEqual(
      (menuHeightContract?.expectedMaxHeight ?? 0) + 1,
    );
    expect(menuHeightContract?.clientHeight).toBeLessThanOrEqual(
      (menuHeightContract?.maxHeight ?? 0) + 1,
    );
    expect(menuHeightContract?.overflowY).toBe('auto');

    const topLevelLabels = await viewMenu.evaluate((menu) =>
      Array.from(menu.children)
        .map((child) => {
          const labelElement = child.querySelector('summary,button');
          return (labelElement?.textContent ?? '').replace(/\s+/g, ' ').trim();
        })
        .filter(Boolean),
    );

    expect(topLevelLabels).toHaveLength(9);
    expect(topLevelLabels).toEqual([
      'Table of Contents',
      'Highlights',
      'Bookmarks',
      'AI Chat',
      'Speed Reading Mode',
      'Parallel Read',
      'Export Annotations',
      'Font & Layout',
      'Restore Reader & Theme Defaults',
      'Invert Image In Dark Mode',
    ]);
    expect(topLevelLabels).not.toContain('AI Chat History');
    expect(topLevelLabels).not.toContain('Sign in to Sync');
    expect(topLevelLabels).not.toContain('Never synced');
    expect(topLevelLabels.some((label) => label.startsWith('Synced at '))).toBe(false);
    expect(topLevelLabels.some((label) => /^(Dark|Light|Auto) Mode$/.test(label))).toBe(false);
    await attachScreenshot(page, testInfo, 'mobile-web-reader-kebab-10-options');

    await page
      .getByTestId('mobile-reader-menu-dismiss-layer')
      .click({ position: { x: 16, y: 160 } });
    await expect(page.getByTestId('mobile-reader-menu-content')).toHaveCount(0);

    viewMenu = await openMenu();
    await page.getByTestId('mobile-reader-menu-button').press('Enter');
    await expect(page.getByTestId('mobile-reader-menu-content')).toHaveCount(0);

    viewMenu = await openMenu();
    await viewMenu.getByText('Font & Layout', { exact: true }).click();
    await expect(page.getByTestId('mobile-reader-menu-content')).toHaveCount(0);
    await expect(page.getByRole('group', { name: /Font - Settings/ })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: 'Restore Defaults' })).toHaveCount(0);
    const settingsTabs = page.getByRole('group', { name: /Settings Panels - Font/ });
    await expect(settingsTabs).toBeVisible();
    await expect(settingsTabs.locator('[data-tab="Font"]')).toHaveClass(/btn-active/);
    await expect(settingsTabs.locator('[data-tab="Layout"]')).toBeVisible();
    await expect(settingsTabs.locator('[data-tab="Color"]')).toBeVisible();
    await expect(settingsTabs.locator('[data-tab="Control"]')).toHaveCount(0);
    await expect(settingsTabs.locator('[data-tab="Language"]')).toHaveCount(0);
    await expect(settingsTabs.locator('[data-tab="Custom"]')).toHaveCount(0);
    await attachScreenshot(page, testInfo, 'mobile-web-reader-kebab-font-layout-settings');
    await page.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByRole('group', { name: /Font - Settings/ })).toHaveCount(0);

    viewMenu = await openMenu();
    await viewMenu.getByText('Table of Contents', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Chapters' })).toHaveClass(/bg-base-content\/10/);
    await attachScreenshot(page, testInfo, 'mobile-web-reader-kebab-toc-sheet');
    await closeMobileSheet(page);

    viewMenu = await openMenu();
    await viewMenu.getByText('Highlights', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Highlights' })).toHaveClass(
      /bg-base-content\/10/,
    );
    await attachScreenshot(page, testInfo, 'mobile-web-reader-kebab-highlights-sheet');
    await closeMobileSheet(page);

    viewMenu = await openMenu();
    await viewMenu.getByText('Bookmarks', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Bookmarks' })).toHaveClass(
      /bg-base-content\/10/,
    );
    await attachScreenshot(page, testInfo, 'mobile-web-reader-kebab-bookmarks-sheet');
    await closeMobileSheet(page);

    viewMenu = await openMenu();
    await viewMenu.getByText('AI Chat', { exact: true }).click();
    const historySheet = page.getByTestId('mobile-read-ai-history-view');
    await expect(historySheet).toBeVisible({ timeout: 10_000 });
    await expect(historySheet.getByText('Read AI', { exact: true })).toBeVisible();
    await expect(historySheet.getByText('Recents', { exact: true })).toBeVisible();
    await expect(historySheet.getByRole('button', { name: 'New Chat' })).toHaveCount(1);
    await expect(historySheet.getByText('New Chat', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('assistant-composer')).toHaveCount(0);
    await attachScreenshot(page, testInfo, 'mobile-web-reader-kebab-chat-history-sheet');
  });

  test('mobile web Font & Layout opens appearance-scoped settings', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(!isMobileProject(testInfo), 'Mobile web settings appearance scope proof only.');

    await openFixtureInReader(page, FIXTURES.reflowable);
    await revealMobileHeader(page);
    await page.getByTestId('mobile-reader-menu-button').press('Enter');
    const viewMenu = page.locator('.view-menu').first();
    await expect(viewMenu).toBeVisible({ timeout: 10_000 });

    await page.getByRole('menuitem', { name: 'Font & Layout' }).press('Enter');
    await expect(page.getByTestId('mobile-reader-menu-content')).toHaveCount(0);
    await expect(page.getByRole('group', { name: /Font - Settings/ })).toBeVisible({
      timeout: 10_000,
    });
    const settingsTabs = page.getByRole('group', { name: /Settings Panels - Font/ });
    await expect(settingsTabs).toBeVisible();
    await expect(settingsTabs.locator('[data-tab="Font"]')).toHaveClass(/btn-active/);
    await expect(settingsTabs.locator('[data-tab="Layout"]')).toBeVisible();
    await expect(settingsTabs.locator('[data-tab="Color"]')).toBeVisible();
    await expect(settingsTabs.locator('[data-tab="Control"]')).toHaveCount(0);
    await expect(settingsTabs.locator('[data-tab="Language"]')).toHaveCount(0);
    await expect(settingsTabs.locator('[data-tab="Custom"]')).toHaveCount(0);
    await attachScreenshot(page, testInfo, 'mobile-web-reader-kebab-font-layout-settings');
  });

  test('mobile web reader menu remains available when AI is disabled', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(!isMobileProject(testInfo), 'Mobile web AI-disabled menu proof only.');

    const setAIEnabledThroughSettings = async (enabled: boolean) => {
      await page.goto('/settings/preferences', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const toggle = page.getByTestId('ai-enabled-toggle');
      await expect(toggle).toBeVisible({ timeout: 30_000 });
      if ((await toggle.isChecked()) !== enabled) {
        await toggle.click();
        await expect(toggle).toBeChecked({ checked: enabled });
      }
    };

    await setAIEnabledThroughSettings(false);
    try {
      await openFixtureInReader(page, FIXTURES.reflowable);
      await expect(page.getByTestId('mobile-ai-inline-composer-input')).toHaveCount(0);
      const header = await revealMobileHeader(page);
      await header.getByLabel('More Options').click();
      const viewMenu = page.locator('.view-menu').first();
      await expect(viewMenu).toBeVisible({ timeout: 10_000 });
      await expect(viewMenu.getByText('Table of Contents', { exact: true })).toBeVisible();
      await expect(viewMenu.getByText('Highlights', { exact: true })).toBeVisible();
      await expect(viewMenu.getByText('Bookmarks', { exact: true })).toBeVisible();
      await attachScreenshot(page, testInfo, 'mobile-web-ai-disabled-header-menu-fallback');
    } finally {
      await setAIEnabledThroughSettings(true).catch(() => undefined);
    }
  });

  test('mobile web AI composer sends into one unified composer sheet', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(!isMobileProject(testInfo), 'Mobile web AI composer contract only.');

    const getAgenticChatRequestCount = await mockAgenticChat(page, { delayMs: 1_200 });
    await openFixtureInReader(page, FIXTURES.reflowable);

    const inlineComposer = page.getByTestId('mobile-ai-inline-composer-input');
    await expect(inlineComposer).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('mobile-ai-inline-composer-send')).toHaveCount(0);
    await expect(page.getByTestId('mobile-reader-menu-button')).toBeVisible();
    await attachScreenshot(page, testInfo, 'mobile-web-ai-unified-composer-empty');

    await inlineComposer.fill('Line one\nLine two\nLine three\nLine four\nLine five\nLine six');
    await expect(page.getByTestId('mobile-ai-inline-composer-send')).toBeVisible();
    const textareaMetrics = await inlineComposer.evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      return {
        scrollHeight: textarea.scrollHeight,
        clientHeight: textarea.clientHeight,
        overflowY: getComputedStyle(textarea).overflowY,
      };
    });
    expect(textareaMetrics.scrollHeight).toBeGreaterThanOrEqual(textareaMetrics.clientHeight);
    await attachScreenshot(page, testInfo, 'mobile-web-ai-unified-multiline-threshold');

    await inlineComposer.fill('What is this book about?');
    await page.getByTestId('mobile-ai-inline-composer-send').click();

    await expect(page.getByText('Read AI', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('What is this book about?')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('assistant-composer-inline-cancel')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('mobile-ai-inline-composer-input')).toHaveCount(0);
    const unifiedSurface = page.locator('[data-openread-mobile-read-ai-unified-surface]').first();
    await expect(unifiedSurface).toBeVisible();
    const assistantComposer = page.getByTestId('assistant-composer');
    await expect(assistantComposer).toHaveCount(1);
    await expect(page.locator('[data-openread-mobile-read-ai-integrated-composer]')).toBeVisible();
    await expect(unifiedSurface.locator('[data-testid="assistant-composer"]')).toHaveCount(1);
    await expect(page.locator('[data-openread-mobile-read-ai-composer-frame]')).toHaveCount(1);
    await attachScreenshot(page, testInfo, 'mobile-web-ai-unified-running');

    await expect(page.getByText(MOCK_AI_RESPONSE_TEXT)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('assistant-composer-inline-cancel')).toBeHidden();
    const agenticChatRequestsAfterInitialResponse = getAgenticChatRequestCount();
    expect(agenticChatRequestsAfterInitialResponse).toBeGreaterThan(0);
    await expect(page.getByText('Recents', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close Read AI' })).toBeVisible();
    const compactActiveHeaderMetrics = await page
      .getByTestId('mobile-read-ai-header')
      .evaluate((header) => ({
        headerClass: header.className,
        titleClass: header.querySelector('span.text-base-content')?.className,
        logoClass: header.querySelector('img')?.parentElement?.className,
      }));
    await expect(
      page.getByText(/messages left (today|this week|this month|this window)/),
    ).toHaveCount(0);

    const completedComposerBox = await page
      .locator('[data-openread-mobile-read-ai-integrated-composer]')
      .first()
      .boundingBox();
    const responseBox = await page.getByText(MOCK_AI_RESPONSE_TEXT).first().boundingBox();
    const surfaceBox = await unifiedSurface.boundingBox();
    expect(completedComposerBox).not.toBeNull();
    expect(responseBox).not.toBeNull();
    expect(surfaceBox).not.toBeNull();
    expect(completedComposerBox!.y + completedComposerBox!.height).toBeLessThanOrEqual(
      surfaceBox!.y + surfaceBox!.height + 1,
    );
    expect(responseBox!.y + responseBox!.height).toBeLessThan(completedComposerBox!.y);
    await attachScreenshot(page, testInfo, 'mobile-web-ai-unified-sheet-response');

    const handle = page.locator('.cursor-grab').first();
    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();
    await simulateMobileTouch(
      page,
      { x: handleBox!.x + handleBox!.width / 2, y: handleBox!.y + handleBox!.height / 2 },
      { x: handleBox!.x + handleBox!.width / 2, y: Math.max(40, handleBox!.y - 180) },
    );
    const expandedActiveChat = page.getByTestId('mobile-read-ai-expanded-active-chat');
    await expect(expandedActiveChat).toBeVisible({ timeout: 10_000 });
    const expandedViewport = page.viewportSize();
    expect(expandedViewport).not.toBeNull();
    await expect
      .poll(async () => (await unifiedSurface.boundingBox())?.height ?? 0, {
        message: 'expanded mobile-web Read AI surface should fill the viewport',
      })
      .toBeGreaterThan(expandedViewport!.height * 0.9);
    const expandedActiveHeader = expandedActiveChat.getByTestId('mobile-read-ai-expanded-header');
    await expect(expandedActiveHeader).toBeVisible();
    const expandedActiveHeaderMetrics = await expandedActiveHeader.evaluate((header) => ({
      headerClass: header.className,
      titleClass: header.querySelector('span.text-base-content')?.className,
      logoClass: header.querySelector('img')?.parentElement?.className,
    }));
    expect(expandedActiveHeaderMetrics).toEqual(compactActiveHeaderMetrics);
    await expect(expandedActiveChat.getByRole('button', { name: 'Chat history' })).toBeVisible();
    await expect(expandedActiveChat.getByRole('button', { name: 'New Chat' })).toHaveCount(1);
    await expect(expandedActiveChat.getByText('New Chat', { exact: true })).toHaveCount(0);
    await expect(expandedActiveChat.getByText('Recents', { exact: true })).toHaveCount(0);
    await expect(expandedActiveChat.getByText(MOCK_AI_RESPONSE_TEXT)).toBeVisible();
    await attachScreenshot(page, testInfo, 'mobile-web-ai-unified-expanded-active-chat');

    await page.getByRole('button', { name: 'Chat history' }).click();
    const historyView = page.getByTestId('mobile-read-ai-history-view');
    await expect(historyView).toBeVisible({ timeout: 10_000 });
    const expandedHistoryHeader = historyView.getByTestId('mobile-read-ai-expanded-header');
    await expect(expandedHistoryHeader).toBeVisible();
    const historyHeaderBox = await expandedHistoryHeader.boundingBox();
    const expandedSurfaceBox = await unifiedSurface.boundingBox();
    expect(historyHeaderBox).not.toBeNull();
    expect(expandedSurfaceBox).not.toBeNull();
    expect(historyHeaderBox!.y).toBeGreaterThanOrEqual(expandedSurfaceBox!.y - 1);
    expect(historyHeaderBox!.y + historyHeaderBox!.height).toBeLessThanOrEqual(
      expandedSurfaceBox!.y + expandedSurfaceBox!.height,
    );
    await expect(historyView.getByText('Recents', { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(historyView.getByRole('button', { name: 'New Chat' })).toHaveCount(1);
    await expect(historyView.getByText('New Chat', { exact: true })).toHaveCount(0);
    await expect(historyView.getByTestId('assistant-composer')).toHaveCount(0);
    await attachScreenshot(page, testInfo, 'mobile-web-ai-unified-explicit-history-view');

    await page.getByRole('button', { name: 'Back to chat' }).click();
    await expect(expandedActiveChat).toBeVisible({ timeout: 10_000 });
    await expect(expandedActiveChat.getByText('Recents', { exact: true })).toHaveCount(0);
    await expect(expandedActiveChat.getByText(MOCK_AI_RESPONSE_TEXT)).toBeVisible();
    await attachScreenshot(page, testInfo, 'mobile-web-ai-unified-back-to-expanded-active-chat');

    await page.getByRole('button', { name: 'New Chat' }).first().click();
    await page.waitForTimeout(500);
    expect(getAgenticChatRequestCount()).toBe(agenticChatRequestsAfterInitialResponse);
    const newChatComposerBox = await page.getByTestId('assistant-composer').boundingBox();
    const newChatSurfaceBox = await unifiedSurface.boundingBox();
    expect(newChatComposerBox).not.toBeNull();
    expect(newChatSurfaceBox).not.toBeNull();
    expect(newChatComposerBox!.width).toBeGreaterThan(newChatSurfaceBox!.width * 0.75);
    expect(newChatComposerBox!.x).toBeGreaterThanOrEqual(newChatSurfaceBox!.x - 1);
    expect(newChatComposerBox!.x + newChatComposerBox!.width).toBeLessThanOrEqual(
      newChatSurfaceBox!.x + newChatSurfaceBox!.width + 1,
    );
    await attachScreenshot(page, testInfo, 'mobile-web-ai-unified-new-chat');
  });

  test('mobile web AI composer does not replay inline prompt after New Chat remount', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(!isMobileProject(testInfo), 'Mobile web AI composer contract only.');

    const getAgenticChatRequestCount = await mockAgenticChat(page);
    await openFixtureInReader(page, FIXTURES.reflowable);

    const inlineComposer = page.getByTestId('mobile-ai-inline-composer-input');
    await expect(inlineComposer).toBeVisible({ timeout: 10_000 });
    await inlineComposer.fill('What is this book about?');
    await page.getByTestId('mobile-ai-inline-composer-send').click();

    await expect(page.getByText('Read AI', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(() => getAgenticChatRequestCount(), {
        message: 'inline prompt must be consumed exactly once before remount checks',
        timeout: 10_000,
      })
      .toBe(1);

    await page.getByRole('button', { name: 'New Chat' }).first().click();
    await page.waitForTimeout(500);
    expect(getAgenticChatRequestCount()).toBe(1);
    await expect(
      page.locator('[data-message-role="user"]').filter({ hasText: 'What is this book about?' }),
      'New Chat remount must not attach the inline prompt to the new active conversation',
    ).toHaveCount(0);

    await closeMobileSheet(page);
    await revealMobileHeader(page);
    await page.getByTestId('mobile-reader-menu-button').press('Enter');
    const viewMenu = page.locator('.view-menu').first();
    await expect(viewMenu).toBeVisible({ timeout: 10_000 });
    await viewMenu.getByText('AI Chat', { exact: true }).click();
    await page
      .getByRole('button', { name: /What is this book about\?/ })
      .first()
      .click();
    await page.waitForTimeout(500);
    expect(getAgenticChatRequestCount()).toBe(1);
  });

  test('repeated touch scroll advances reflowable reader position', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(!isMobileProject(testInfo), 'Mobile web regression proof only.');

    await openFixtureInReader(page, FIXTURES.reflowable);
    const before = await getReaderMetrics(page);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await dragBookContent(page, { xRatio: 0.5, yRatio: 0.75 }, { xRatio: 0.5, yRatio: 0.2 });
      await page.waitForTimeout(150);
    }

    await expect
      .poll(async () => (await getReaderMetrics(page)).scrollTop, {
        message: 'repeated touch scroll should advance the reader position',
        timeout: 15_000,
      })
      .toBeGreaterThan(before.scrollTop + 500);
  });

  test('fixed-layout horizontal swipe remains on page navigation path', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(!isMobileProject(testInfo), 'Mobile web regression proof only.');

    await openFixtureInReader(page, FIXTURES.fixed);
    await expect(page.locator('.sectioninfo')).toHaveCount(0);
    await expect(page.locator('.progressinfo')).toHaveCount(0);
    await expect
      .poll(async () => {
        const { marginTop, marginBottom, letterboxBackground } = await getReaderMetrics(page);
        return `${marginTop}|${marginBottom}|${letterboxBackground}`;
      })
      .toBe('0px|0px|rgb(255, 255, 255)');
    const dockMask = page.getByTestId('mobile-reader-dock-occlusion-mask');
    await expect(dockMask).toBeVisible({ timeout: 10_000 });
    const dockMaskContract = await page.evaluate(() => {
      const dock = document
        .querySelector('[data-testid="mobile-reader-dock"]')
        ?.getBoundingClientRect();
      const mask = document
        .querySelector('[data-testid="mobile-reader-dock-occlusion-mask"]')
        ?.getBoundingClientRect();
      const renderer = document
        .querySelector('foliate-view')
        ?.shadowRoot?.querySelector('foliate-paginator, foliate-fxl') as HTMLElement | null;
      const maskElement = document.querySelector(
        '[data-testid="mobile-reader-dock-occlusion-mask"]',
      ) as HTMLElement | null;
      if (!dock || !mask || !renderer || !maskElement) return null;
      return {
        coversDock: mask.left <= dock.left && mask.right >= dock.right && mask.top <= dock.top,
        maskBackground: getComputedStyle(maskElement).backgroundColor,
        rendererBackground: getComputedStyle(renderer).backgroundColor,
      };
    });
    expect(dockMaskContract).toMatchObject({
      coversDock: true,
      maskBackground: 'rgb(255, 255, 255)',
      rendererBackground: 'rgb(255, 255, 255)',
    });
    await attachScreenshot(page, testInfo, 'mobile-web-fixed-layout-dock-edge-mask');
    await attachScreenshot(page, testInfo, 'mobile-web-fixed-layout-zero-edge-bars');
    const before = await getReaderMetrics(page);

    await dragBookContent(page, { xRatio: 0.85, yRatio: 0.5 }, { xRatio: 0.15, yRatio: 0.5 });

    await expect
      .poll(async () => (await getReaderMetrics(page)).cfi, {
        message: 'fixed-layout horizontal swipe should change page/location',
        timeout: 15_000,
      })
      .not.toBe(before.cfi);
  });

  test('desktop web footer page navigation remains unaffected', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(isMobileProject(testInfo), 'Desktop unaffected proof only.');

    await openFixtureInReader(page, FIXTURES.reflowable);
    const before = await getReaderMetrics(page);
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
    await page.mouse.move(Math.floor(viewport.width / 2), viewport.height - 8);

    const footer = page.getByRole('group', { name: 'Footer Bar' });
    await expect(footer).toBeVisible({ timeout: 10_000 });
    await footer.getByRole('button', { name: 'Next Page' }).first().click();

    await expect
      .poll(async () => (await getReaderMetrics(page)).cfi, {
        message: 'desktop page navigation should still advance location',
        timeout: 15_000,
      })
      .not.toBe(before.cfi);
  });
});
