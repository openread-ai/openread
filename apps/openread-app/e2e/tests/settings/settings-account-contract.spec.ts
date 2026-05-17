import { expect, test } from '../../fixtures';
import { TEST_USER } from '../../fixtures/test-users';
import {
  attachScenarioEvidence,
  attachViewportEvidence,
  expectAccountSettings,
  setScenarioEvidenceNote,
} from '../../helpers/settings-contract';

type Page = import('@playwright/test').Page;

async function openAccount(page: Page) {
  await page.goto('/settings/account');
  await expectAccountSettings(page);
}

async function mockProfileUpdate(page: Page, fullName: string) {
  const submittedNames: string[] = [];

  await page.route('**/auth/v1/user**', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue();
      return;
    }

    const requestBody = route.request().postDataJSON() as { data?: { full_name?: string } };
    if (requestBody.data?.full_name) submittedNames.push(requestBody.data.full_name);

    await route.fulfill({
      json: {
        user: {
          id: 'openread-qa-user',
          aud: 'authenticated',
          role: 'authenticated',
          email: TEST_USER.email,
          user_metadata: { full_name: fullName, display_name: fullName },
          app_metadata: { provider: 'email' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
    });
  });

  return { submittedNames };
}

async function mockProfileUpdateFailure(page: Page) {
  await page.route('**/auth/v1/user**', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 500,
      json: { error: 'Mock profile update failure' },
    });
  });
}

async function mockSyncReconcile(page: Page, outcome: 'success' | 'error') {
  await page.route('**/sync**', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    if (outcome === 'error') {
      await route.fulfill({ status: 500, json: { error: 'Mock sync failure' } });
      return;
    }

    await route.fulfill({ json: { reconcile: { upsert: [], remove: [] } } });
  });
}

async function enableSyncAndGetButton(page: Page) {
  const syncToggle = page.getByLabel('Enable Sync');
  if (!(await syncToggle.isChecked())) await syncToggle.click({ force: true });
  await expect(syncToggle).toBeChecked();

  const syncButton = page.getByRole('button', { name: 'Sync Now' });
  await expect(syncButton).toBeEnabled({ timeout: 30_000 });
  return syncButton;
}

