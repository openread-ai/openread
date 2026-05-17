import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import {
  attachScenarioEvidence,
  expectAccountSettings,
  expectPreferencesSettings,
  expectSettingsShell,
} from '../../helpers/settings-contract';

async function openSettingsFromAppShell(page: Page) {
  await page.goto('/library', { waitUntil: 'domcontentloaded' });

  const profileMenu = page.getByRole('button', { name: 'Profile menu' });
  const openMenu = page.getByRole('button', { name: 'Open menu' });
  await expect(profileMenu.or(openMenu).first()).toBeVisible();

  if (await profileMenu.first().isVisible()) {
    await profileMenu.first().click();
  } else {
    await openMenu.click();

    const navigationMenu = page.getByRole('dialog', { name: 'Navigation menu' });
    await expect(navigationMenu).toBeVisible();
    await navigationMenu.getByRole('button', { name: 'Profile menu' }).click();
  }

  await page.getByRole('menuitem', { name: 'Settings' }).click();
}

test.describe('Settings navigation contract', () => {
  test('SET-001 opens Settings from authenticated UI', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.goto('/library', { waitUntil: 'domcontentloaded' });
    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-001-start-open-settings-from-authenticated-ui',
    );

    await openSettingsFromAppShell(page);
    await expectAccountSettings(page);

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-001-terminal-open-settings-from-authenticated-ui',
    );
  });

  test('SET-002 redirects bare /settings to Account Settings', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.goto('/library', { waitUntil: 'domcontentloaded' });
    await attachScenarioEvidence(page, testInfo, 'SET-002-start-settings-default-redirect');

    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await expectAccountSettings(page);

    await attachScenarioEvidence(page, testInfo, 'SET-002-terminal-settings-default-redirect');
  });

  test('SET-003 direct-load Settings tab URLs render the expected tabs', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.goto('/library', { waitUntil: 'domcontentloaded' });
    await attachScenarioEvidence(page, testInfo, 'SET-003-start-before-direct-tab-load');

    await page.goto('/settings/account', { waitUntil: 'domcontentloaded' });
    await expectAccountSettings(page);
    await attachScenarioEvidence(page, testInfo, 'SET-003-terminal-account-tab');

    await page.goto('/settings/api-keys', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/settings\/api-keys\/?$/);
    await expectSettingsShell(page);
    await expect(page.getByRole('link', { name: 'API Keys' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create API Key' })).toBeVisible();
    await attachScenarioEvidence(page, testInfo, 'SET-003-terminal-api-keys-tab');

    await page.goto('/settings/billing', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/settings\/billing\/?$/);
    await expectSettingsShell(page);
    await expect(page.getByText('Available Plans')).toBeVisible({ timeout: 30_000 });
    await attachScenarioEvidence(page, testInfo, 'SET-003-terminal-billing-tab');

    await page.goto('/settings/preferences', { waitUntil: 'domcontentloaded' });
    await expectPreferencesSettings(page);
    await attachScenarioEvidence(page, testInfo, 'SET-003-terminal-preferences-tab');
  });

  test('SET-005 switches Settings tabs by keyboard', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.goto('/settings/account', { waitUntil: 'domcontentloaded' });
    await expectAccountSettings(page);
    await attachScenarioEvidence(page, testInfo, 'SET-005-start-switch-settings-tabs-by-keyboard');

    await page.getByRole('link', { name: 'Preferences' }).focus();
    await page.keyboard.press('Enter');
    await expectPreferencesSettings(page);

    await page.getByRole('link', { name: 'Billing' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/settings\/billing\/?$/);
    await expect(page.getByText('Available Plans')).toBeVisible({ timeout: 30_000 });

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-005-terminal-switch-settings-tabs-by-keyboard',
    );
  });

  test('SET-006 signed-out Settings direct access redirects to auth', async ({
    page,
  }, testInfo) => {
    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    await attachScenarioEvidence(page, testInfo, 'SET-006-start-signed-out-settings-direct-access');

    await page.goto('/settings/account', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/auth\?redirect=\/home/);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeHidden();

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-006-terminal-signed-out-settings-direct-access',
    );
  });
});
