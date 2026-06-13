import type { Locator, Page, TestInfo } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { LibraryPage } from '../../pages/LibraryPage';
import { ReaderPage } from '../../pages/ReaderPage';

const FIXTURES = {
  reflowable: {
    id: 'catalog:cf96aa45-45af-465f-8113-c6fb63883cca',
    title: 'Moby Dick',
  },
  fixed: {
    id: 'catalog:20adfb1a-2e44-4660-8252-80e4d681e002',
    title: 'Nuclear Power',
  },
};

function isMobileProject(testInfo: TestInfo) {
  return testInfo.project.name.startsWith('mobile-');
}

async function openFixtureInReader(page: Page, fixture: (typeof FIXTURES)[keyof typeof FIXTURES]) {
  const library = new LibraryPage(page);
  const reader = new ReaderPage(page);

  await library.goto();
  await library.expectBooksVisible();

  const link = page.locator(`a[href*="${fixture.id}"]`).first();
  await expect(link, `${fixture.title} fixture should be visible in the QA library`).toBeVisible({
    timeout: 60_000,
  });

  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith('/reader'), { timeout: 30_000 }),
    link.click({ force: true }),
  ]);

  await reader.waitForReaderUrl();
  await expect(page.getByTestId('reader-content-ready')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible({
    timeout: 60_000,
  });
}

async function revealHeader(page: Page) {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.move(Math.floor(viewport.width / 2), 12);
  const header = page.getByRole('group', { name: 'Header Bar' });
  await expect(header).toBeVisible({ timeout: 10_000 });
  return header;
}

async function openViewMenu(page: Page, testInfo: TestInfo) {
  const header = await revealHeader(page);
  await header.getByLabel(isMobileProject(testInfo) ? 'More Options' : 'View Options').click();
  const viewMenu = page.locator('.view-menu').first();
  await expect(viewMenu).toBeVisible({ timeout: 10_000 });
  return viewMenu;
}

async function expectMenuItemDisabled(menu: Locator, label: string) {
  await expect(menu.getByText(label, { exact: true }).first()).toBeVisible();
  await expect
    .poll(async () => menuItemDisabled(menu, label), { message: `${label} should be disabled` })
    .toBe(true);
}

async function expectMenuItemEnabled(menu: Locator, label: string) {
  await expect(menu.getByText(label, { exact: true }).first()).toBeVisible();
  await expect
    .poll(async () => menuItemDisabled(menu, label), { message: `${label} should be enabled` })
    .toBe(false);
}

async function menuItemDisabled(menu: Locator, label: string) {
  return menu
    .getByText(label, { exact: true })
    .first()
    .evaluate((node) => {
      const button = node.closest('button');
      return Boolean(button?.disabled || button?.classList.contains('btn-disabled'));
    });
}

async function openDesktopControlPanel(page: Page, testInfo: TestInfo) {
  const viewMenu = await openViewMenu(page, testInfo);
  await viewMenu.getByRole('menuitem', { name: /Font & Layout/ }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.locator('button[title="Behavior"]').click();
  await expect(dialog.getByText('Continuous Scroll')).toBeVisible({ timeout: 10_000 });
  return dialog;
}

async function expectControlToggleDisabled(panel: Locator, label: string, disabled: boolean) {
  const input = panel
    .getByText(label, { exact: true })
    .locator('xpath=ancestor::*[contains(@class, "config-item")][1]//input')
    .first();
  if (disabled) {
    await expect(input).toBeDisabled();
  } else {
    await expect(input).toBeEnabled();
  }
}

test.describe('Reader fixed-layout vs reflowable contract', () => {
  test('keeps reflowable reader controls enabled and fixed-layout controls absent', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await openFixtureInReader(page, FIXTURES.reflowable);

    const viewMenu = await openViewMenu(page, testInfo);
    await expectMenuItemEnabled(viewMenu, 'Scrolled Mode');
    await expectMenuItemEnabled(viewMenu, 'Paragraph Mode');
    await expectMenuItemEnabled(viewMenu, 'Speed Reading Mode');
    await expect(viewMenu.locator('[title="Fit Page"]')).toBeHidden();
    await expect(viewMenu.locator('[title="Fit Width"]')).toBeHidden();
  });

  test('exposes fixed-layout zoom controls and disables unsupported reader modes', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await openFixtureInReader(page, FIXTURES.fixed);

    const viewMenu = await openViewMenu(page, testInfo);
    for (const label of ['Scrolled Mode', 'Paragraph Mode', 'Speed Reading Mode']) {
      await expectMenuItemDisabled(viewMenu, label);
    }
    for (const title of [
      'Zoom Out',
      'Reset Zoom',
      'Zoom In',
      'Single Page',
      'Auto Spread',
      'Fit Page',
      'Fit Width',
    ]) {
      await expect(viewMenu.locator(`[title="${title}"]`).first()).toBeVisible();
    }
  });

  test('gates scroll settings by format on the desktop settings surface', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(isMobileProject(testInfo), 'Mobile web uses the simplified Settings sheet instead.');

    await openFixtureInReader(page, FIXTURES.reflowable);
    let controlPanel = await openDesktopControlPanel(page, testInfo);
    await expectControlToggleDisabled(controlPanel, 'Scrolled Mode', false);
    await expectControlToggleDisabled(controlPanel, 'Continuous Scroll', false);

    await openFixtureInReader(page, FIXTURES.fixed);
    controlPanel = await openDesktopControlPanel(page, testInfo);
    await expectControlToggleDisabled(controlPanel, 'Scrolled Mode', true);
    await expectControlToggleDisabled(controlPanel, 'Continuous Scroll', true);
  });
});