test.describe('Settings account contract', () => {
  test('SET-007 displays authenticated profile details', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await openAccount(page);
    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-007-start-profile-loading-and-read-only-display',
    );

    await expect(page.locator('main').getByText(TEST_USER.email).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit Profile' })).toBeVisible();

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-007-terminal-profile-loading-and-read-only-display',
    );
  });

  test('SET-008 cancels profile editing without saving', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await openAccount(page);

    await page.getByRole('button', { name: 'Edit Profile' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit Profile' })).toBeVisible();
    await page.getByLabel('Full Name').fill('OpenRead QA Cancelled Name');
    await setScenarioEvidenceNote(page, 'SET-008 start', [
      'Edit Profile dialog is open.',
      'Draft name is changed but not saved yet.',
    ]);
    await attachViewportEvidence(page, testInfo, 'SET-008-start-edit-profile-cancel');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit Profile' })).toBeHidden();
    await expect(page.getByText('OpenRead QA Cancelled Name')).toHaveCount(0);
    await setScenarioEvidenceNote(page, 'SET-008 terminal', [
      'Cancel closed the Edit Profile dialog.',
      'Draft name is absent from the Account page.',
    ]);

    await attachViewportEvidence(page, testInfo, 'SET-008-terminal-edit-profile-cancel');
  });

  test('SET-009 saves edited profile details', async ({ authenticatedPage: page }, testInfo) => {
    const updatedName = `OpenRead QA ${testInfo.project.name} Saved`;
    await mockProfileUpdate(page, updatedName);
    await openAccount(page);
    await attachScenarioEvidence(page, testInfo, 'SET-009-start-edit-profile-save-success');

    await page.getByRole('button', { name: 'Edit Profile' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit Profile' })).toBeVisible();
    await page.getByLabel('Full Name').fill(updatedName);
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page.getByRole('dialog', { name: 'Edit Profile' })).toBeHidden();
    await expect(page.getByText('Profile updated')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit Profile' })).toBeVisible();

    await attachScenarioEvidence(page, testInfo, 'SET-009-terminal-edit-profile-save-success');
  });

  test('SET-010 keeps profile dialog recoverable when saving fails', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await mockProfileUpdateFailure(page);
    await openAccount(page);
    await attachScenarioEvidence(page, testInfo, 'SET-010-start-edit-profile-save-failure');

    await page.getByRole('button', { name: 'Edit Profile' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit Profile' });
    await expect(dialog).toBeVisible();
    await page.getByLabel('Full Name').fill('OpenRead QA Failed Name');
    await dialog.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page.getByText('Failed to update profile')).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
    await expect(page.locator('main').getByText('OpenRead QA Failed Name')).toHaveCount(0);

    await attachScenarioEvidence(page, testInfo, 'SET-010-terminal-edit-profile-save-failure');
  });

  test('SET-012 renders cloud storage usage state and breakdown surface', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await openAccount(page);
    await attachScenarioEvidence(page, testInfo, 'SET-012-start-storage-usage-and-breakdown');

    await expect(page.getByText('Cloud Storage').first()).toBeVisible();
    await expect(
      page
        .getByText(/GB|used|Storage usage is unavailable|Failed to load storage information/i)
        .first(),
    ).toBeVisible({ timeout: 20_000 });

    await attachScenarioEvidence(page, testInfo, 'SET-012-terminal-storage-usage-and-breakdown');
  });

  test('SET-018 toggles Sync preference off and on', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await openAccount(page);
    await attachScenarioEvidence(page, testInfo, 'SET-018-start-sync-toggle-off-on-persistence');

    const syncToggle = page.getByLabel('Enable Sync');
    await expect(syncToggle).toBeVisible();
    const initiallyChecked = await syncToggle.isChecked();
    await syncToggle.click({ force: true });
    await expect(syncToggle).toBeChecked({ checked: !initiallyChecked });
    await syncToggle.click({ force: true });
    await expect(syncToggle).toBeChecked({ checked: initiallyChecked });

    await attachScenarioEvidence(page, testInfo, 'SET-018-terminal-sync-toggle-off-on-persistence');
  });

  test('SET-019 runs Sync Now successfully', async ({ authenticatedPage: page }, testInfo) => {
    await mockSyncReconcile(page, 'success');
    await openAccount(page);
    await attachScenarioEvidence(page, testInfo, 'SET-019-start-sync-now-success');

    const syncButton = await enableSyncAndGetButton(page);
    await syncButton.click();

    await expect(page.getByText('Synced').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Last synced')).toBeVisible();

    await attachScenarioEvidence(page, testInfo, 'SET-019-terminal-sync-now-success');
  });

  test('SET-020 shows Sync Now error state', async ({ authenticatedPage: page }, testInfo) => {
    await mockSyncReconcile(page, 'error');
    await openAccount(page);
    await attachScenarioEvidence(page, testInfo, 'SET-020-start-sync-now-error');

    const syncButton = await enableSyncAndGetButton(page);
    await syncButton.click();

    await expect(page.getByText('Error').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Mock sync failure/)).toBeVisible();

    await attachScenarioEvidence(page, testInfo, 'SET-020-terminal-sync-now-error');
  });

  test('SET-022 cancels Delete Account confirmation', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await openAccount(page);

    await page.getByRole('button', { name: 'Delete Account' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await setScenarioEvidenceNote(page, 'SET-022 start', [
      'Delete Account confirmation dialog is visible.',
      'Cancel action is available before any destructive action.',
    ]);
    await attachViewportEvidence(page, testInfo, 'SET-022-start-delete-account-cancel');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect(page).toHaveURL(/\/settings\/account\/?$/);
    await expect(page.getByRole('button', { name: 'Delete Account' })).toBeVisible();
    await setScenarioEvidenceNote(page, 'SET-022 terminal', [
      'Cancel closed the destructive dialog.',
      'Account Settings remains usable with Delete Account still visible.',
    ]);

    await attachViewportEvidence(page, testInfo, 'SET-022-terminal-delete-account-cancel');
  });

  test('SET-024 keeps account intact when Delete Account fails', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.route('**/user/delete', async (route) => {
      await route.fulfill({ status: 500, json: { error: 'Mock delete failure' } });
    });
    await openAccount(page);
    await attachScenarioEvidence(page, testInfo, 'SET-024-start-delete-account-failure');

    await page.getByRole('button', { name: 'Delete Account' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete Account' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText('Failed to delete account')).toBeVisible();
    await expect(page.locator('main').getByText(TEST_USER.email).first()).toBeVisible();

    await attachScenarioEvidence(page, testInfo, 'SET-024-terminal-delete-account-failure');
  });

  test('SET-023 deletes account through confirmation and returns to signed-out surface', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.route('**/user/delete', async (route) => {
      await route.fulfill({ json: { success: true } });
    });
    await page.route('**/auth/v1/logout**', async (route) => {
      await route.fulfill({ status: 204, body: '' });
    });
    await openAccount(page);

    await page.getByRole('button', { name: 'Delete Account' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await setScenarioEvidenceNote(page, 'SET-023 start', [
      'Delete Account confirmation dialog is visible for the disposable account flow.',
      'The destructive confirmation button is visible before confirming.',
    ]);
    await attachViewportEvidence(page, testInfo, 'SET-023-start-delete-account-success');

    await dialog.getByRole('button', { name: 'Delete Account' }).click();

    await expect(page).toHaveURL(/\/(library|auth|login|sign-in)(\/|$|\?)/, { timeout: 15_000 });
    await expect(page.getByText(TEST_USER.email)).toHaveCount(0);
    await setScenarioEvidenceNote(page, 'SET-023 terminal', [
      'Successful delete flow reached a signed-out/safe route.',
      'The deleted account email is absent from the terminal surface.',
    ]);

    await attachViewportEvidence(page, testInfo, 'SET-023-terminal-delete-account-success');
  });
});
