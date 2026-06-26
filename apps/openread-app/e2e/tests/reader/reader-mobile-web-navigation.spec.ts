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

    const header = await revealMobileHeader(page);
    await header.getByLabel('More Options').click();
    const viewMenu = page.locator('.view-menu').first();
    await expect(viewMenu).toBeVisible({ timeout: 10_000 });
    await expect(viewMenu.getByText('Continuous', { exact: true }).first()).toBeHidden();
    await expect(viewMenu.getByText('Paragraph Mode', { exact: true }).first()).toBeHidden();
  });

  test('mobile web kebab exposes current-book destinations and opens shared sheets', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(!isMobileProject(testInfo), 'Mobile web destination proof only.');

    await openFixtureInReader(page, FIXTURES.reflowable);

    const openMenu = async () => {
      const header = await revealMobileHeader(page);
      await header.getByLabel('More Options').click();
      const viewMenu = page.locator('.view-menu').first();
      await expect(viewMenu).toBeVisible({ timeout: 10_000 });
      return viewMenu;
    };

    let viewMenu = await openMenu();
    const topLevelLabels = await viewMenu.evaluate((menu) =>
      Array.from(menu.children).map((child) => {
        const labelElement = child.querySelector('summary,button');
        return (labelElement?.textContent ?? '').replace(/\s+/g, ' ').trim();
      }),
    );

    expect(topLevelLabels).toHaveLength(12);
    expect(topLevelLabels.slice(0, 9)).toEqual([
      'Table of Contents',
      'Highlights',
      'Bookmarks',
      'AI Chat History',
      'Speed Reading Mode',
      'Parallel Read',
      'Export Annotations',
      'Sort TOC by Page',
      'Reload PageShift+R',
    ]);
    expect(topLevelLabels[9]).toMatch(/^(Sign in to Sync|Synced at|Never synced)/);
    expect(topLevelLabels[10]).toMatch(/^(Dark|Light|Auto) Mode$/);
    expect(topLevelLabels[11]).toBe('Invert Image In Dark Mode');
    await attachScreenshot(page, testInfo, 'mobile-web-reader-kebab-12-options');

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
    await viewMenu.getByText('AI Chat History', { exact: true }).click();
    await expect(page.getByText('Recents', { exact: true })).toBeVisible({ timeout: 10_000 });
    await attachScreenshot(page, testInfo, 'mobile-web-reader-kebab-chat-history-sheet');
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
